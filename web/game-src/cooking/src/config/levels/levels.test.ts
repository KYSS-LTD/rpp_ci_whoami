// @vitest-environment node
// Тесты данных уровней easy, medium, hard (задачи 8.1, 8.2, 8.3) и сравнение уровней между собой (спецификация cooking-levels).
import { describe, expect, it } from "vitest";
import { DISH_IDS, LEVEL_IDS, type IngredientKind, type LevelConfig, type LevelId, type StationKind } from "../../contracts";
import { assetModelNames } from "../assets";
import { buildDaySchedule } from "../../sim/customers/schedule";
import { getLevelConfig, isLevelId, pickVerifiedSeed } from "./index";
import { findUnreachableTargets } from "./reachability";
import { validateLevelConfig } from "./validate";

// Ингредиенты, которые нужны блюдам (для проверки наличия ящиков у меню).
const dishIngredients: Record<(typeof DISH_IDS)[number], IngredientKind[]> = {
	burger: ["steak", "bun"],
	ham: ["ham"],
	veggieBurger: ["bun", "potato", "carrot"],
	stew: ["carrot", "potato", "onion"],
};

// Считает станции вида.
function countStations(level: LevelConfig, kind: StationKind): number {
	return level.stations.filter((station) => station.kind === kind).length;
}

// Ингредиенты, у которых есть ящик.
function listCrateIngredients(level: LevelConfig): IngredientKind[] {
	return level.stations.filter((station) => station.kind === "crate" && station.ingredient).map((station) => station.ingredient as IngredientKind);
}

// Все имена моделей, которые уровень использует в данных.
function collectUsedModels(level: LevelConfig): string[] {
	const models: string[] = [];
	level.props.forEach((prop) => prop.model && models.push(prop.model));
	level.stations.forEach((station) => station.model && models.push(station.model));
	level.tables.forEach((table) => {
		models.push(table.model);
		table.seats.forEach((seat) => models.push(seat.chairModel));
	});
	return models;
}

describe.each(LEVEL_IDS)("общие проверки уровня %s", (levelId: LevelId) => {
	const level = getLevelConfig(levelId);

	it("данные уровня проходят структурную проверку", () => {
		expect(validateLevelConfig(level)).toEqual([]);
	});

	it("сценарий 'Проверка при тестировании': все цели достижимы из старта повара и из точки ожидания официанта", () => {
		expect(findUnreachableTargets(level, level.chefStart.position)).toEqual([]);
		level.waiters.waitPoints.forEach((waitPoint) => expect(findUnreachableTargets(level, waitPoint)).toEqual([]));
	});

	it("сценарий 'Группа помещается': есть стол, вмещающий самую большую группу расписания", () => {
		const largestGroup = level.params.schedule.groupSizeWeights.length;
		const largestTable = Math.max(...level.tables.map((table) => table.seats.length));
		expect(largestGroup).toBeLessThanOrEqual(4);
		expect(largestTable).toBeGreaterThanOrEqual(largestGroup);
		level.tables.forEach((table) => expect([2, 4]).toContain(table.seats.length));
	});

	it("уровень содержит минимальный набор станций для меню", () => {
		expect(countStations(level, "cuttingBoard")).toBeGreaterThanOrEqual(2);
		expect(countStations(level, "pan")).toBeGreaterThanOrEqual(2);
		expect(countStations(level, "oven")).toBeGreaterThanOrEqual(1);
		expect(countStations(level, "plateStack")).toBeGreaterThanOrEqual(1);
		expect(countStations(level, "trash")).toBeGreaterThanOrEqual(1);
		expect(countStations(level, "servingWindow")).toBe(1);
		const crates = listCrateIngredients(level);
		level.params.menu.forEach((dish) => dishIngredients[dish].forEach((ingredient) => expect(crates, `${dish}: ящик ${ingredient}`).toContain(ingredient)));
	});

	it("все модели из данных уровня есть в списке ассетов", () => {
		const known = new Set<string>(assetModelNames);
		const missing = collectUsedModels(level).filter((model) => !known.has(model));
		expect([...new Set(missing)]).toEqual([]);
	});

	it("камера кадрирует весь мир, слоты очереди внутри кадра, слотов очереди не меньше числа столов", () => {
		expect(level.view).toEqual(level.bounds);
		level.queue.slots.forEach((slot) => {
			expect(slot.position.x).toBeGreaterThan(level.view.x);
			expect(slot.position.z).toBeLessThan(level.view.z + level.view.depth);
		});
		expect(level.queue.slots.length).toBeGreaterThanOrEqual(level.tables.length);
	});

	it("список seed непустой, выбор берёт seed из списка", () => {
		expect(level.verifiedSeeds.length).toBeGreaterThan(0);
		expect(level.verifiedSeeds).toContain(pickVerifiedSeed(level));
		expect(pickVerifiedSeed(level, () => 0)).toBe(level.verifiedSeeds[0]);
		expect(pickVerifiedSeed(level, () => 0.999999)).toBe(level.verifiedSeeds[level.verifiedSeeds.length - 1]);
	});

	it("уровень выбирается по идентификатору и не делит данные между вызовами", () => {
		expect(isLevelId(levelId)).toBe(true);
		expect(getLevelConfig(levelId)).not.toBe(level);
		expect(getLevelConfig(levelId)).toEqual(level);
	});
});

