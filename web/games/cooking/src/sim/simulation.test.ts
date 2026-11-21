// @vitest-environment node
// Сквозные тесты связки модулей: Simulation на тестовом уровне и на реальных easy, medium, hard.
import { describe, expect, it } from "vitest";
import { EMPTY_INPUT, LEVEL_IDS, SIM_STEP_SEC, type GameSnapshot, type InputState, type SimEvent } from "../contracts";
import { getLevelConfig } from "../config/levels";
import { createSimulation } from "./simulation";
import { runBot } from "../bot/bot";
import { createTestLevel } from "./testing/testLevel";

// Ввод без движения с заданными признаками.
function makeInput(overrides: Partial<InputState> = {}): InputState {
	return { ...EMPTY_INPUT, moveVector: { x: 0, z: 0 }, ...overrides };
}

// Выполняет заданное число шагов с одним и тем же вводом.
function stepMany(simulation: ReturnType<typeof createSimulation>, steps: number, input: InputState = EMPTY_INPUT): void {
	for (let index = 0; index < steps; index += 1) {
		simulation.step(input);
	}
}

// Типы событий из списка.
function typesOf(events: readonly SimEvent[]): string[] {
	return events.map((event) => event.type);
}

describe("симуляция на тестовом уровне", () => {
	it("до старта время стоит, после start идёт и меняет снимок", () => {
		const level = createTestLevel({ durationSec: 120 });
		const simulation = createSimulation({ level, seed: 1 });
		expect(simulation.getSnapshot().phase).toBe("ready");
		stepMany(simulation, 60);
		expect(simulation.getSnapshot().elapsedSec).toBe(0);
		expect(simulation.getSnapshot().tick).toBe(0);
		simulation.start();
		stepMany(simulation, 60);
		const snapshot = simulation.getSnapshot();
		expect(snapshot.phase).toBe("running");
		expect(snapshot.tick).toBe(60);
		expect(snapshot.elapsedSec).toBeCloseTo(60 * SIM_STEP_SEC, 6);
		expect(snapshot.timeLeftSec).toBeCloseTo(120 - 1, 5);
		expect(snapshot.stations).toHaveLength(level.stations.length);
		expect(snapshot.tables).toHaveLength(level.tables.length);
		expect(snapshot.waiters).toHaveLength(level.waiters.waitPoints.length);
		expect(snapshot.totalCustomers).toBe(simulation.schedule.totalCustomers);
		expect(snapshot.maxScore).toBe(simulation.schedule.maxScore);
		expect(typesOf(simulation.drainEvents())).toContain("phaseChanged");
	});

	it("повар двигается по вводу, взгляд и цель считаются сразу, действие берёт предмет из ящика", () => {
		const level = createTestLevel({ durationSec: 120 });
		const simulation = createSimulation({ level, seed: 1 });
		simulation.start();
		const before = simulation.getSnapshot().chef.position;
		stepMany(simulation, 30, makeInput({ moveVector: { x: 1, z: 0 } }));
		const moved = simulation.getSnapshot().chef;
		expect(moved.position.x).toBeGreaterThan(before.x + 0.5);
		expect(moved.facing).toBe(2);
		// Смотрим вверх (к ящикам), цель выбирается без задержки, "взять" даёт предмет в руку.
		stepMany(simulation, 1, makeInput({ moveVector: { x: 0, z: -0.3 } }));
		const targeted = simulation.getSnapshot().chef;
		expect(targeted.facing).toBe(0);
		expect(targeted.target?.kind).toBe("crate");
		simulation.step(makeInput({ actionPressed: true }));
		const hand = simulation.getSnapshot().chef.hand;
		expect(hand?.type).toBe("ingredient");
		expect(typesOf(simulation.drainEvents())).toContain("itemTaken");
	});

	it("advance: накопитель даёт целые шаги, признак нажатия не теряется при кадре без шагов", () => {
		const level = createTestLevel({ durationSec: 120 });
		const simulation = createSimulation({ level, seed: 1 });
		simulation.start();
		// Поворот к ящикам: один шаг вверх.
		simulation.step(makeInput({ moveVector: { x: 0, z: -0.3 } }));
		expect(simulation.getSnapshot().chef.target?.kind).toBe("crate");
		// Кадр короче шага: шагов нет, нажатие откладывается и достаётся первому шагу следующего кадра.
		expect(simulation.advance(0.001, makeInput({ actionPressed: true }))).toBe(0);
		expect(simulation.getSnapshot().chef.hand).toBeNull();
		expect(simulation.advance(0.05, makeInput())).toBe(3);
		expect(simulation.getSnapshot().chef.hand).not.toBeNull();
		// Нажатие достаётся только первому из нескольких шагов кадра: второй "взять" не случается (рука уже занята, отказа нет).
		const events = simulation.drainEvents();
		expect(events.filter((event) => event.type === "itemTaken")).toHaveLength(1);
	});

	it("результат не зависит от разбиения времени на кадры", () => {
		const level = createTestLevel({ durationSec: 120 });
		const first = createSimulation({ level, seed: 7 });
		const second = createSimulation({ level: createTestLevel({ durationSec: 120 }), seed: 7 });
		first.start();
		second.start();
		const input = makeInput({ moveVector: { x: 0.3, z: 0.2 } });
		for (let frame = 0; frame < 60; frame += 1) {
			first.advance(1 / 60, input);
		}
		for (let frame = 0; frame < 20; frame += 1) {
			second.advance(3 / 60, input);
		}
		expect(second.getSnapshot().tick).toBe(first.getSnapshot().tick);
		expect(JSON.stringify(second.getSnapshot().chef)).toBe(JSON.stringify(first.getSnapshot().chef));
	});

	it("одинаковый seed и ввод дают одинаковые снимки (воспроизводимость)", () => {
		const run = (): GameSnapshot => {
			const simulation = createSimulation({ level: createTestLevel({ durationSec: 120 }), seed: 3 });
			simulation.start();
			stepMany(simulation, 60 * 30);
			return simulation.getSnapshot();
		};
		expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
	});

	it("клиент приходит, садится, делает заказ и в снимке есть карточка стола и клиенты", () => {
		const level = createTestLevel({ durationSec: 200, patience: { queueSec: 500, tableBaseSec: 500 } });
		const simulation = createSimulation({ level, seed: 1 });
		simulation.start();
		const firstArrivalSec = simulation.schedule.groups[0].arrivalSec;
		stepMany(simulation, Math.ceil((firstArrivalSec + 20) * 60));
		const snapshot = simulation.getSnapshot();
		expect(snapshot.customers.length).toBeGreaterThan(0);
		const events = simulation.drainEvents();
		const types = typesOf(events);
		expect(types).toContain("groupArrived");
		expect(types).toContain("groupSeated");
		expect(types).toContain("orderPlaced");
		const occupied = snapshot.tables.filter((table) => table.state !== "free");
		expect(occupied.length).toBeGreaterThan(0);
		expect(occupied[0].orders.length).toBeGreaterThan(0);
		expect(occupied[0].orders[0].status).toBe("waiting");
		expect(occupied[0].orders[0].patienceRatio).toBeGreaterThan(0.9);
	});

	it("провал по терпению: симуляция замирает, итог completed=false, события и снимок описывают причину", () => {
		const level = createTestLevel({ durationSec: 200, patience: { queueSec: 3, tableBaseSec: 3, tableEffortCoef: 0, tableWaiterAllowanceSec: 0 } });
		const simulation = createSimulation({ level, seed: 1 });
		simulation.start();
		let guard = 0;
		while (simulation.getSnapshot().phase === "running" && guard < 60 * 120) {
			simulation.step(EMPTY_INPUT);
			guard += 1;
		}
		const snapshot = simulation.getSnapshot();
		expect(snapshot.phase).toBe("failed");
		expect(snapshot.failure).not.toBeNull();
		expect(snapshot.result).toEqual(expect.objectContaining({ completed: false, reason: "failed" }));
		expect(simulation.getResult()?.completed).toBe(false);
		const events = simulation.drainEvents();
		expect(typesOf(events)).toContain("patienceExpired");
		expect(typesOf(events)).toContain("shiftFailed");
		// После провала шаги ничего не меняют.
		const tick = snapshot.tick;
		stepMany(simulation, 120);
		expect(simulation.getSnapshot().tick).toBe(tick);
		expect(simulation.advance(1, EMPTY_INPUT)).toBe(0);
	});

	it("выход по таймеру без обслуженных клиентов: finished, completed=false, очки в допустимых границах", () => {
		const level = createTestLevel({ durationSec: 90, patience: { queueSec: 10000, tableBaseSec: 10000 } });
		const simulation = createSimulation({ level, seed: 1 });
		simulation.start();
		stepMany(simulation, 60 * 91);
		const snapshot = simulation.getSnapshot();
		expect(snapshot.phase).toBe("finished");
		expect(snapshot.result?.completed).toBe(false);
		expect(snapshot.result?.reason).toBe("timeUp");
		expect(snapshot.score).toBeGreaterThanOrEqual(0);
		expect(snapshot.score).toBeLessThanOrEqual(snapshot.maxScore);
		expect(snapshot.maxScore).toBeGreaterThan(0);
		expect(snapshot.timeLeftSec).toBeCloseTo(0, 6);
		expect(snapshot.flowClosed).toBe(true);
	});

	it("очередь на улице: при занятых столах группы встают в слоты у двери и видны в снимке", () => {
		const level = createTestLevel({
			durationSec: 300,
			schedule: { meanGapSec: 9, minGapSec: 8, workBudgetShare: 1000, firstArrivalSec: 1 },
			patience: { queueSec: 10000, tableBaseSec: 10000 },
		});
		const simulation = createSimulation({ level, seed: 2 });
		simulation.start();
		stepMany(simulation, 60 * 50);
		const snapshot = simulation.getSnapshot();
		expect(snapshot.phase).toBe("running");
		expect(snapshot.queuedGroups).toBeGreaterThan(0);
		expect(snapshot.queuedGroups).toBeLessThanOrEqual(level.queue.slots.length);
		expect(snapshot.queue).toHaveLength(snapshot.queuedGroups);
		const slotIndexes = snapshot.queue.map((group) => group.slotIndex);
		expect(new Set(slotIndexes).size).toBe(slotIndexes.length);
		// Клиенты в очереди стоят у своих слотов: рядом с позицией слота в пределах смещений членов группы.
		const queued = snapshot.customers.filter((customer) => customer.phase === "queued");
		expect(queued.length).toBeGreaterThan(0);
		for (const customer of queued) {
			const group = snapshot.queue.find((candidate) => candidate.groupId === customer.groupId);
			expect(group).toBeDefined();
			const slot = level.queue.slots[(group as { slotIndex: number }).slotIndex];
			expect(Math.hypot(customer.position.x - slot.position.x, customer.position.z - slot.position.z)).toBeLessThan(1.5);
		}
	});

	it("сценарий 'Нет цели': нажатие действия в пустое место не даёт событий и не меняет руку", () => {
		const level = createTestLevel({ durationSec: 120 });
		const simulation = createSimulation({ level, seed: 1 });
		simulation.start();
		// Поворот к востоку: рядом с точкой выбора станций нет.
		simulation.step(makeInput({ moveVector: { x: 0.3, z: 0 } }));
		const chef = simulation.getSnapshot().chef;
		expect(chef.facing).toBe(2);
		expect(chef.target).toBeNull();
		simulation.drainEvents();
		simulation.step(makeInput({ actionPressed: true }));
		expect(simulation.getSnapshot().chef.hand).toBeNull();
		expect(simulation.drainEvents().filter((event) => ["itemTaken", "itemPlaced", "actionRejected"].includes(event.type))).toEqual([]);
	});

	it("сценарий 'Смена цели': резка идёт, пока повар смотрит на доску, останавливается при повороте и продолжается с сохранённым прогрессом", () => {
		const level = createTestLevel({ durationSec: 120 });
		const simulation = createSimulation({ level, seed: 1 });
		simulation.start();
		// Идём к точке по прямой, как идеальный игрок (по положению из снимка).
		const walkTo = (x: number, z: number): void => {
			for (let guard = 0; guard < 600; guard += 1) {
				const position = simulation.getSnapshot().chef.position;
				const dx = x - position.x;
				const dz = z - position.z;
				const distance = Math.hypot(dx, dz);
				if (distance < 0.02) {
					return;
				}
				const scale = Math.min(1, distance / (level.params.player.speed * SIM_STEP_SEC));
				simulation.step(makeInput({ moveVector: { x: (dx / distance) * scale, z: (dz / distance) * scale } }));
			}
		};
		const boardProgress = (): number => simulation.getSnapshot().stations.find((station) => station.id === "board-1")?.progress ?? -1;
		// Берём стейк из ящика (стоим под ящиком, смотрим вверх) и кладём на первую доску (стоим над ней, смотрим вниз).
		walkTo(1.8, 1.85);
		simulation.step(makeInput({ moveVector: { x: 0, z: -0.3 } }));
		simulation.step(makeInput({ actionPressed: true }));
		expect(simulation.getSnapshot().chef.hand).toEqual({ type: "ingredient", kind: "steak", state: "raw" });
		walkTo(3.5, 3.65);
		simulation.step(makeInput({ moveVector: { x: 0, z: 0.3 } }));
		expect(simulation.getSnapshot().chef.target?.stationId).toBe("board-1");
		simulation.step(makeInput({ actionPressed: true }));
		expect(simulation.getSnapshot().chef.hand).toBeNull();
		// Удерживаем рабочее действие: прогресс растёт.
		stepMany(simulation, 30, makeInput({ workHeld: true }));
		const progressWhileCutting = boardProgress();
		expect(progressWhileCutting).toBeGreaterThan(0.1);
		expect(simulation.getSnapshot().chef.working).toBe(true);
		// Повернулись от доски (цели нет), кнопка всё ещё зажата: резка стоит, прогресс сохранён.
		simulation.step(makeInput({ moveVector: { x: -0.3, z: 0 }, workHeld: true }));
		expect(simulation.getSnapshot().chef.target?.stationId).not.toBe("board-1");
		stepMany(simulation, 30, makeInput({ workHeld: true }));
		expect(simulation.getSnapshot().chef.working).toBe(false);
		expect(boardProgress()).toBeCloseTo(progressWhileCutting, 5);
		// Повернулись обратно: резка продолжается с места остановки.
		simulation.step(makeInput({ moveVector: { x: 0, z: 0.3 }, workHeld: true }));
		stepMany(simulation, 30, makeInput({ workHeld: true }));
		expect(boardProgress()).toBeGreaterThan(progressWhileCutting);
	});

	it("отладочные данные: сетки, пути и точка выбора цели", () => {
		const simulation = createSimulation({ level: createTestLevel(), seed: 1 });
		const debug = simulation.getDebugInfo();
		expect(debug.navGrid.cols).toBeGreaterThan(0);
		expect(debug.collisionGrid.rows).toBeGreaterThan(0);
		expect(debug.chefProbe).not.toBeNull();
		expect(debug.paths.length).toBe(createTestLevel().waiters.waitPoints.length);
	});
});

