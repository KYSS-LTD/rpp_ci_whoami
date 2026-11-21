// Система клиентов (задачи 5.3, 5.4, 5.5): приходы по расписанию, столы и рассадка, очередь на улице, заказы, терпение двух
// фаз, еда и уход. Реализует CustomerSystem (и OrderBoard) из contracts.ts. Клиенты ходят через NavSystem: к месту в очереди
// и к столу идут по навигации, на стул переносятся мгновенно (teleport), уходя, идут к выходу и исчезают.
// Фазы терпения (design D8): A - группа без стола (очередь), её таймер один на группу; B - клиент за столом от заказа до подачи.
// Истечение любого таймера шлёт patienceExpired один раз, после этого система замирает (смена переходит в failed).
// Модуль не знает о DOM и three. Владелец: SONNET-1.
import type {
	CustomerDeps,
	CustomerId,
	CustomerPhase,
	CustomerSnapshot,
	CustomerSystem,
	DishId,
	EventSink,
	FailureInfo,
	GroupId,
	NavAgent,
	Order,
	OrderId,
	OrderSnapshot,
	QueueGroupSnapshot,
	ScheduledGroup,
	TableConfig,
	TableSnapshot,
	Vec2,
} from "../../contracts";
import { debugLog } from "../../config/debug";
import { planSeating, seatIndexForMember } from "./seating";

// Допуск при сравнении времени (накопленная погрешность вещественных чисел).
const TIME_EPSILON_SEC = 1e-9;

// Смещение между членами группы в момент появления, чтобы агенты не стояли в одной точке (расталкивание не терпит нулевого расстояния).
const SPAWN_SPREAD_STEP = 0.1;

// Клиент во время игры.
interface CustomerRuntime {
	id: CustomerId;
	groupId: GroupId;
	variant: number;
	dish: DishId;
	// Порядковый номер в группе, с нуля.
	memberIndex: number;
	agent: NavAgent;
	phase: CustomerPhase;
	// Индекс стола в LevelConfig.tables и место за ним (после назначения стола).
	tableIndex: number | null;
	seatIndex: number | null;
	// Куда агент должен прийти сейчас (для проверки прибытия и повторной отправки).
	target: Vec2 | null;
	isSeated: boolean;
	order: Order | null;
	// Сколько секунд клиенту осталось есть (после подачи).
	eatLeftSec: number;
	dishOnTable: boolean;
}

// Статус группы: waiting - стола нет (очередь), walking - стол назначен, идут к нему, seated - все сели и заказали, done - доели.
type GroupStatus = "waiting" | "walking" | "seated" | "done";

// Группа клиентов во время игры.
interface GroupRuntime {
	id: GroupId;
	arrivalSec: number;
	size: number;
	members: CustomerRuntime[];
	status: GroupStatus;
	// Слот очереди (для status waiting), null, пока слот не назначен.
	slotIndex: number | null;
	// Объявлено ли событие groupQueued (один раз).
	queueAnnounced: boolean;
	// Терпение фазы A, секунды (идёт, пока группа в status waiting).
	patienceLeftSec: number;
	patienceTotalSec: number;
	tableIndex: number | null;
	// Сколько членов группы уже доели.
	finishedEating: number;
}

// Стол во время игры: группа, которая его занимает (с назначения до конца еды).
interface TableRuntime {
	config: TableConfig;
	groupId: GroupId | null;
}

// Кандидат на провал по терпению: что истекло и насколько давно.
interface ExpiredCandidate {
	overdueSec: number;
	failure: FailureInfo;
}

// Доля в пределах 0..1 с защитой от деления на ноль.
function ratioOf(leftSec: number, totalSec: number): number {
	if (totalSec <= 0) {
		return 0;
	}
	return Math.min(1, Math.max(0, leftSec / totalSec));
}

// Расстояние между точками.
function distanceBetween(first: Vec2, second: Vec2): number {
	return Math.hypot(first.x - second.x, first.z - second.z);
}

