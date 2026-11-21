// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DaySchedule, DishId, LevelConfig } from "../../contracts";
import { createTestLevel } from "../testing/testLevel";
import { CUSTOMER_VARIANT_COUNT, buildDaySchedule, computeMaxWindowLoad, type ScheduleArrival } from "./schedule";

// Набор seed для статистических проверок.
const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);

// Приходы расписания с трудоёмкостью по параметрам уровня.
function toArrivals(schedule: DaySchedule, level: LevelConfig): ScheduleArrival[] {
	return schedule.groups.map((group) => ({
		timeSec: group.arrivalSec,
		effort: group.members.reduce((total, member) => total + level.params.dishes[member.dish].effort, 0),
	}));
}

// Множество блюд расписания.
function dishesOf(schedule: DaySchedule): Set<DishId> {
	return new Set(schedule.groups.flatMap((group) => group.members.map((member) => member.dish)));
}

describe("расписание дня: построение по seed (5.1)", () => {
	it("Воспроизводимость: один seed даёт одинаковые приходы, группы и блюда", () => {
		const level = createTestLevel();
		SEEDS.forEach((seed) => {
			expect(buildDaySchedule(level, seed)).toEqual(buildDaySchedule(level, seed));
		});
	});

	it("разные seed дают разные расписания", () => {
		const level = createTestLevel();
		const first = buildDaySchedule(level, 1);
		const different = SEEDS.slice(1).filter((seed) => JSON.stringify(buildDaySchedule(level, seed)) !== JSON.stringify(first));
		expect(different.length).toBeGreaterThan(SEEDS.length - 5);
	});

	it("Случайный состав блюд: наборы различаются между seed, но блюда только из меню", () => {
		const level = createTestLevel({ menu: ["burger", "ham", "veggieBurger"] });
		const sets = SEEDS.map((seed) => [...dishesOf(buildDaySchedule(level, seed))].sort().join(","));
		expect(new Set(sets).size).toBeGreaterThan(1);
		SEEDS.forEach((seed) => {
			dishesOf(buildDaySchedule(level, seed)).forEach((dish) => expect(level.params.menu).toContain(dish));
		});
	});

	it("меню из двух блюд даёт только эти блюда, а за весь набор seed встречаются оба", () => {
		const level = createTestLevel({ menu: ["burger", "ham"] });
		const all = new Set<DishId>();
		SEEDS.forEach((seed) => dishesOf(buildDaySchedule(level, seed)).forEach((dish) => all.add(dish)));
		expect([...all].sort()).toEqual(["burger", "ham"]);
	});

	it("меню с рагу: рагу встречается в расписании", () => {
		const level = createTestLevel({ menu: ["burger", "ham", "veggieBurger", "stew"] });
		const hasStew = SEEDS.some((seed) => dishesOf(buildDaySchedule(level, seed)).has("stew"));
		expect(hasStew).toBe(true);
	});

	it("Последний приход: никто не приходит позже длительности смены минус время закрытия потока", () => {
		[
			createTestLevel(),
			createTestLevel({ durationSec: 240 }),
			createTestLevel({ durationSec: 300, schedule: { flowCloseBeforeEndSec: 90 } }),
			createTestLevel({ durationSec: 120, schedule: { flowCloseBeforeEndSec: 30, meanGapSec: 6, minGapSec: 3 } }),
		].forEach((level) => {
			const lastAllowedSec = level.params.durationSec - level.params.schedule.flowCloseBeforeEndSec;
			SEEDS.forEach((seed) => {
				const schedule = buildDaySchedule(level, seed);
				schedule.groups.forEach((group) => {
					expect(group.arrivalSec).toBeLessThanOrEqual(lastAllowedSec);
					expect(group.arrivalSec).toBeGreaterThanOrEqual(level.params.schedule.firstArrivalSec);
				});
			});
		});
	});

	it("группы идут по возрастанию времени, промежутки не короче минимального", () => {
		const level = createTestLevel();
		SEEDS.forEach((seed) => {
			const { groups } = buildDaySchedule(level, seed);
			for (let index = 1; index < groups.length; index += 1) {
				expect(groups[index].arrivalSec - groups[index - 1].arrivalSec).toBeGreaterThanOrEqual(level.params.schedule.minGapSec - 1e-9);
			}
		});
	});

	it("первая группа приходит в заданное время", () => {
		const level = createTestLevel({ schedule: { firstArrivalSec: 7 } });
		expect(buildDaySchedule(level, 3).groups[0].arrivalSec).toBe(7);
	});

	it("средний промежуток между приходами близок к заданному среднему", () => {
		// Длинная смена и огромный бюджет: ограничение нагрузки не вмешивается.
		const level = createTestLevel({ durationSec: 6000, schedule: { workBudgetShare: 1000, meanGapSec: 18, minGapSec: 8 } });
		const gaps: number[] = [];
		SEEDS.forEach((seed) => {
			const { groups } = buildDaySchedule(level, seed);
			for (let index = 1; index < groups.length; index += 1) {
				gaps.push(groups[index].arrivalSec - groups[index - 1].arrivalSec);
			}
		});
		const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
		expect(mean).toBeGreaterThan(17);
		expect(mean).toBeLessThan(19);
		expect(Math.max(...gaps)).toBeLessThanOrEqual(28 + 1e-9);
	});

	it("размер группы от 1 до 4 и не больше числа мест самого большого стола уровня", () => {
		const level = createTestLevel({ schedule: { groupSizeWeights: [1, 1, 1, 1, 1, 1], workBudgetShare: 1000 } });
		const sizes = new Set<number>();
		SEEDS.forEach((seed) => buildDaySchedule(level, seed).groups.forEach((group) => sizes.add(group.members.length)));
		expect([...sizes].sort()).toEqual([1, 2, 3, 4]);
	});

	it("уровень только со столами на два места не получает группы крупнее двух", () => {
		const base = createTestLevel({ schedule: { groupSizeWeights: [1, 1, 1, 1], workBudgetShare: 1000 } });
		const level: LevelConfig = { ...base, tables: [base.tables[0]] };
		SEEDS.forEach((seed) => {
			buildDaySchedule(level, seed).groups.forEach((group) => expect(group.members.length).toBeLessThanOrEqual(2));
		});
	});

	it("идентификаторы по контракту, вариант внешности в допустимых границах", () => {
		const schedule = buildDaySchedule(createTestLevel(), 5);
		schedule.groups.forEach((group, groupIndex) => {
			expect(group.groupId).toBe(`g-${groupIndex + 1}`);
			group.members.forEach((member, memberIndex) => {
				expect(member.customerId).toBe(`c-${groupIndex + 1}-${memberIndex + 1}`);
				expect(member.variant).toBeGreaterThanOrEqual(0);
				expect(member.variant).toBeLessThan(CUSTOMER_VARIANT_COUNT);
			});
		});
		expect(schedule.seed).toBe(5);
		expect(schedule.levelId).toBe("easy");
	});

	it("totalCustomers и maxScore считаются по расписанию: сумма цены и максимальных чаевых", () => {
		const level = createTestLevel();
		SEEDS.forEach((seed) => {
			const schedule = buildDaySchedule(level, seed);
			const customers = schedule.groups.flatMap((group) => group.members);
			expect(schedule.totalCustomers).toBe(customers.length);
			const expectedMaxScore = customers.reduce((total, member) => total + level.params.dishes[member.dish].price + level.params.dishes[member.dish].maxTip, 0);
			expect(schedule.maxScore).toBe(expectedMaxScore);
			expect(schedule.maxScore).toBeGreaterThan(0);
		});
	});

	it("пустое расписание и пустое меню отвергаются понятной ошибкой", () => {
		expect(() => buildDaySchedule(createTestLevel({ menu: [] }), 1)).toThrow(RangeError);
		expect(() => buildDaySchedule(createTestLevel({ schedule: { firstArrivalSec: 500 } }), 1)).toThrow(RangeError);
	});
});

