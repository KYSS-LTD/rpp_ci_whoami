// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NavSystem, TableSnapshot } from "../../contracts";
import { createFakeNavSystem } from "../testing/fakeNav";
import { createTestLevel } from "../testing/testLevel";
import { createCustomerKit, type CustomerKit } from "./customersTestKit";

const baseLevel = createTestLevel();

// Уровень с одним столом на два места: удобно проверять занятость и очередь.
const singleTableOverrides = { tables: [baseLevel.tables[0]] };

// Уровень с двумя столами: на два и на четыре места.
const twoTablesOverrides = { tables: [baseLevel.tables[0], baseLevel.tables[1]] };

function tableOf(kit: CustomerKit, tableId: string): TableSnapshot {
	const found = kit.system.getTableSnapshots().find((table) => table.tableId === tableId);
	if (!found) {
		throw new Error(`нет стола ${tableId}`);
	}
	return found;
}

// Ждёт, пока за столом появятся заказы всех членов группы (группа села и заказала).
function waitUntilSeated(kit: CustomerKit, tableId: string, maxSeconds = 15): void {
	expect(kit.advanceUntil(() => tableOf(kit, tableId).orders.length > 0, maxSeconds)).toBe(true);
}

describe("столы и рассадка (5.3)", () => {
	it("Занятый стол: пока группа сидит, другие группы за этот стол не садятся", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham"] },
				{ arrivalSec: 2, dishes: ["ham", "ham"] },
			],
			levelOverrides: singleTableOverrides,
		});
		kit.advance(20);
		expect(tableOf(kit, "table-1")).toMatchObject({ state: "waiting", groupId: "g-1" });
		expect(kit.eventsOf("groupSeated").map((event) => event.groupId)).toEqual(["g-1"]);
		expect(kit.system.getQueueSnapshots().map((group) => group.groupId)).toEqual(["g-2"]);
	});

	it("Лучший по размеру стол: группа из двух садится за стол на 2 места, а не на 4", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham"] },
				{ arrivalSec: 2, dishes: ["ham", "ham"] },
				{ arrivalSec: 3, dishes: ["burger", "burger", "ham"] },
			],
		});
		kit.advance(10);
		const seated = kit.eventsOf("groupSeated").map((event) => [event.groupId, event.tableId]);
		// Первая двойка: стол 1 (2 места). Вторая двойка: стол 3 (2 места), стол 2 (4 места) остаётся для тройки.
		expect(seated).toEqual([
			["g-1", "table-1"],
			["g-2", "table-3"],
			["g-3", "table-2"],
		]);
	});

	it("группа из четырёх занимает стол на 4 места целиком, за ним четыре разных места", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger", "burger", "ham", "ham"] }] });
		waitUntilSeated(kit, "table-2");
		const orders = tableOf(kit, "table-2").orders;
		expect(orders.map((order) => order.seatIndex)).toEqual([0, 1, 2, 3]);
	});

	it("Крупная группа ждёт: пока она ждёт меньше порога, группа из двух садится за стол на 2 места", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham", "ham", "burger"] },
				{ arrivalSec: 2, dishes: ["burger", "burger", "burger", "burger"] },
				{ arrivalSec: 5, dishes: ["ham", "ham"] },
			],
			levelOverrides: twoTablesOverrides,
			paramsOverrides: { customers: { seatingBypassSec: 20 } },
		});
		kit.advance(10);
		const seated = kit.eventsOf("groupSeated").map((event) => [event.groupId, event.tableId]);
		expect(seated).toEqual([
			["g-1", "table-2"],
			["g-3", "table-1"],
		]);
		expect(kit.system.getQueueSnapshots().map((group) => group.groupId)).toEqual(["g-2"]);
	});

	it("Крупная группа ждёт: после порога обгон запрещён, малая группа ждёт стол на 4 места", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham", "ham", "burger"] },
				{ arrivalSec: 2, dishes: ["burger", "burger", "burger", "burger"] },
				{ arrivalSec: 25, dishes: ["ham", "ham"] },
			],
			levelOverrides: twoTablesOverrides,
			paramsOverrides: { customers: { seatingBypassSec: 20 }, patience: { queueSec: 200, tableBaseSec: 200 } },
		});
		kit.advance(30);
		// Крупная группа ждёт больше 20 секунд: малая за стол на 2 места не проходит, хотя он свободен.
		expect(kit.eventsOf("groupSeated").map((event) => event.groupId)).toEqual(["g-1"]);
		expect(tableOf(kit, "table-1").state).toBe("free");
		expect(kit.system.getQueueSnapshots().map((group) => group.groupId)).toEqual(["g-2", "g-3"]);
	});

	it("когда стол на 4 места освободился, садится крупная группа, потом малая", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham", "ham", "burger"] },
				{ arrivalSec: 2, dishes: ["burger", "burger", "burger", "burger"] },
				{ arrivalSec: 25, dishes: ["ham", "ham"] },
			],
			levelOverrides: twoTablesOverrides,
			paramsOverrides: { customers: { seatingBypassSec: 20 }, patience: { queueSec: 200, tableBaseSec: 200 } },
		});
		waitUntilSeated(kit, "table-2");
		// Накормить первую группу, чтобы стол освободился.
		kit.system.getOrders().forEach((order) => kit.serve(order.id));
		kit.advance(30);
		const seated = kit.eventsOf("groupSeated").map((event) => [event.groupId, event.tableId]);
		expect(seated).toEqual([
			["g-1", "table-2"],
			["g-2", "table-2"],
			["g-3", "table-1"],
		]);
	});
});

