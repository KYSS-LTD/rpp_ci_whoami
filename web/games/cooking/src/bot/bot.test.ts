// @vitest-environment node
// Тесты эталонного бота (задача 8.4): бот проходит смену в симуляции без рендера, навигатор бота находит подходы ко всем станциям.
import { describe, expect, it } from "vitest";
import { LEVEL_IDS } from "../contracts";
import { getLevelConfig } from "../config/levels";
import { createSimulation } from "../sim/simulation";
import { createTestLevel } from "../sim/testing/testLevel";
import { createBot, runBot } from "./bot";
import { createChefNavigator } from "./chefNav";
import { buildGeometry } from "../sim/geometry";

// Щедрое терпение, чтобы проверять только работу бота, а не баланс.
const generousPatience = { queueSec: 120, tableBaseSec: 90, tableEffortCoef: 2, tableWaiterAllowanceSec: 30 };

describe("эталонный бот", () => {
	it("проходит тестовый мини-уровень с completed=true", () => {
		const level = createTestLevel({ menu: ["burger", "ham"], durationSec: 180, patience: generousPatience });
		const simulation = createSimulation({ level, seed: 1 });
		const run = runBot(simulation);
		expect(run.result?.completed).toBe(true);
		expect(run.result?.reason).toBe("allServed");
		expect(run.snapshot.servedCustomers).toBe(run.snapshot.totalCustomers);
		expect(run.stats.macroFailures).toBe(0);
		expect(run.stats.deliveries).toBe(run.snapshot.totalCustomers);
		expect(run.result?.score).toBeGreaterThan(0);
		expect(run.result?.score).toBeLessThanOrEqual(run.result?.maxScore ?? 0);
	});

	it("готовит все четыре блюда: бургер, окорок, овощной бургер и рагу", () => {
		const level = createTestLevel({ menu: ["burger", "ham", "veggieBurger", "stew"], durationSec: 300, patience: generousPatience });
		const simulation = createSimulation({ level, seed: 5 });
		const dishesInSchedule = new Set(simulation.schedule.groups.flatMap((group) => group.members.map((member) => member.dish)));
		expect(dishesInSchedule.size).toBeGreaterThanOrEqual(3);
		const run = runBot(simulation);
		expect(run.result?.completed).toBe(true);
		for (const dish of dishesInSchedule) {
			expect(run.stats.deliveriesByDish[dish] ?? 0, dish).toBeGreaterThan(0);
		}
	});

	it("воспроизводим: одинаковый seed даёт одинаковый ход и результат", () => {
		const play = (): string => {
			const level = createTestLevel({ menu: ["burger", "ham"], durationSec: 180, patience: generousPatience });
			const run = runBot(createSimulation({ level, seed: 3 }));
			return JSON.stringify({ result: run.result, steps: run.steps, deliveries: run.stats.deliveries });
		};
		expect(play()).toBe(play());
	});

	it("после конца смены бот ничего не делает", () => {
		const level = createTestLevel({ menu: ["burger", "ham"], durationSec: 180, patience: generousPatience });
		const simulation = createSimulation({ level, seed: 1 });
		const bot = createBot(simulation);
		simulation.start();
		let guard = 0;
		while (simulation.getResult() === null && guard < 60 * 200) {
			simulation.step(bot.nextInput());
			guard += 1;
		}
		const input = bot.nextInput();
		expect(input.actionPressed).toBe(false);
		expect(input.moveVector).toEqual({ x: 0, z: 0 });
	});
});

describe.each(LEVEL_IDS)("навигатор бота на уровне %s", (levelId) => {
	it("у каждой станции есть рабочая точка, и хотя бы до одной есть путь от старта повара", () => {
		const level = getLevelConfig(levelId);
		const navigator = createChefNavigator(level, buildGeometry(level));
		for (const station of level.stations) {
			const spots = navigator.getWorkSpots(station.id);
			expect(spots.length, station.id).toBeGreaterThan(0);
			// Часть точек может лежать в замкнутых карманах между мебелью: достаточно одной достижимой.
			expect(spots.some((spot) => navigator.pathLength(level.chefStart.position, spot.position) !== null), station.id).toBe(true);
		}
	});
});