// Создаёт систему клиентов. Часы двигает Simulation, система только читает их.
export function createCustomerSystem(deps: CustomerDeps): CustomerSystem {
	const { level, schedule, nav, clock } = deps;
	const bus: EventSink = deps.bus;
	const params = level.params;

	const tables: TableRuntime[] = level.tables.map((config) => ({ config, groupId: null }));
	const groupsById = new Map<GroupId, GroupRuntime>();
	// Активные клиенты (появились и ещё не ушли) в порядке появления.
	let customers: CustomerRuntime[] = [];
	const customersById = new Map<CustomerId, CustomerRuntime>();
	// Группы без стола в порядке очереди: первая ждёт дольше всех.
	const waiting: GroupRuntime[] = [];
	// Все заказы смены в порядке создания и поиск по идентификатору.
	const orders: Order[] = [];
	const ordersById = new Map<OrderId, Order>();
	// Индекс следующей группы расписания, которая ещё не пришла.
	let nextScheduledIndex = 0;
	// После провала система замирает.
	let hasFailed = false;

	// ------------------------------------------------------------------------
	// Движение через навигацию
	// ------------------------------------------------------------------------

	// Отправляет клиента к точке. Недостижимая цель (в играх проверенных уровней не бывает) не должна вешать смену: клиент
	// переносится в точку мгновенно, причина пишется в отладочный журнал.
	function startMove(customer: CustomerRuntime, target: Vec2): void {
		customer.target = target;
		if (!customer.agent.moveTo(target)) {
			debugLog("customers", `цель недостижима для ${customer.id}, перенос в точку`, target);
			customer.agent.teleport(target);
		}
	}

	// Дошёл ли клиент до своей цели: статус arrived либо агент стоит в пределах расстояния прибытия.
	function hasArrived(customer: CustomerRuntime): boolean {
		const { agent, target } = customer;
		if (agent.status === "arrived") {
			return true;
		}
		if (target === null) {
			return false;
		}
		return agent.status !== "moving" && distanceBetween(agent.position, target) <= Math.max(params.nav.arriveDistance, 0.05);
	}

	// Клиент остановился, не дойдя до цели (путь потерян): отправляем заново.
	function resumeIfStopped(customer: CustomerRuntime): void {
		if (customer.target !== null && customer.agent.status !== "moving" && !hasArrived(customer)) {
			startMove(customer, customer.target);
		}
	}

	// ------------------------------------------------------------------------
	// Приходы и очередь
	// ------------------------------------------------------------------------

	// Группа приходит: агенты появляются у двери, группа встаёт в список ожидающих.
	function spawnGroup(scheduled: ScheduledGroup): void {
		const spawn = level.door.spawnPoint;
		const members: CustomerRuntime[] = scheduled.members.map((member, memberIndex) => {
			const agent = nav.createAgent({
				id: member.customerId,
				position: { x: spawn.x + memberIndex * SPAWN_SPREAD_STEP, z: spawn.z },
				speed: params.customers.speed,
				radius: params.nav.agentRadius,
			});
			const customer: CustomerRuntime = {
				id: member.customerId,
				groupId: scheduled.groupId,
				variant: member.variant,
				dish: member.dish,
				memberIndex,
				agent,
				phase: "arriving",
				tableIndex: null,
				seatIndex: null,
				target: null,
				isSeated: false,
				order: null,
				eatLeftSec: 0,
				dishOnTable: false,
			};
			customers.push(customer);
			customersById.set(customer.id, customer);
			return customer;
		});
		const group: GroupRuntime = {
			id: scheduled.groupId,
			arrivalSec: scheduled.arrivalSec,
			size: members.length,
			members,
			status: "waiting",
			slotIndex: null,
			queueAnnounced: false,
			patienceLeftSec: params.patience.queueSec,
			patienceTotalSec: params.patience.queueSec,
			tableIndex: null,
			finishedEating: 0,
		};
		groupsById.set(group.id, group);
		waiting.push(group);
		bus.emit({ type: "groupArrived", groupId: group.id, size: group.size });
	}

	// Приходят все группы, чьё время наступило.
	function spawnDueGroups(): void {
		while (nextScheduledIndex < schedule.groups.length && schedule.groups[nextScheduledIndex].arrivalSec <= clock.nowSec + TIME_EPSILON_SEC) {
			spawnGroup(schedule.groups[nextScheduledIndex]);
			nextScheduledIndex += 1;
		}
	}

	// Отправляет членов группы на их места в слоте очереди.
	function sendToQueueSlot(group: GroupRuntime, slotIndex: number): void {
		const slot = level.queue.slots[slotIndex];
		const offsets = level.queue.memberOffsets;
		group.members.forEach((member, memberIndex) => {
			if (member.phase === "leaving") {
				return;
			}
			const offset = offsets[memberIndex % offsets.length];
			member.phase = "arriving";
			startMove(member, { x: slot.position.x + offset.x, z: slot.position.z + offset.z });
		});
	}

	// Слоты очереди занимают группы по порядку ожидания: освободившееся место закрывается, остальные подтягиваются к двери.
	function refreshQueue(): void {
		waiting.forEach((group, rank) => {
			if (rank >= level.queue.slots.length) {
				debugLog("customers", `очередь переполнена: группа ${group.id} стоит в последнем слоте`);
			}
			const slotIndex = Math.min(rank, level.queue.slots.length - 1);
			if (group.slotIndex === slotIndex) {
				return;
			}
			group.slotIndex = slotIndex;
			sendToQueueSlot(group, slotIndex);
			if (!group.queueAnnounced) {
				group.queueAnnounced = true;
				bus.emit({ type: "groupQueued", groupId: group.id, slotIndex });
			}
		});
	}

	// ------------------------------------------------------------------------
	// Рассадка
	// ------------------------------------------------------------------------

	// Назначает группе стол: столы занят с этого момента, члены группы идут к своим местам.
	function assignTable(group: GroupRuntime, tableIndex: number): void {
		const table = tables[tableIndex];
		table.groupId = group.id;
		group.status = "walking";
		group.tableIndex = tableIndex;
		group.slotIndex = null;
		group.members.forEach((member) => {
			const seatIndex = seatIndexForMember(member.memberIndex, group.size, table.config.seats.length);
			member.tableIndex = tableIndex;
			member.seatIndex = seatIndex;
			member.phase = "walkingToTable";
			startMove(member, table.config.seats[seatIndex].approachPoint);
		});
	}

	// Сажает за столы всех, кого можно по правилу рассадки.
	function seatWaitingGroups(): void {
		for (;;) {
			const plan = planSeating(
				waiting.map((group) => ({ size: group.size, waitedSec: clock.nowSec - group.arrivalSec })),
				tables.map((table) => ({ seats: table.config.seats.length, occupied: table.groupId !== null })),
				params.customers.seatingBypassSec,
			);
			if (!plan) {
				return;
			}
			const [group] = waiting.splice(plan.waitingIndex, 1);
			assignTable(group, plan.tableIndex);
		}
	}

	// Член группы сел на стул: мгновенный перенос из точки подхода на сиденье, поворот лицом к столу.
	function sitDown(customer: CustomerRuntime): void {
		if (customer.tableIndex === null || customer.seatIndex === null) {
			return;
		}
		const seat = tables[customer.tableIndex].config.seats[customer.seatIndex];
		customer.agent.teleport(seat.sitPoint, (seat.rotationDeg * Math.PI) / 180);
		customer.phase = "seated";
		customer.isSeated = true;
		customer.target = null;
	}

	// Рассчитывает фазу B: полное терпение клиента за столом по трудоёмкости его блюда.
	function computeTablePatience(dish: DishId): number {
		const patience = params.patience;
		return patience.tableBaseSec + patience.tableEffortCoef * params.dishes[dish].effort + patience.tableWaiterAllowanceSec;
	}

	// Группа села целиком: каждый член размещает заказ, начинается терпение фазы B.
	function placeGroupOrders(group: GroupRuntime): void {
		if (group.tableIndex === null) {
			return;
		}
		const table = tables[group.tableIndex];
		group.status = "seated";
		bus.emit({ type: "groupSeated", groupId: group.id, tableId: table.config.id, tableNumber: table.config.number });
		group.members.forEach((member) => {
			const seatIndex = member.seatIndex ?? 0;
			const seat = table.config.seats[seatIndex];
			const patienceTotalSec = computeTablePatience(member.dish);
			const order: Order = {
				id: `o-${member.id}`,
				customerId: member.id,
				groupId: group.id,
				tableId: table.config.id,
				tableNumber: table.config.number,
				seatIndex,
				dish: member.dish,
				status: "waiting",
				createdAtSec: clock.nowSec,
				servePoint: { ...seat.servePoint },
				dishPoint: { ...seat.dishPoint },
				patienceTotalSec,
				patienceLeftSec: patienceTotalSec,
			};
			member.order = order;
			orders.push(order);
			ordersById.set(order.id, order);
			bus.emit({ type: "orderPlaced", orderId: order.id, customerId: member.id, tableId: table.config.id, seatIndex, dish: member.dish });
		});
	}

	// ------------------------------------------------------------------------
	// Шаг: движение, терпение, еда
	// ------------------------------------------------------------------------

	// Убирает клиента из игры (дошёл до выхода).
	function removeCustomer(customer: CustomerRuntime): void {
		nav.removeAgent(customer.id);
		customersById.delete(customer.id);
		customers = customers.filter((candidate) => candidate !== customer);
	}

	// Проверяет прибытие клиентов в точки назначения.
	function updateMovement(): void {
		[...customers].forEach((customer) => {
			if (customer.phase === "arriving") {
				if (hasArrived(customer)) {
					customer.phase = "queued";
				} else {
					resumeIfStopped(customer);
				}
			} else if (customer.phase === "walkingToTable") {
				if (hasArrived(customer)) {
					sitDown(customer);
					const group = groupsById.get(customer.groupId);
					if (group && group.status === "walking" && group.members.every((member) => member.isSeated)) {
						placeGroupOrders(group);
					}
				} else {
					resumeIfStopped(customer);
				}
			} else if (customer.phase === "leaving") {
				if (hasArrived(customer)) {
					removeCustomer(customer);
				} else {
					resumeIfStopped(customer);
				}
			}
		});
	}

	// Уменьшает таймеры терпения, при истечении шлёт patienceExpired. true, если смена провалена на этом шаге.
	function updatePatience(dtSec: number): boolean {
		const expired: ExpiredCandidate[] = [];
		// Фаза A: группы без стола.
		waiting.forEach((group) => {
			group.patienceLeftSec -= dtSec;
			if (group.patienceLeftSec <= TIME_EPSILON_SEC) {
				expired.push({
					overdueSec: -group.patienceLeftSec,
					failure: { place: "queue", groupId: group.id, customerId: group.members[0].id, tableId: null, tableNumber: null, dish: null },
				});
			}
		});
		// Фаза B: клиенты за столом, которым блюдо ещё не подано.
		customers.forEach((customer) => {
			const order = customer.order;
			if (!order || order.status === "served" || customer.tableIndex === null) {
				return;
			}
			order.patienceLeftSec -= dtSec;
			if (order.patienceLeftSec <= TIME_EPSILON_SEC) {
				const table = tables[customer.tableIndex].config;
				expired.push({
					overdueSec: -order.patienceLeftSec,
					failure: { place: "table", groupId: customer.groupId, customerId: customer.id, tableId: table.id, tableNumber: table.number, dish: customer.dish },
				});
			}
		});
		if (expired.length === 0) {
			return false;
		}
		// Если за один шаг истекло несколько таймеров, провалом считается самый просроченный (первый при равенстве).
		const worst = expired.reduce((chosen, candidate) => (candidate.overdueSec > chosen.overdueSec ? candidate : chosen));
		hasFailed = true;
		bus.emit({ type: "patienceExpired", failure: worst.failure });
		return true;
	}

	// Клиент доел: тарелка исчезает, он уходит к двери; когда доела вся группа, стол свободен.
	function finishEating(customer: CustomerRuntime): boolean {
		const group = groupsById.get(customer.groupId);
		if (!group || customer.tableIndex === null || customer.seatIndex === null) {
			return false;
		}
		const table = tables[customer.tableIndex];
		const seat = table.config.seats[customer.seatIndex];
		customer.dishOnTable = false;
		customer.isSeated = false;
		customer.phase = "leaving";
		bus.emit({ type: "customerFinishedEating", customerId: customer.id });
		customer.agent.teleport(seat.approachPoint);
		startMove(customer, level.door.exitPoint);
		group.finishedEating += 1;
		if (group.finishedEating < group.size) {
			return false;
		}
		group.status = "done";
		table.groupId = null;
		bus.emit({ type: "groupLeft", groupId: group.id, tableId: table.config.id });
		return true;
	}

	// Едят подавшие блюдо клиенты. true, если освободился стол.
	function updateEating(dtSec: number): boolean {
		let tableFreed = false;
		[...customers].forEach((customer) => {
			if (customer.phase !== "eating") {
				return;
			}
			customer.eatLeftSec -= dtSec;
			if (customer.eatLeftSec <= TIME_EPSILON_SEC && finishEating(customer)) {
				tableFreed = true;
			}
		});
		return tableFreed;
	}

	// ------------------------------------------------------------------------
	// Снимки
	// ------------------------------------------------------------------------

	function snapshotOfOrder(order: Order): OrderSnapshot {
		const patienceLeftSec = Math.max(0, order.patienceLeftSec);
		return {
			id: order.id,
			customerId: order.customerId,
			tableId: order.tableId,
			seatIndex: order.seatIndex,
			dish: order.dish,
			status: order.status,
			patienceLeftSec,
			patienceTotalSec: order.patienceTotalSec,
			patienceRatio: ratioOf(patienceLeftSec, order.patienceTotalSec),
		};
	}

	// ------------------------------------------------------------------------
	// Интерфейс CustomerSystem и OrderBoard
	// ------------------------------------------------------------------------

	return {
		step(dtSec: number): void {
			if (hasFailed) {
				return;
			}
			// Терпение идёт первым: пришедшие и севшие на этом шаге группы и новые заказы начинают отсчёт со следующего шага.
			if (updatePatience(dtSec)) {
				return;
			}
			spawnDueGroups();
			seatWaitingGroups();
			refreshQueue();
			updateMovement();
			if (updateEating(dtSec)) {
				// Освободившийся стол сразу достаётся ожидающей группе.
				seatWaitingGroups();
				refreshQueue();
			}
		},

		getCustomerSnapshots(): CustomerSnapshot[] {
			return customers.map((customer) => ({
				id: customer.id,
				groupId: customer.groupId,
				position: { x: customer.agent.position.x, z: customer.agent.position.z },
				yaw: customer.agent.heading,
				moving: customer.agent.isMoving,
				phase: customer.phase,
				isSeated: customer.isSeated,
				variant: customer.variant,
				tableId: customer.tableIndex === null ? null : tables[customer.tableIndex].config.id,
				seatIndex: customer.seatIndex,
				dish: customer.dish,
				dishOnTable: customer.dishOnTable,
			}));
		},

		getTableSnapshots(): TableSnapshot[] {
			return tables.map((table): TableSnapshot => {
				const base = { tableId: table.config.id, number: table.config.number, capacity: table.config.seats.length };
				const group = table.groupId === null ? undefined : groupsById.get(table.groupId);
				// Пока группа идёт к столу и заказов нет, стол для HUD свободен: карточка появляется после заказа.
				if (!group || group.status !== "seated") {
					return { ...base, state: "free", groupId: null, orders: [] };
				}
				const tableOrders = group.members
					.map((member) => member.order)
					.filter((order): order is Order => order !== null)
					.sort((first, second) => first.seatIndex - second.seatIndex);
				const allServed = tableOrders.length > 0 && tableOrders.every((order) => order.status === "served");
				return { ...base, state: allServed ? "served" : "waiting", groupId: group.id, orders: tableOrders.map(snapshotOfOrder) };
			});
		},

		getQueueSnapshots(): QueueGroupSnapshot[] {
			return waiting.map((group) => {
				const patienceLeftSec = Math.max(0, group.patienceLeftSec);
				return {
					groupId: group.id,
					slotIndex: group.slotIndex ?? 0,
					size: group.size,
					patienceLeftSec,
					patienceTotalSec: group.patienceTotalSec,
					patienceRatio: ratioOf(patienceLeftSec, group.patienceTotalSec),
				};
			});
		},

		getOrders(): readonly Order[] {
			return orders;
		},

		getOrder(orderId: OrderId): Order | undefined {
			return ordersById.get(orderId);
		},

		findEarliestWaitingOrder(dish: DishId): Order | null {
			// Заказы лежат в порядке создания, а время создания не убывает: первый подходящий и есть самый ранний.
			return orders.find((order) => order.status === "waiting" && order.dish === dish) ?? null;
		},

		markDelivering(orderId: OrderId): boolean {
			const order = ordersById.get(orderId);
			if (!order || order.status !== "waiting") {
				return false;
			}
			order.status = "delivering";
			return true;
		},

		serveOrder(orderId: OrderId): boolean {
			const order = ordersById.get(orderId);
			const customer = customersById.get(order?.customerId ?? "");
			if (!order || !customer || order.status !== "delivering") {
				return false;
			}
			order.status = "served";
			// Терпение замораживается на подаче: чаевые зависят от остатка.
			const leftSec = Math.max(0, order.patienceLeftSec);
			const dishParams = params.dishes[order.dish];
			const tip = Math.floor(dishParams.maxTip * ratioOf(leftSec, order.patienceTotalSec));
			bus.emit({
				type: "dishServed",
				orderId: order.id,
				customerId: customer.id,
				groupId: customer.groupId,
				tableId: order.tableId,
				dish: order.dish,
				price: dishParams.price,
				tip,
			});
			customer.phase = "eating";
			customer.eatLeftSec = params.customers.eatSec;
			customer.dishOnTable = true;
			bus.emit({ type: "customerStartedEating", customerId: customer.id, orderId: order.id });
			const group = groupsById.get(customer.groupId);
			if (group && group.members.every((member) => member.order?.status === "served")) {
				bus.emit({ type: "groupServed", groupId: group.id, tableId: order.tableId });
			}
			return true;
		},
	};
}
