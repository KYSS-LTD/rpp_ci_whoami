// Система официантов (задачи 4.5, 4.6): автомат каждого официанта (окно, доставка, подача, возврат), назначение блюд
// нескольким официантам по длине пути, рейсы на несколько тарелок одного стола. Владелец: SONNET-2 (geometry-control-nav).
// sim/ не импортирует DOM и three.
//
// Как идёт работа официанта:
//   free (свободен, ждёт в точке ожидания или идёт к ней) -> toWindow (идёт к pickupPoint за зарезервированными блюдами)
//   -> pickup (пауза handoffSec, блюда забираются из окна) -> toTable (идёт к servePoint заказа) -> serving (пауза handoffSec,
//   serveOrder) -> следующий заказ рейса или free.
// Блюдо остаётся в окне до pickup, поэтому резервирование ведёт сама система: окно о нём не знает.
import type { DishId, NavAgent, Order, OrderId, Rect, StationConfig, Vec2, WaiterDeps, WaiterId, WaiterSnapshot, WaiterSystem, WaiterSystemFactory, WindowDish, WindowDishId } from "../../contracts";
import { debugLog } from "../../config/debug";

// Через сколько секунд повторять попытку, если цель оказалась недостижимой (на корректных уровнях не случается).
const UNREACHABLE_RETRY_SEC = 1;

type WaiterState = "free" | "toWindow" | "pickup" | "toTable" | "serving";

// Блюдо, которое официант несёт.
interface CarriedDish {
	orderId: OrderId;
	dish: DishId;
}

// Внутреннее состояние официанта.
interface WaiterRecord {
	id: WaiterId;
	agent: NavAgent;
	waitPoint: Vec2;
	state: WaiterState;
	// Блюда окна, зарезервированные за официантом до забора.
	reserved: WindowDishId[];
	carrying: CarriedDish[];
	// Заказ, к которому идёт или которому подаёт официант.
	currentOrderId: OrderId | null;
	// Накопленная пауза забора или подачи, секунды.
	handoffElapsedSec: number;
	// Официант идёт в точку ожидания.
	returning: boolean;
	// Ничего не назначать до этого времени (после недостижимой цели).
	retryAtSec: number;
}

// Центр прямоугольника.
function centerOf(rect: Rect): Vec2 {
	return { x: rect.x + rect.width / 2, z: rect.z + rect.depth / 2 };
}

// Угол yaw от точки from к точке to (как в снимке: 0 смотрит вниз по экрану).
function yawTowards(from: Vec2, to: Vec2): number {
	return Math.atan2(to.x - from.x, to.z - from.z);
}

