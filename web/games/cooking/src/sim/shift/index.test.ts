// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SIM_STEP_SEC, type DaySchedule, type FailureInfo, type LevelParams, type SimClock, type SimEvent } from "../../contracts";
import type { DeepPartial } from "../../config/levels/defaults";
import { createCustomerKit, makeSchedule, type CustomerKit, type TestGroupSpec } from "../customers/customersTestKit";
import { createEventBus } from "../eventBus";
import { createTestLevel } from "../testing/testLevel";
import { createShift } from "./index";

// Смена с ручным управлением событиями: подачи эмулируются событиями dishServed.
function createManualShift(groups: readonly TestGroupSpec[], paramsOverrides: DeepPartial<LevelParams> = {}) {
	const level = createTestLevel(paramsOverrides);
	const clock: SimClock = { nowSec: 0 };
	const bus = createEventBus(clock);
	const schedule: DaySchedule = makeSchedule(level, groups);
	const shift = createShift({ level, schedule, clock, bus });
	const events: SimEvent[] = [];
	bus.subscribe((event) => events.push(event));

	// Событие подачи клиента по номерам группы и члена (с единицы).
	function emitServed(groupNumber: number, memberNumber: number, price = 10, tip = 0): void {
		const customerId = `c-${groupNumber}-${memberNumber}`;
		const dish = schedule.groups[groupNumber - 1].members[memberNumber - 1].dish;
		bus.emit({ type: "dishServed", orderId: `o-${customerId}`, customerId, groupId: `g-${groupNumber}`, tableId: "table-1", dish, price, tip });
	}

	function emitExpired(failure: FailureInfo): void {
		bus.emit({ type: "patienceExpired", failure });
	}

	return {
		level,
		clock,
		bus,
		schedule,
		shift,
		events,
		emitServed,
		emitExpired,
		eventsOf: <T extends SimEvent["type"]>(type: T) => events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type),
	};
}

const TABLE_FAILURE: FailureInfo = { place: "table", groupId: "g-1", customerId: "c-1-1", tableId: "table-1", tableNumber: 1, dish: "burger" };

// Две группы по одному и по два клиента: три клиента дня.
const THREE_CUSTOMERS: TestGroupSpec[] = [
	{ arrivalSec: 5, dishes: ["burger"] },
	{ arrivalSec: 20, dishes: ["ham", "burger"] },
];

// Шаги смены вместе с клиентами, как это делает Simulation: часы, клиенты, навигация, затем shift.step.
function runShiftWithCustomers(kit: CustomerKit, shift: ReturnType<typeof createShift>, seconds: number, autoServe: boolean): void {
	const stepCount = Math.round(seconds / SIM_STEP_SEC);
	for (let step = 0; step < stepCount; step += 1) {
		if (shift.getSnapshot().phase !== "running") {
			return;
		}
		kit.advance(SIM_STEP_SEC);
		if (autoServe) {
			kit.system
				.getOrders()
				.filter((order) => order.status === "waiting")
				.forEach((order) => kit.serve(order.id));
		}
		shift.step();
	}
}

describe("фазы смены", () => {
	it("до старта фаза ready: время не идёт, step ничего не меняет", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		const before = kit.shift.getSnapshot();
		expect(before).toMatchObject({ phase: "ready", durationSec: 180, elapsedSec: 0, timeLeftSec: 180, flowClosed: false, score: 0, servedCustomers: 0, totalCustomers: 3, failure: null, result: null });
		kit.clock.nowSec = 500;
		kit.shift.step();
		expect(kit.shift.getSnapshot().phase).toBe("ready");
		expect(kit.events).toHaveLength(0);
		expect(kit.shift.getResult()).toBeNull();
	});

	it("start переводит ready в running один раз, повторный вызов игнорируется", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.shift.start();
		expect(kit.shift.getSnapshot().phase).toBe("running");
		expect(kit.eventsOf("phaseChanged")).toEqual([expect.objectContaining({ phase: "running" })]);
	});

	it("Максимум известен до начала: maxScore по расписанию не меняется в течение смены", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		const expected = kit.schedule.maxScore;
		expect(expected).toBeGreaterThan(0);
		expect(kit.shift.getSnapshot().maxScore).toBe(expected);
		kit.shift.start();
		kit.clock.nowSec = 30;
		kit.emitServed(1, 1, 10, 3);
		kit.shift.step();
		expect(kit.shift.getSnapshot().maxScore).toBe(expected);
		// Максимум: сумма цены и максимальных чаевых по всем клиентам.
		const params = kit.level.params.dishes;
		const sum = kit.schedule.groups.flatMap((group) => group.members).reduce((total, member) => total + params[member.dish].price + params[member.dish].maxTip, 0);
		expect(expected).toBe(sum);
	});

	it("таймер: прошедшее и оставшееся время берутся по часам, оставшееся не меньше нуля", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 100;
		kit.shift.step();
		expect(kit.shift.getSnapshot()).toMatchObject({ elapsedSec: 100, timeLeftSec: 80, phase: "running" });
	});

	it("смена без maxScore отвергается", () => {
		const level = createTestLevel();
		const clock: SimClock = { nowSec: 0 };
		const schedule: DaySchedule = { ...makeSchedule(level, THREE_CUSTOMERS), maxScore: 0 };
		expect(() => createShift({ level, schedule, clock, bus: createEventBus(clock) })).toThrow(RangeError);
	});
});