describe("очередь на улице (5.4)", () => {
	// Занят единственный стол группой g-1.
	function createBusyTableKit(extraGroups: Array<{ arrivalSec: number; dishes: Array<"burger" | "ham"> }>, paramsOverrides = {}): CustomerKit {
		return createCustomerKit({
			groups: [{ arrivalSec: 1, dishes: ["burger", "ham"] }, ...extraGroups],
			levelOverrides: singleTableOverrides,
			paramsOverrides,
		});
	}

	it("Нет свободных столов: группа встаёт в слот очереди перед дверью", () => {
		const kit = createBusyTableKit([{ arrivalSec: 2, dishes: ["ham", "burger"] }]);
		kit.advance(8);
		expect(kit.eventsOf("groupQueued")).toEqual([expect.objectContaining({ groupId: "g-2", slotIndex: 0 })]);
		expect(kit.system.getQueueSnapshots()).toMatchObject([{ groupId: "g-2", slotIndex: 0, size: 2 }]);
		expect(kit.system.getQueueSnapshots()[0].patienceRatio).toBeLessThan(1);
		// Члены группы стоят в слоте со смещениями членов группы.
		const slot = kit.level.queue.slots[0].position;
		const offsets = kit.level.queue.memberOffsets;
		const queued = kit.system.getCustomerSnapshots().filter((customer) => customer.groupId === "g-2");
		expect(queued.map((customer) => customer.phase)).toEqual(["queued", "queued"]);
		queued.forEach((customer, index) => {
			expect(customer.position.x).toBeCloseTo(slot.x + offsets[index].x);
			expect(customer.position.z).toBeCloseTo(slot.z + offsets[index].z);
		});
	});

	it("следующая группа занимает следующий слот, а при выходе первой подтягивается к двери", () => {
		const kit = createBusyTableKit([
			{ arrivalSec: 2, dishes: ["ham", "ham"] },
			{ arrivalSec: 3, dishes: ["burger", "burger"] },
		]);
		kit.advance(8);
		expect(kit.system.getQueueSnapshots().map((group) => [group.groupId, group.slotIndex])).toEqual([
			["g-2", 0],
			["g-3", 1],
		]);
		// Освобождаем стол: g-2 заходит, g-3 переходит в первый слот.
		kit.system.getOrders().forEach((order) => kit.serve(order.id));
		expect(kit.advanceUntil(() => kit.eventsOf("groupSeated").length === 2, 30)).toBe(true);
		expect(kit.system.getQueueSnapshots().map((group) => [group.groupId, group.slotIndex])).toEqual([["g-3", 0]]);
		const slot = kit.level.queue.slots[0].position;
		kit.advance(1);
		const moved = kit.system.getCustomerSnapshots().filter((customer) => customer.groupId === "g-3");
		expect(moved[0].position.x).toBeCloseTo(slot.x + kit.level.queue.memberOffsets[0].x);
	});

	it("Освободился стол: группа из очереди заходит и идёт к столу", () => {
		const kit = createBusyTableKit([{ arrivalSec: 2, dishes: ["ham"] }]);
		kit.advance(5);
		expect(kit.system.getQueueSnapshots()).toHaveLength(1);
		kit.system.getOrders().forEach((order) => kit.serve(order.id));
		kit.advance(12.5);
		// Стол освободился (группа доела), очередь пуста, вторая группа села за тот же стол.
		expect(kit.eventsOf("groupLeft").map((event) => event.groupId)).toEqual(["g-1"]);
		expect(kit.system.getQueueSnapshots()).toEqual([]);
		kit.advance(2);
		expect(kit.eventsOf("groupSeated").map((event) => event.groupId)).toEqual(["g-1", "g-2"]);
		expect(tableOf(kit, "table-1")).toMatchObject({ state: "waiting", groupId: "g-2" });
		const walker = kit.system.getCustomerSnapshots().find((customer) => customer.groupId === "g-2");
		expect(walker).toMatchObject({ phase: "seated", isSeated: true, tableId: "table-1" });
	});

	it("пока группа идёт к столу, он занят для других, а карточка стола ещё скрыта", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham"] },
				{ arrivalSec: 2, dishes: ["ham", "ham"] },
			],
			levelOverrides: singleTableOverrides,
			nav: createFakeNavSystem(),
		});
		kit.advance(3);
		// Группа g-1 идёт по залу: стол назначен, заказов ещё нет, для HUD стол свободен.
		expect(kit.system.getCustomerSnapshots().filter((customer) => customer.groupId === "g-1").map((customer) => customer.phase)).toEqual(["walkingToTable", "walkingToTable"]);
		expect(tableOf(kit, "table-1")).toMatchObject({ state: "free", groupId: null, orders: [] });
		expect(kit.system.getQueueSnapshots().map((group) => group.groupId)).toEqual(["g-2"]);
		waitUntilSeated(kit, "table-1", 20);
		expect(tableOf(kit, "table-1").state).toBe("waiting");
	});

	it("Очередь не дождалась: терпение группы в очереди истекает, провал с причиной queue, система замирает", () => {
		const kit = createBusyTableKit([{ arrivalSec: 2, dishes: ["ham", "burger"] }], { patience: { queueSec: 10 } });
		// Группа пришла на второй секунде, терпение 10 секунд: на 11.5 секунде ещё ждёт, к 12.5 уходит.
		kit.advance(11.5);
		expect(kit.eventsOf("patienceExpired")).toHaveLength(0);
		kit.advance(1);
		const expired = kit.eventsOf("patienceExpired");
		expect(expired).toHaveLength(1);
		expect(expired[0].failure).toEqual({ place: "queue", groupId: "g-2", customerId: "c-2-1", tableId: null, tableNumber: null, dish: null });
		const eventCount = kit.events.length;
		kit.advance(20);
		expect(kit.events).toHaveLength(eventCount);
	});

	it("очередь длиннее числа слотов не ломает систему: лишние группы стоят в последнем слоте", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham"] },
				{ arrivalSec: 2, dishes: ["ham"] },
				{ arrivalSec: 3, dishes: ["ham"] },
				{ arrivalSec: 4, dishes: ["ham"] },
				{ arrivalSec: 5, dishes: ["ham"] },
			],
			levelOverrides: singleTableOverrides,
			paramsOverrides: { patience: { queueSec: 500, tableBaseSec: 500 } },
		});
		kit.advance(10);
		const slots = kit.system.getQueueSnapshots().map((group) => group.slotIndex);
		expect(slots).toEqual([0, 1, 2, 2]);
	});

	it("клиенты приходят по расписанию и не раньше", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 5, dishes: ["burger"] }] });
		kit.advance(4.9);
		expect(kit.system.getCustomerSnapshots()).toHaveLength(0);
		expect(kit.eventsOf("groupArrived")).toHaveLength(0);
		kit.advance(0.2);
		expect(kit.eventsOf("groupArrived")).toEqual([expect.objectContaining({ groupId: "g-1", size: 1 })]);
		expect(kit.system.getCustomerSnapshots()).toHaveLength(1);
	});

	it("недостижимая навигацией цель не вешает смену: клиент переносится в точку", () => {
		const base = createFakeNavSystem({ instant: true });
		const unreachableNav: NavSystem = {
			pathfinder: base.pathfinder,
			get agents() {
				return base.agents;
			},
			createAgent(spec) {
				const agent = base.createAgent(spec);
				agent.moveTo = () => false;
				return agent;
			},
			removeAgent: (agentId) => base.removeAgent(agentId),
			step: (dtSec, chefPosition) => base.step(dtSec, chefPosition),
		};
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger"] }], nav: unreachableNav });
		waitUntilSeated(kit, "table-1", 5);
		expect(tableOf(kit, "table-1").orders).toHaveLength(1);
	});
});