describe("расписание дня: бюджет работы (5.2)", () => {
	it("нагрузка в любом скользящем окне не превышает долю пропускной способности бота", () => {
		const levels = [
			createTestLevel(),
			createTestLevel({ durationSec: 300, schedule: { meanGapSec: 10, minGapSec: 4, workBudgetShare: 0.5 } }),
			createTestLevel({ durationSec: 300, schedule: { meanGapSec: 6, minGapSec: 2, workBudgetShare: 0.7, workWindowSec: 90 } }),
		];
		levels.forEach((level) => {
			const { workBudgetShare, botCapacity, workWindowSec } = level.params.schedule;
			const budget = workBudgetShare * botCapacity * workWindowSec;
			SEEDS.forEach((seed) => {
				const load = computeMaxWindowLoad(toArrivals(buildDaySchedule(level, seed), level), workWindowSec);
				expect(load).toBeLessThanOrEqual(budget + 1e-6);
			});
		});
	});

	it("тесный бюджет откладывает приходы и урезает крупные группы, но не нарушается", () => {
		const loose = createTestLevel({ durationSec: 300, schedule: { meanGapSec: 8, minGapSec: 4, workBudgetShare: 1000 } });
		const tight = createTestLevel({ durationSec: 300, schedule: { meanGapSec: 8, minGapSec: 4, workBudgetShare: 0.4, workWindowSec: 60 } });
		const budget = 0.4 * 1 * 60;
		let looseCustomers = 0;
		let tightCustomers = 0;
		SEEDS.forEach((seed) => {
			const looseSchedule = buildDaySchedule(loose, seed);
			const tightSchedule = buildDaySchedule(tight, seed);
			looseCustomers += looseSchedule.totalCustomers;
			tightCustomers += tightSchedule.totalCustomers;
			expect(computeMaxWindowLoad(toArrivals(tightSchedule, tight), 60)).toBeLessThanOrEqual(budget + 1e-6);
		});
		expect(tightCustomers).toBeLessThan(looseCustomers);
	});

	it("одна группа не превышает бюджет окна сама по себе", () => {
		const level = createTestLevel({ schedule: { workBudgetShare: 0.5, workWindowSec: 60, groupSizeWeights: [0, 0, 0, 1] } });
		const budget = 0.5 * 60;
		SEEDS.forEach((seed) => {
			toArrivals(buildDaySchedule(level, seed), level).forEach((arrival) => expect(arrival.effort).toBeLessThanOrEqual(budget + 1e-9));
		});
	});

	it("бюджет меньше трудоёмкости одного блюда: расписание построить нельзя", () => {
		const level = createTestLevel({ schedule: { workBudgetShare: 0.01 } });
		expect(() => buildDaySchedule(level, 1)).toThrow(RangeError);
	});

	it("computeMaxWindowLoad считает окна, начинающиеся в момент прихода", () => {
		const arrivals: ScheduleArrival[] = [
			{ timeSec: 0, effort: 10 },
			{ timeSec: 30, effort: 20 },
			{ timeSec: 59.9, effort: 5 },
			{ timeSec: 60, effort: 7 },
			{ timeSec: 125, effort: 1 },
		];
		// Окно от 0: приходы 0, 30, 59.9 (60 уже вне окна): 35. Окно от 30: 30, 59.9, 60: 32. Максимум 35.
		expect(computeMaxWindowLoad(arrivals, 60)).toBe(35);
		expect(computeMaxWindowLoad([], 60)).toBe(0);
	});

	it("откладывание не выводит приход за границу закрытия потока", () => {
		const level = createTestLevel({ schedule: { workBudgetShare: 0.35, workWindowSec: 120, groupSizeWeights: [1] } });
		const lastAllowedSec = level.params.durationSec - level.params.schedule.flowCloseBeforeEndSec;
		SEEDS.forEach((seed) => {
			buildDaySchedule(level, seed).groups.forEach((group) => expect(group.arrivalSec).toBeLessThanOrEqual(lastAllowedSec));
		});
	});
});