describe("закрытие потока", () => {
	it("за 60 секунд до конца шлётся flowClosed ровно один раз, снимок показывает баннер", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 119.9;
		kit.shift.step();
		expect(kit.shift.getSnapshot().flowClosed).toBe(false);
		expect(kit.eventsOf("flowClosed")).toHaveLength(0);
		kit.clock.nowSec = 120;
		kit.shift.step();
		kit.clock.nowSec = 130;
		kit.shift.step();
		expect(kit.shift.getSnapshot().flowClosed).toBe(true);
		expect(kit.eventsOf("flowClosed")).toHaveLength(1);
	});

	it("порог закрытия берётся из параметров уровня", () => {
		const kit = createManualShift(THREE_CUSTOMERS, { durationSec: 240, schedule: { flowCloseBeforeEndSec: 90 } });
		kit.shift.start();
		kit.clock.nowSec = 149;
		kit.shift.step();
		expect(kit.shift.getSnapshot().flowClosed).toBe(false);
		kit.clock.nowSec = 150;
		kit.shift.step();
		expect(kit.shift.getSnapshot().flowClosed).toBe(true);
	});
});

describe("провал смены", () => {
	it("Клиент ушёл: смена сразу переходит в failed с причиной и итогом completed=false", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 40;
		kit.emitServed(1, 1, 10, 4);
		kit.emitExpired(TABLE_FAILURE);
		const snapshot = kit.shift.getSnapshot();
		expect(snapshot).toMatchObject({ phase: "failed", failure: TABLE_FAILURE, elapsedSec: 40, servedCustomers: 1, score: 14 });
		expect(snapshot.result).toEqual({ completed: false, score: 14, maxScore: kit.schedule.maxScore, reason: "failed" });
		expect(kit.shift.getResult()).toEqual(snapshot.result);
		expect(kit.eventsOf("shiftFailed")).toEqual([expect.objectContaining({ failure: TABLE_FAILURE, result: snapshot.result })]);
		expect(kit.eventsOf("phaseChanged").map((event) => event.phase)).toEqual(["running", "failed"]);
	});

	it("после провала подачи, время и повторные уходы не меняют итог", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 40;
		kit.emitExpired(TABLE_FAILURE);
		const result = kit.shift.getResult();
		kit.emitServed(2, 1, 14, 5);
		kit.emitExpired({ ...TABLE_FAILURE, customerId: "c-2-1" });
		kit.clock.nowSec = 400;
		kit.shift.step();
		expect(kit.shift.getResult()).toEqual(result);
		expect(kit.shift.getSnapshot()).toMatchObject({ phase: "failed", elapsedSec: 40, timeLeftSec: 140, servedCustomers: 0, score: 0 });
		expect(kit.eventsOf("shiftFailed")).toHaveLength(1);
	});

	it("провал в очереди: причина содержит группу без стола", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		const queueFailure: FailureInfo = { place: "queue", groupId: "g-2", customerId: "c-2-1", tableId: null, tableNumber: null, dish: null };
		kit.emitExpired(queueFailure);
		expect(kit.shift.getSnapshot().failure).toEqual(queueFailure);
	});

	it("Группа уходит вместе: терпение одного члена группы проваливает смену сразу, не дожидаясь остальных", () => {
		const kit = createCustomerKit({
			groups: [{ arrivalSec: 1, dishes: ["burger", "ham"] }],
			paramsOverrides: { patience: { tableBaseSec: 5, tableEffortCoef: 0, tableWaiterAllowanceSec: 0 } },
		});
		const shift = createShift({ level: kit.level, schedule: kit.schedule, clock: kit.clock, bus: kit.bus });
		shift.start();
		runShiftWithCustomers(kit, shift, 3, false);
		const [first] = kit.system.getOrders();
		kit.serve(first.id);
		runShiftWithCustomers(kit, shift, 10, false);
		const snapshot = shift.getSnapshot();
		expect(snapshot.phase).toBe("failed");
		expect(snapshot.failure).toMatchObject({ place: "table", customerId: "c-1-2", dish: "ham", tableNumber: 1 });
		expect(snapshot.result).toMatchObject({ completed: false, reason: "failed" });
		// Первый клиент успел получить блюдо: его очки засчитаны.
		expect(snapshot.score).toBeGreaterThan(0);
		expect(snapshot.servedCustomers).toBe(1);
	});
});