describe("автомат клиента: заказ, терпение, еда, уход (5.5)", () => {
	it("Группа из трёх: за стол 2 села группа, у карточки три заказа с терпением по трудоёмкости блюд", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger", "ham", "burger"] }] });
		waitUntilSeated(kit, "table-2");
		const table = tableOf(kit, "table-2");
		expect(table).toMatchObject({ number: 2, capacity: 4, state: "waiting", groupId: "g-1" });
		expect(table.orders.map((order) => [order.customerId, order.seatIndex, order.dish, order.status])).toEqual([
			["c-1-1", 0, "burger", "waiting"],
			["c-1-2", 1, "ham", "waiting"],
			["c-1-3", 2, "burger", "waiting"],
		]);
		// Терпение: база 40 + 1.5 * трудоёмкость + запас 15.
		expect(table.orders[0].patienceTotalSec).toBeCloseTo(40 + 1.5 * 16 + 15);
		expect(table.orders[1].patienceTotalSec).toBeCloseTo(40 + 1.5 * 10 + 15);
		table.orders.forEach((order) => expect(order.patienceRatio).toBeGreaterThan(0.99));
		// События: приход, посадка, три заказа.
		expect(kit.eventsOf("groupArrived")).toEqual([expect.objectContaining({ groupId: "g-1", size: 3 })]);
		expect(kit.eventsOf("groupSeated")).toEqual([expect.objectContaining({ groupId: "g-1", tableId: "table-2", tableNumber: 2 })]);
		expect(kit.eventsOf("orderPlaced").map((event) => event.orderId)).toEqual(["o-c-1-1", "o-c-1-2", "o-c-1-3"]);
		// Клиенты сидят на стульях, лицом к столу.
		const seat = kit.level.tables[1].seats[1];
		const second = kit.system.getCustomerSnapshots().find((customer) => customer.id === "c-1-2");
		expect(second).toMatchObject({ phase: "seated", isSeated: true, tableId: "table-2", seatIndex: 1, dish: "ham", dishOnTable: false });
		expect(second?.position).toEqual(seat.sitPoint);
		expect(second?.yaw).toBeCloseTo((seat.rotationDeg * Math.PI) / 180);
	});

	it("клиент идёт к столу по навигации и садится по прибытии (двойник навигации с ходьбой)", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger"] }], nav: createFakeNavSystem() });
		kit.advance(2);
		const walking = kit.system.getCustomerSnapshots()[0];
		expect(walking).toMatchObject({ phase: "walkingToTable", isSeated: false, moving: true });
		waitUntilSeated(kit, "table-1", 20);
		expect(kit.system.getCustomerSnapshots()[0]).toMatchObject({ phase: "seated", isSeated: true, moving: false });
	});

	it("Подача вовремя: чаевые зависят от остатка терпения, терпение замораживается", () => {
		const fast = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger"] }] });
		waitUntilSeated(fast, "table-1");
		const fastOrder = fast.system.getOrders()[0];
		expect(fast.serve(fastOrder.id)).toBe(true);
		const fastServed = fast.eventsOf("dishServed")[0];
		expect(fastServed).toMatchObject({ orderId: fastOrder.id, customerId: "c-1-1", groupId: "g-1", tableId: "table-1", dish: "burger", price: 10, tip: 5 });

		const slow = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger"] }] });
		waitUntilSeated(slow, "table-1");
		const slowOrder = slow.system.getOrders()[0];
		slow.advance(slowOrder.patienceTotalSec * 0.6);
		slow.serve(slowOrder.id);
		const slowServed = slow.eventsOf("dishServed")[0];
		expect(slowServed.price).toBe(10);
		expect(slowServed.tip).toBeLessThan(fastServed.tip);
		expect(slowServed.tip).toBe(Math.floor(5 * (slowOrder.patienceLeftSec / slowOrder.patienceTotalSec)));

		// Таймер остановлен: после подачи терпение не убывает и провала нет, сколько бы ни прошло времени.
		const frozen = slowOrder.patienceLeftSec;
		slow.advance(100);
		expect(slowOrder.patienceLeftSec).toBe(frozen);
		expect(slow.eventsOf("patienceExpired")).toHaveLength(0);
		expect(slowOrder.status).toBe("served");
	});

	it("подача: клиент начинает есть, блюдо на столе, группа обслужена после последнего блюда", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger", "ham"] }] });
		waitUntilSeated(kit, "table-1");
		const [first, second] = kit.system.getOrders();
		kit.serve(first.id);
		expect(kit.eventsOf("customerStartedEating")).toEqual([expect.objectContaining({ customerId: "c-1-1", orderId: first.id })]);
		expect(kit.eventsOf("groupServed")).toHaveLength(0);
		expect(kit.system.getCustomerSnapshots().find((customer) => customer.id === "c-1-1")).toMatchObject({ phase: "eating", dishOnTable: true, isSeated: true });
		expect(tableOf(kit, "table-1").state).toBe("waiting");
		kit.serve(second.id);
		expect(kit.eventsOf("groupServed")).toEqual([expect.objectContaining({ groupId: "g-1", tableId: "table-1" })]);
		expect(tableOf(kit, "table-1").state).toBe("served");
	});

	it("Клиент поел: тарелка исчезает, клиент уходит к двери и пропадает из игры", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["ham"] }], nav: createFakeNavSystem() });
		waitUntilSeated(kit, "table-1", 20);
		const order = kit.system.getOrders()[0];
		kit.serve(order.id);
		kit.advance(11.9);
		expect(kit.system.getCustomerSnapshots()[0]).toMatchObject({ phase: "eating", dishOnTable: true });
		kit.advance(0.2);
		expect(kit.eventsOf("customerFinishedEating")).toEqual([expect.objectContaining({ customerId: "c-1-1" })]);
		const leaving = kit.system.getCustomerSnapshots()[0];
		expect(leaving).toMatchObject({ phase: "leaving", dishOnTable: false, isSeated: false });
		// Клиент встал из-за стола в точке подхода и идёт к выходу.
		const seat = kit.level.tables[0].seats[0];
		expect(Math.hypot(leaving.position.x - seat.approachPoint.x, leaving.position.z - seat.approachPoint.z)).toBeLessThan(0.5);
		expect(kit.advanceUntil(() => kit.system.getCustomerSnapshots().length === 0, 20)).toBe(true);
		expect(kit.nav.agents).toHaveLength(0);
	});

	it("Группа доела: стол свободен для следующей группы только когда доели все члены группы", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger", "ham"] }] });
		waitUntilSeated(kit, "table-1");
		const [first, second] = kit.system.getOrders();
		kit.serve(first.id);
		kit.advance(5);
		kit.serve(second.id);
		// Первый поел и ушёл, второй ещё ест: стол занят.
		kit.advance(7.5);
		expect(kit.eventsOf("customerFinishedEating").map((event) => event.customerId)).toEqual(["c-1-1"]);
		expect(kit.eventsOf("groupLeft")).toHaveLength(0);
		expect(tableOf(kit, "table-1")).toMatchObject({ state: "served", groupId: "g-1" });
		kit.advance(5);
		expect(kit.eventsOf("customerFinishedEating").map((event) => event.customerId)).toEqual(["c-1-1", "c-1-2"]);
		expect(kit.eventsOf("groupLeft")).toEqual([expect.objectContaining({ groupId: "g-1", tableId: "table-1" })]);
		expect(tableOf(kit, "table-1")).toMatchObject({ state: "free", groupId: null, orders: [] });
	});

	it("Блюдо не подано: терпение за столом истекает, провал с указанием стола и блюда", () => {
		const kit = createCustomerKit({
			groups: [{ arrivalSec: 1, dishes: ["burger"] }],
			paramsOverrides: { patience: { tableBaseSec: 5, tableEffortCoef: 0, tableWaiterAllowanceSec: 0 } },
		});
		waitUntilSeated(kit, "table-1");
		kit.advance(4.8);
		expect(kit.eventsOf("patienceExpired")).toHaveLength(0);
		kit.advance(0.4);
		const expired = kit.eventsOf("patienceExpired");
		expect(expired).toHaveLength(1);
		expect(expired[0].failure).toEqual({ place: "table", groupId: "g-1", customerId: "c-1-1", tableId: "table-1", tableNumber: 1, dish: "burger" });
		const eventCount = kit.events.length;
		kit.advance(10);
		expect(kit.events).toHaveLength(eventCount);
	});

	it("Группа уходит вместе: истекло терпение одного члена, провал без ожидания остальных", () => {
		const kit = createCustomerKit({
			groups: [{ arrivalSec: 1, dishes: ["burger", "ham"] }],
			paramsOverrides: { patience: { tableBaseSec: 5, tableEffortCoef: 0, tableWaiterAllowanceSec: 0 } },
		});
		waitUntilSeated(kit, "table-1");
		const [first] = kit.system.getOrders();
		kit.serve(first.id);
		kit.advance(5.3);
		const expired = kit.eventsOf("patienceExpired");
		expect(expired).toHaveLength(1);
		expect(expired[0].failure).toMatchObject({ place: "table", customerId: "c-1-2", dish: "ham" });
	});

	it("терпение идёт и пока блюдо в доставке (принято в окне, но не подано)", () => {
		const kit = createCustomerKit({
			groups: [{ arrivalSec: 1, dishes: ["burger"] }],
			paramsOverrides: { patience: { tableBaseSec: 5, tableEffortCoef: 0, tableWaiterAllowanceSec: 0 } },
		});
		waitUntilSeated(kit, "table-1");
		const [order] = kit.system.getOrders();
		kit.system.markDelivering(order.id);
		kit.advance(5.5);
		expect(kit.eventsOf("patienceExpired")).toHaveLength(1);
	});
});