// Создаёт систему официантов. Число официантов равно длине level.waiters.waitPoints.
export const createWaiterSystem: WaiterSystemFactory = (deps: WaiterDeps): WaiterSystem => {
	const { level, nav, window, orders, clock, bus } = deps;
	const params = level.params.waiter;
	// Ближе этого расстояния к точке ожидания официант считается стоящим на месте (допуск прихода навигации).
	const atWaitPointDistance = level.params.nav.arriveDistance;
	const pickupPoint = level.window.pickupPoint;
	const windowStation: StationConfig | undefined = level.stations.find((station) => station.id === level.window.stationId);
	// Куда смотрит официант у окна: на станцию окна (запасной вариант: первый слот блюд).
	const windowCenter: Vec2 = windowStation ? centerOf(windowStation.rect) : level.window.dishPoints[0];

	const waiters: WaiterRecord[] = level.waiters.waitPoints.map((waitPoint, index) => {
		const id: WaiterId = `waiter-${index + 1}`;
		const agent = nav.createAgent({ id, position: waitPoint, speed: params.speed, radius: level.params.nav.agentRadius });
		agent.setHeading(yawTowards(waitPoint, windowCenter));
		return { id, agent, waitPoint: { x: waitPoint.x, z: waitPoint.z }, state: "free", reserved: [], carrying: [], currentOrderId: null, handoffElapsedSec: 0, returning: false, retryAtSec: 0 };
	});

	// Все зарезервированные блюда всех официантов.
	function collectReserved(): Set<WindowDishId> {
		const reserved = new Set<WindowDishId>();
		for (const waiter of waiters) {
			waiter.reserved.forEach((dishId) => reserved.add(dishId));
		}
		return reserved;
	}

	// Свободен ли официант для нового назначения.
	function isAssignable(waiter: WaiterRecord): boolean {
		return waiter.state === "free" && clock.nowSec >= waiter.retryAtSec;
	}

	// Официант не может дойти до цели: отпускает резерв и ждёт перед новой попыткой.
	function giveUp(waiter: WaiterRecord): void {
		debugLog("waiter", `${waiter.id}: цель недостижима, повтор через ${UNREACHABLE_RETRY_SEC} с`);
		waiter.reserved = [];
		waiter.currentOrderId = null;
		waiter.state = "free";
		waiter.returning = false;
		waiter.retryAtSec = clock.nowSec + UNREACHABLE_RETRY_SEC;
	}

	// Отправляет официанта к окну за зарезервированными блюдами.
	function sendToWindow(waiter: WaiterRecord, dishIds: WindowDishId[]): void {
		waiter.reserved = dishIds;
		waiter.state = "toWindow";
		waiter.returning = false;
		waiter.handoffElapsedSec = 0;
		if (!waiter.agent.moveTo(pickupPoint)) {
			giveUp(waiter);
		}
	}

	// Стол заказа окна (undefined, если заказа уже нет).
	function tableOfWindowDish(windowDish: WindowDish): string | undefined {
		return orders.getOrder(windowDish.orderId)?.tableId;
	}

	// Назначает блюда свободным официантам: по порядку появления блюд, каждое ближайшему по длине пути свободному.
	// Рейс на несколько тарелок собирается из блюд одного стола.
	function assignDishes(): void {
		const reserved = collectReserved();
		const pending = window.getDishes().filter((windowDish) => !reserved.has(windowDish.id));
		for (const windowDish of pending) {
			if (reserved.has(windowDish.id)) {
				continue;
			}
			let best: WaiterRecord | null = null;
			let bestLength = Infinity;
			for (const waiter of waiters) {
				if (!isAssignable(waiter)) {
					continue;
				}
				const length = nav.pathfinder.pathLength(waiter.agent.position, pickupPoint);
				if (length !== null && length < bestLength) {
					best = waiter;
					bestLength = length;
				}
			}
			if (!best) {
				continue;
			}
			const group: WindowDishId[] = [windowDish.id];
			const tableId = tableOfWindowDish(windowDish);
			if (params.capacity > 1 && tableId !== undefined) {
				for (const other of pending) {
					if (group.length >= params.capacity) {
						break;
					}
					if (other.id !== windowDish.id && !reserved.has(other.id) && tableOfWindowDish(other) === tableId) {
						group.push(other.id);
					}
				}
			}
			group.forEach((dishId) => reserved.add(dishId));
			sendToWindow(best, group);
		}
	}

	// Забор блюд у окна: зарезервированные и (при свободной вместимости) подоспевшие блюда того же стола.
	function takeDishesFromWindow(waiter: WaiterRecord): void {
		const taken: WindowDish[] = [];
		for (const dishId of waiter.reserved) {
			const windowDish = window.takeDish(dishId);
			if (windowDish) {
				taken.push(windowDish);
			}
		}
		waiter.reserved = [];
		if (taken.length > 0 && taken.length < params.capacity) {
			const tableId = tableOfWindowDish(taken[0]);
			const reservedByOthers = collectReserved();
			for (const candidate of window.getDishes()) {
				if (taken.length >= params.capacity) {
					break;
				}
				if (!reservedByOthers.has(candidate.id) && tableId !== undefined && tableOfWindowDish(candidate) === tableId) {
					const extra = window.takeDish(candidate.id);
					if (extra) {
						taken.push(extra);
					}
				}
			}
		}
		waiter.carrying = taken.map((windowDish) => ({ orderId: windowDish.orderId, dish: windowDish.dish }));
		if (taken.length > 0) {
			bus.emit({ type: "waiterPickedUp", waiterId: waiter.id, orderIds: taken.map((windowDish) => windowDish.orderId) });
		}
	}

	// Заказ, который несёт официант и который ещё существует.
	function findOrder(carried: CarriedDish): Order | undefined {
		return orders.getOrder(carried.orderId);
	}

	// Выбирает следующий заказ рейса (ближайший по длине пути до места подачи) и отправляет к нему.
	function sendToNextTable(waiter: WaiterRecord): void {
		// Блюда, чьих заказов уже нет, подать некому: сбрасываем.
		waiter.carrying = waiter.carrying.filter((carried) => findOrder(carried) !== undefined);
		if (waiter.carrying.length === 0) {
			releaseWaiter(waiter);
			return;
		}
		let bestOrder: Order | null = null;
		let bestLength = Infinity;
		for (const carried of waiter.carrying) {
			const order = findOrder(carried);
			if (!order) {
				continue;
			}
			// Недостижимое место подачи уходит в конец очереди рейса.
			const length = nav.pathfinder.pathLength(waiter.agent.position, order.servePoint) ?? Number.MAX_SAFE_INTEGER;
			if (bestOrder === null || length < bestLength) {
				bestOrder = order;
				bestLength = length;
			}
		}
		if (!bestOrder) {
			releaseWaiter(waiter);
			return;
		}
		waiter.currentOrderId = bestOrder.id;
		waiter.state = "toTable";
		waiter.handoffElapsedSec = 0;
		if (!waiter.agent.moveTo(bestOrder.servePoint)) {
			// Место подачи недостижимо: повторим через паузу, блюдо остаётся в руках.
			waiter.retryAtSec = clock.nowSec + UNREACHABLE_RETRY_SEC;
			debugLog("waiter", `${waiter.id}: место подачи недостижимо`);
		}
	}

	// Рейс закончен: официант свободен (в этом же шаге ему может достаться блюдо из окна без захода в точку ожидания).
	function releaseWaiter(waiter: WaiterRecord): void {
		waiter.state = "free";
		waiter.currentOrderId = null;
		waiter.carrying = [];
		waiter.reserved = [];
		waiter.handoffElapsedSec = 0;
	}

	// Продвигает автомат одного официанта на шаг.
	function advanceWaiter(waiter: WaiterRecord, dtSec: number): void {
		const agent = waiter.agent;
		switch (waiter.state) {
			case "toWindow": {
				if (agent.status === "arrived") {
					waiter.state = "pickup";
					waiter.handoffElapsedSec = 0;
					agent.setHeading(yawTowards(agent.position, windowCenter));
				} else if (agent.status === "unreachable" || agent.status === "idle") {
					giveUp(waiter);
				}
				break;
			}
			case "pickup": {
				waiter.handoffElapsedSec += dtSec;
				if (waiter.handoffElapsedSec >= params.handoffSec) {
					takeDishesFromWindow(waiter);
					if (waiter.carrying.length === 0) {
						releaseWaiter(waiter);
					} else {
						sendToNextTable(waiter);
					}
				}
				break;
			}
			case "toTable": {
				if (waiter.currentOrderId === null) {
					releaseWaiter(waiter);
				} else if (agent.status === "arrived") {
					waiter.state = "serving";
					waiter.handoffElapsedSec = 0;
					const order = orders.getOrder(waiter.currentOrderId);
					if (order) {
						agent.setHeading(yawTowards(agent.position, order.dishPoint));
					}
				} else if (agent.status === "unreachable" || agent.status === "idle") {
					// Повторная попытка после паузы.
					if (clock.nowSec >= waiter.retryAtSec) {
						sendToNextTable(waiter);
					}
				}
				break;
			}
			case "serving": {
				waiter.handoffElapsedSec += dtSec;
				if (waiter.handoffElapsedSec >= params.handoffSec) {
					const orderId = waiter.currentOrderId;
					if (orderId !== null) {
						// Подача: заказ становится обслуженным, блюдо больше не несём.
						orders.serveOrder(orderId);
						waiter.carrying = waiter.carrying.filter((carried) => carried.orderId !== orderId);
					}
					sendToNextTable(waiter);
				}
				break;
			}
			case "free": {
				break;
			}
		}
	}

	// Свободный официант без работы идёт в точку ожидания и становится там.
	function manageIdleWaiter(waiter: WaiterRecord): void {
		if (waiter.state !== "free") {
			return;
		}
		const agent = waiter.agent;
		const distance = Math.hypot(agent.position.x - waiter.waitPoint.x, agent.position.z - waiter.waitPoint.z);
		if (waiter.returning) {
			if (agent.status === "arrived" || agent.status === "idle") {
				waiter.returning = false;
			} else if (agent.status === "unreachable") {
				waiter.returning = false;
				waiter.retryAtSec = clock.nowSec + UNREACHABLE_RETRY_SEC;
			}
			return;
		}
		if (distance > atWaitPointDistance && clock.nowSec >= waiter.retryAtSec) {
			waiter.returning = agent.moveTo(waiter.waitPoint) && agent.status === "moving";
			if (!agent.isMoving && agent.status === "unreachable") {
				waiter.retryAtSec = clock.nowSec + UNREACHABLE_RETRY_SEC;
			}
		}
	}

	return {
		step(dtSec: number): void {
			for (const waiter of waiters) {
				advanceWaiter(waiter, dtSec);
			}
			assignDishes();
			for (const waiter of waiters) {
				manageIdleWaiter(waiter);
			}
		},
		getWaiterSnapshots(): WaiterSnapshot[] {
			return waiters.map((waiter) => ({
				id: waiter.id,
				position: { x: waiter.agent.position.x, z: waiter.agent.position.z },
				yaw: waiter.agent.heading,
				moving: waiter.agent.isMoving,
				carrying: waiter.carrying.map((carried) => carried.dish),
			}));
		},
	};
};