describe("завершение смены", () => {
	it("Последний клиент обслужен рано: смена завершается сразу с completed=true", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 50;
		kit.emitServed(1, 1, 10, 5);
		kit.emitServed(2, 1, 14, 6);
		kit.shift.step();
		expect(kit.shift.getSnapshot().phase).toBe("running");
		kit.emitServed(2, 2, 10, 2);
		kit.shift.step();
		const snapshot = kit.shift.getSnapshot();
		expect(snapshot).toMatchObject({ phase: "finished", servedCustomers: 3, totalCustomers: 3, elapsedSec: 50, timeLeftSec: 130 });
		expect(snapshot.result).toEqual({ completed: true, score: 47, maxScore: kit.schedule.maxScore, reason: "allServed" });
		expect(kit.eventsOf("shiftFinished")).toHaveLength(1);
		expect(kit.eventsOf("phaseChanged").map((event) => event.phase)).toEqual(["running", "finished"]);
		// Время после конца не идёт.
		kit.clock.nowSec = 100;
		kit.shift.step();
		expect(kit.shift.getSnapshot().elapsedSec).toBe(50);
		expect(kit.eventsOf("shiftFinished")).toHaveLength(1);
	});

	it("Все клиенты обслужены: в конце таймера результат completed=true, если подан последний клиент", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 179.9;
		kit.emitServed(1, 1);
		kit.emitServed(2, 1);
		kit.shift.step();
		expect(kit.shift.getSnapshot().phase).toBe("running");
		// Последний клиент подан на том же шаге, когда таймер дошёл до нуля: смена пройдена.
		kit.clock.nowSec = 180;
		kit.emitServed(2, 2);
		kit.shift.step();
		expect(kit.shift.getResult()).toMatchObject({ completed: true, reason: "allServed" });
	});

	it("Есть необслуженный клиент: по таймеру итог completed=false, очки только за поданное", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 60;
		kit.emitServed(1, 1, 10, 5);
		kit.shift.step();
		kit.clock.nowSec = 179.9;
		kit.shift.step();
		expect(kit.shift.getSnapshot().phase).toBe("running");
		kit.clock.nowSec = 180;
		kit.shift.step();
		const snapshot = kit.shift.getSnapshot();
		expect(snapshot).toMatchObject({ phase: "finished", timeLeftSec: 0, elapsedSec: 180 });
		expect(snapshot.result).toEqual({ completed: false, score: 15, maxScore: kit.schedule.maxScore, reason: "timeUp" });
		expect(kit.eventsOf("shiftFinished")).toHaveLength(1);
	});

	it("по таймеру оставшееся время ровно ноль, даже если часы не дошли до длительности на погрешность", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		// Часы, накопленные шагами, оказываются чуть меньше длительности, но в допуске: смена завершается по таймеру.
		kit.clock.nowSec = 180 - 4e-12;
		kit.shift.step();
		expect(kit.shift.getSnapshot()).toMatchObject({ phase: "finished", elapsedSec: 180, timeLeftSec: 0 });
		expect(kit.shift.getResult()?.reason).toBe("timeUp");
	});

	it("смена без единой подачи по таймеру завершается с нулевыми очками, но допустимым итогом", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 181;
		kit.shift.step();
		const result = kit.shift.getResult();
		expect(result).toEqual({ completed: false, score: 0, maxScore: kit.schedule.maxScore, reason: "timeUp" });
		// Время в снимке не выходит за длительность смены.
		expect(kit.shift.getSnapshot()).toMatchObject({ elapsedSec: 180, timeLeftSec: 0 });
	});

	it("Доедать не обязательно: смена пройдена, пока часть клиентов ещё ест полученные блюда", () => {
		const kit = createCustomerKit({
			groups: [
				{ arrivalSec: 1, dishes: ["burger", "ham"] },
				{ arrivalSec: 3, dishes: ["ham"] },
			],
		});
		const shift = createShift({ level: kit.level, schedule: kit.schedule, clock: kit.clock, bus: kit.bus });
		shift.start();
		runShiftWithCustomers(kit, shift, 60, true);
		const snapshot = shift.getSnapshot();
		expect(snapshot.phase).toBe("finished");
		expect(snapshot.result).toMatchObject({ completed: true, reason: "allServed" });
		expect(snapshot.servedCustomers).toBe(3);
		// В момент конца клиенты всё ещё едят, и это не провал.
		const eating = kit.system.getCustomerSnapshots().filter((customer) => customer.phase === "eating");
		expect(eating.length).toBeGreaterThan(0);
		kit.advance(30);
		expect(kit.eventsOf("patienceExpired")).toHaveLength(0);
		expect(shift.getSnapshot().phase).toBe("finished");
	});

	it("клиенты, система клиентов и смена вместе: все подано, очки равны сумме цен и чаевых", () => {
		const kit = createCustomerKit({ groups: THREE_CUSTOMERS });
		const shift = createShift({ level: kit.level, schedule: kit.schedule, clock: kit.clock, bus: kit.bus });
		expect(shift.getSnapshot().maxScore).toBe(kit.schedule.maxScore);
		shift.start();
		runShiftWithCustomers(kit, shift, 120, true);
		const served = kit.eventsOf("dishServed");
		expect(served).toHaveLength(3);
		const snapshot = shift.getSnapshot();
		expect(snapshot.phase).toBe("finished");
		expect(snapshot.score).toBe(served.reduce((total, event) => total + event.price + event.tip, 0));
		expect(snapshot.score).toBeLessThanOrEqual(snapshot.maxScore);
		expect(snapshot.result).toEqual({ completed: true, score: snapshot.score, maxScore: snapshot.maxScore, reason: "allServed" });
	});
});