describe("таблица заказов OrderBoard", () => {
	it("заказ создаётся при посадке по одному на клиента, поиск по блюду идёт по порядку создания", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "burger"] },
				{ arrivalSec: 2, dishes: ["ham", "burger"] },
			],
		});
		kit.advance(8);
		const orders = kit.system.getOrders();
		expect(orders.map((order) => order.id)).toEqual(["o-c-1-1", "o-c-1-2", "o-c-2-1", "o-c-2-2"]);
		expect(kit.system.getOrder("o-c-2-1")).toBe(orders[2]);
		expect(kit.system.getOrder("o-нет")).toBeUndefined();
		expect(kit.system.findEarliestWaitingOrder("burger")?.id).toBe("o-c-1-1");
		expect(kit.system.findEarliestWaitingOrder("ham")?.id).toBe("o-c-2-1");
		expect(kit.system.findEarliestWaitingOrder("stew")).toBeNull();
		// Заказ данных места: точки подачи берутся из места за столом.
		const seat = kit.level.tables[0].seats[0];
		expect(orders[0]).toMatchObject({ tableId: "table-1", tableNumber: 1, servePoint: seat.servePoint, dishPoint: seat.dishPoint, status: "waiting" });
	});

	it("привязка и подача идут по статусам waiting, delivering, served", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["burger", "burger"] }] });
		waitUntilSeated(kit, "table-1");
		const [first, second] = kit.system.getOrders();
		// Подача без привязки невозможна.
		expect(kit.system.serveOrder(first.id)).toBe(false);
		expect(kit.system.markDelivering(first.id)).toBe(true);
		expect(first.status).toBe("delivering");
		expect(kit.system.markDelivering(first.id)).toBe(false);
		expect(kit.system.markDelivering("o-нет")).toBe(false);
		// Привязанный заказ уже не "самый ранний ожидающий": следующий бургер уйдёт ко второму заказу.
		expect(kit.system.findEarliestWaitingOrder("burger")?.id).toBe(second.id);
		expect(kit.system.serveOrder(first.id)).toBe(true);
		expect(first.status).toBe("served");
		expect(kit.system.serveOrder(first.id)).toBe(false);
	});

	it("Максимум чаевых округляется вниз: floor(maxTip * остаток / полное)", () => {
		const kit = createCustomerKit({ groups: [{ arrivalSec: 1, dishes: ["ham"] }] });
		waitUntilSeated(kit, "table-1");
		const [order] = kit.system.getOrders();
		// Ветчина: maxTip 6. Проходит ровно 40% терпения: остаток 60%, чаевые floor(6 * 0.6) = 3.
		kit.advance(order.patienceTotalSec * 0.4);
		const ratio = order.patienceLeftSec / order.patienceTotalSec;
		kit.serve(order.id);
		expect(kit.eventsOf("dishServed")[0].tip).toBe(Math.floor(6 * ratio));
		expect(kit.eventsOf("dishServed")[0].tip).toBe(3);
	});
});