describe("уровень easy (задача 8.1)", () => {
	const level = getLevelConfig("easy");

	it("сценарий 'Таймер уровня': смена easy длится 180 секунд", () => {
		expect(level.params.durationSec).toBe(180);
	});

	it("сценарий 'Число столов': в зале три стола", () => {
		expect(level.tables).toHaveLength(3);
	});

	it("сценарий 'Блюда easy': меню из бургера и окорока, один официант с одной тарелкой, кастрюли нет", () => {
		expect(level.params.menu).toEqual(["burger", "ham"]);
		expect(level.waiters.waitPoints).toHaveLength(1);
		expect(level.params.waiter.capacity).toBe(1);
		expect(countStations(level, "pot")).toBe(0);
	});
});

describe("уровень medium (задача 8.2)", () => {
	const level = getLevelConfig("medium");

	it("сценарий 'Таймер уровня': смена medium длится 240 секунд, то есть таймер начинается с 4:00", () => {
		expect(level.params.durationSec).toBe(240);
	});

	it("в зале четыре стола, один официант с одной тарелкой, кастрюли нет", () => {
		expect(level.tables).toHaveLength(4);
		expect(level.waiters.waitPoints).toHaveLength(1);
		expect(level.params.waiter.capacity).toBe(1);
		expect(countStations(level, "pot")).toBe(0);
	});

	it("сценарий 'Ящики для меню': есть ящики стейка, булочек, ветчины, картофеля и моркови; в меню добавлен овощной бургер", () => {
		expect(level.params.menu).toEqual(["burger", "ham", "veggieBurger"]);
		const crates = listCrateIngredients(level);
		["steak", "bun", "ham", "potato", "carrot"].forEach((ingredient) => expect(crates).toContain(ingredient));
	});
});

describe("уровень hard (задача 8.3)", () => {
	const level = getLevelConfig("hard");

	it("смена hard длится 300 секунд, в зале шесть столов", () => {
		expect(level.params.durationSec).toBe(300);
		expect(level.tables).toHaveLength(6);
	});

	it("сценарий 'Кастрюля на hard': на плите стоит кастрюля, а на easy и medium кастрюли нет", () => {
		expect(countStations(level, "pot")).toBeGreaterThanOrEqual(1);
		expect(countStations(getLevelConfig("easy"), "pot")).toBe(0);
		expect(countStations(getLevelConfig("medium"), "pot")).toBe(0);
	});

	it("сценарий 'Два официанта': в зале работают два официанта по две тарелки", () => {
		expect(level.waiters.waitPoints).toHaveLength(2);
		expect(level.params.waiter.capacity).toBe(2);
	});

	it("сценарий 'Рагу на hard': рагу входит в меню и есть ящик лука для него", () => {
		expect(level.params.menu).toContain("stew");
		expect(listCrateIngredients(level)).toContain("onion");
	});
});

describe("сравнение уровней (спецификация cooking-levels)", () => {
	const easy = getLevelConfig("easy");
	const medium = getLevelConfig("medium");
	const hard = getLevelConfig("hard");
	const ordered = [easy, medium, hard];

	// Терпение клиента за столом для блюда (базовое + коэффициент * трудоёмкость + запас на путь официанта).
	const tablePatience = (level: LevelConfig, dish: (typeof DISH_IDS)[number]): number =>
		level.params.patience.tableBaseSec + level.params.patience.tableEffortCoef * level.params.dishes[dish].effort + level.params.patience.tableWaiterAllowanceSec;

	it("сценарий 'Сравнение уровней': терпение для бургера не возрастает от easy к hard (и в очереди)", () => {
		for (let index = 0; index + 1 < ordered.length; index += 1) {
			expect(tablePatience(ordered[index], "burger")).toBeGreaterThanOrEqual(tablePatience(ordered[index + 1], "burger"));
			expect(ordered[index].params.patience.queueSec).toBeGreaterThanOrEqual(ordered[index + 1].params.patience.queueSec);
		}
	});

	it("поток клиентов на единицу времени не убывает от easy к hard", () => {
		for (let index = 0; index + 1 < ordered.length; index += 1) {
			expect(ordered[index].params.schedule.meanGapSec).toBeGreaterThanOrEqual(ordered[index + 1].params.schedule.meanGapSec);
		}
	});

	it("фактический поток клиентов в минуту окна приходов (по проверенным seed) не убывает от easy к hard", () => {
		const flowsOf = (level: LevelConfig): number[] =>
			level.verifiedSeeds.map((seed) => buildDaySchedule(level, seed).totalCustomers / ((level.params.durationSec - level.params.schedule.flowCloseBeforeEndSec) / 60));
		const median = (values: number[]): number => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)];
		const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
		const easyFlows = flowsOf(easy);
		const mediumFlows = flowsOf(medium);
		const hardFlows = flowsOf(hard);
		expect(median(mediumFlows)).toBeGreaterThanOrEqual(median(easyFlows));
		expect(median(hardFlows)).toBeGreaterThanOrEqual(median(mediumFlows));
		expect(mean(mediumFlows)).toBeGreaterThanOrEqual(mean(easyFlows));
		expect(mean(hardFlows)).toBeGreaterThanOrEqual(mean(mediumFlows));
	});

	it("доля бюджета работы (нагрузка на бота) не убывает от easy к hard", () => {
		for (let index = 0; index + 1 < ordered.length; index += 1) {
			expect(ordered[index].params.schedule.workBudgetShare).toBeLessThanOrEqual(ordered[index + 1].params.schedule.workBudgetShare);
		}
	});

	it("длительность смены растёт: 180, 240, 300 секунд, число столов 3, 4, 6", () => {
		expect(ordered.map((level) => level.params.durationSec)).toEqual([180, 240, 300]);
		expect(ordered.map((level) => level.tables.length)).toEqual([3, 4, 6]);
	});

	it("уровни не делят объекты между собой", () => {
		expect(easy.stations).not.toBe(medium.stations);
		expect(easy.params).not.toBe(medium.params);
	});
});