describe.each(LEVEL_IDS)("симуляция на реальном уровне %s", (levelId) => {
	it("создаётся на первом проверенном seed, идёт 20 секунд, снимок согласован с данными уровня", () => {
		const level = getLevelConfig(levelId);
		const simulation = createSimulation({ level, seed: level.verifiedSeeds[0] });
		expect(simulation.schedule.levelId).toBe(levelId);
		simulation.start();
		stepMany(simulation, 60 * 20);
		const snapshot = simulation.getSnapshot();
		expect(snapshot.phase).toBe("running");
		expect(snapshot.durationSec).toBe(level.params.durationSec);
		expect(snapshot.stations).toHaveLength(level.stations.length);
		expect(snapshot.tables).toHaveLength(level.tables.length);
		expect(snapshot.waiters).toHaveLength(level.waiters.waitPoints.length);
		expect(snapshot.maxScore).toBe(simulation.schedule.maxScore);
		expect(simulation.schedule.groups.every((group) => group.arrivalSec <= level.params.durationSec - level.params.schedule.flowCloseBeforeEndSec)).toBe(true);
		simulation.schedule.groups.forEach((group) => group.members.forEach((member) => expect(level.params.menu).toContain(member.dish)));
	});
});

describe.each(LEVEL_IDS)("полный проход на реальном уровне %s", (levelId) => {
	it("без действий игрока смена проваливается по терпению, симуляция замирает, причина описана", { timeout: 120000 }, () => {
		const level = getLevelConfig(levelId);
		const simulation = createSimulation({ level, seed: level.verifiedSeeds[0] });
		simulation.start();
		let guard = 0;
		while (simulation.getResult() === null && guard < 60 * (level.params.durationSec + 5)) {
			simulation.step(EMPTY_INPUT);
			guard += 1;
		}
		const snapshot = simulation.getSnapshot();
		expect(snapshot.phase).toBe("failed");
		expect(snapshot.failure).not.toBeNull();
		expect(snapshot.result?.completed).toBe(false);
		expect(snapshot.result?.score).toBe(0);
		expect(snapshot.result?.maxScore).toBe(simulation.schedule.maxScore);
		expect(typesOf(simulation.drainEvents())).toEqual(expect.arrayContaining(["groupArrived", "orderPlaced", "patienceExpired", "shiftFailed"]));
	});

	it("бот проходит смену: события подач и завершения, итог completed=true, очки в границах", { timeout: 120000 }, () => {
		const level = getLevelConfig(levelId);
		const simulation = createSimulation({ level, seed: level.verifiedSeeds[0] });
		const seen = new Set<string>();
		simulation.subscribe((event) => seen.add(event.type));
		const run = runBot(simulation);
		expect(run.result?.completed).toBe(true);
		expect(run.result?.reason).toBe("allServed");
		expect(run.snapshot.phase).toBe("finished");
		expect(run.snapshot.servedCustomers).toBe(run.snapshot.totalCustomers);
		expect(run.snapshot.score).toBeGreaterThan(0);
		expect(run.snapshot.score).toBeLessThanOrEqual(run.snapshot.maxScore);
		for (const type of ["groupArrived", "groupSeated", "orderPlaced", "dishAccepted", "waiterPickedUp", "dishServed", "groupServed", "shiftFinished", "cookingStarted", "cookingDone"]) {
			expect(seen.has(type), type).toBe(true);
		}
	});
});