describe("очки и допустимые значения", () => {
	it("Допустимые значения: 0 <= score <= maxScore и maxScore > 0, даже если события сообщают лишнее", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.clock.nowSec = 10;
		// Заведомо завышенные чаевые не выводят очки за максимум.
		kit.emitServed(1, 1, 10, 100000);
		const snapshot = kit.shift.getSnapshot();
		expect(snapshot.maxScore).toBeGreaterThan(0);
		expect(snapshot.score).toBeGreaterThanOrEqual(0);
		expect(snapshot.score).toBeLessThanOrEqual(snapshot.maxScore);
		kit.emitExpired(TABLE_FAILURE);
		expect(kit.shift.getResult()?.score).toBeLessThanOrEqual(kit.shift.getResult()?.maxScore ?? 0);
	});

	it("очки копятся как цена плюс чаевые, повтор события по заказу не засчитывается дважды", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.shift.start();
		kit.emitServed(1, 1, 10, 3);
		kit.emitServed(1, 1, 10, 3);
		expect(kit.shift.getSnapshot()).toMatchObject({ score: 13, servedCustomers: 1 });
		kit.emitServed(2, 1, 14, 0);
		expect(kit.shift.getSnapshot()).toMatchObject({ score: 27, servedCustomers: 2 });
	});

	it("подачи до старта не засчитываются", () => {
		const kit = createManualShift(THREE_CUSTOMERS);
		kit.emitServed(1, 1);
		kit.shift.start();
		expect(kit.shift.getSnapshot()).toMatchObject({ score: 0, servedCustomers: 0 });
	});
});
