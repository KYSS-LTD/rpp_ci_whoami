// @vitest-environment node
// Тесты уровней с ботом (задачи 8.5 и 8.6): достижимость целей по навигационной сетке, отсутствие дедлоков, очередь не
// переполняется, проверенные seed действительно проходятся ботом, невыполнимый seed отбрасывается, расписание использует меню.
import { describe, expect, it } from "vitest";
import { LEVEL_IDS, type LevelId } from "../contracts";
import { getLevelConfig, pickVerifiedSeed } from "../config/levels";
import { findUnreachableTargetsOnNavGrid } from "../config/levels/reachability";
import { buildDaySchedule } from "../sim/customers/schedule";
import { findVerifiedSeeds, MIN_PATIENCE_MARGIN, STUCK_THRESHOLD_SEC, verifySeed } from "./verify";

describe.each(LEVEL_IDS)("уровень %s: достижимость по навигационной сетке", (levelId: LevelId) => {
	it("сценарий 'Проверка при тестировании': ни одна цель не недостижима из старта повара и из точек ожидания официантов", () => {
		const level = getLevelConfig(levelId);
		// Кухня отделена от зала стеной с окном выдачи: повар достаёт все станции, официанты все цели зала.
		expect(findUnreachableTargetsOnNavGrid(level, level.chefStart.position, "kitchen")).toEqual([]);
		level.waiters.waitPoints.forEach((waitPoint) => expect(findUnreachableTargetsOnNavGrid(level, waitPoint, "hall")).toEqual([]));
	});
});

describe.each(LEVEL_IDS)("уровень %s: проверенные seed и бот", (levelId: LevelId) => {
	const level = getLevelConfig(levelId);

	it("сценарии 'Прохождение ботом' и 'Проверка ботом', отсутствие дедлоков: на каждом проверенном seed смена пройдена, очередь не переполнена, терпение не истекло, никто не стоит без движения дольше порога", { timeout: 600000 }, () => {
		for (const seed of level.verifiedSeeds) {
			const report = verifySeed(() => getLevelConfig(levelId), seed);
			expect(report.problems, `seed ${seed}`).toEqual([]);
			expect(report.ok).toBe(true);
			expect(report.completed).toBe(true);
			expect(report.served).toBe(report.total);
			expect(report.maxQueueGroups).toBeLessThanOrEqual(report.queueSlots);
			expect(report.minPatienceRatio).toBeGreaterThanOrEqual(MIN_PATIENCE_MARGIN);
			expect(report.maxStuckSec).toBeLessThanOrEqual(STUCK_THRESHOLD_SEC);
		}
	});

	it("сценарий 'Выбор seed': seed берётся из списка проверенных, а расписание содержит только блюда меню и все блюда меню", () => {
		for (let draw = 0; draw < 5; draw += 1) {
			expect(level.verifiedSeeds).toContain(pickVerifiedSeed(level, () => draw / 5));
		}
		for (const seed of level.verifiedSeeds) {
			const schedule = buildDaySchedule(level, seed);
			const dishes = new Set(schedule.groups.flatMap((group) => group.members.map((member) => member.dish)));
			dishes.forEach((dish) => expect(level.params.menu).toContain(dish));
			level.params.menu.forEach((dish) => expect(dishes.has(dish), `seed ${seed}: блюдо ${dish}`).toBe(true));
		}
	});
});

describe("невыполнимый seed", () => {
	it("сценарий 'Невыполнимый seed отбрасывается': при нулевом терпении бот не проходит уровень и seed не попадает в список", { timeout: 300000 }, () => {
		const makeImpossibleLevel = () => {
			const level = getLevelConfig("easy");
			level.params.patience = { queueSec: 2, tableBaseSec: 2, tableEffortCoef: 0, tableWaiterAllowanceSec: 0 };
			return level;
		};
		const report = verifySeed(makeImpossibleLevel, 1);
		expect(report.ok).toBe(false);
		expect(report.completed).toBe(false);
		expect(report.problems.join(" ")).toContain("клиент ушёл");
		expect(findVerifiedSeeds(makeImpossibleLevel, [1, 2, 3], 2)).toEqual([]);
	});

	it("отбор берёт только подходящие seed и останавливается на нужном числе", { timeout: 300000 }, () => {
		const seeds = findVerifiedSeeds(() => getLevelConfig("easy"), [1, 2, 3, 4], 2);
		expect(seeds).toEqual([1, 2]);
	});
});

describe("сценарий 'Сравнение уровней' с ботом", () => {
	it("уровни растут по нагрузке: больше блюд в смене от easy к hard (по проверенным seed)", { timeout: 300000 }, () => {
		const averageTotal = (levelId: LevelId): number => {
			const level = getLevelConfig(levelId);
			const totals = level.verifiedSeeds.map((seed) => buildDaySchedule(level, seed).totalCustomers);
			return totals.reduce((sum, total) => sum + total, 0) / totals.length;
		};
		expect(averageTotal("medium")).toBeGreaterThanOrEqual(averageTotal("easy"));
		expect(averageTotal("hard")).toBeGreaterThanOrEqual(averageTotal("medium"));
	});
});
