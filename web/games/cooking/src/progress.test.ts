// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DISH_IDS, GAME_PROGRESS_VERSION, MAX_GAME_PROGRESS_BYTES, type GameProgress } from "./contracts";
import { createEmptyProgress, isProgressWithinLimit, listDishesNeedingTutorial, markDishCooked, measureProgressBytes, parseGameProgress } from "./progress";

const emptyProgress: GameProgress = {
	version: GAME_PROGRESS_VERSION,
	cookedDishes: [],
	completedDays: { easy: 0, medium: 0, hard: 0 },
	weekScores: { easy: { score: 0, maxScore: 0 }, medium: { score: 0, maxScore: 0 }, hard: { score: 0, maxScore: 0 } },
};

describe("прогресс игры", () => {
	it("пустой прогресс, миграция старого блока и чтение текущего", () => {
		expect(createEmptyProgress()).toEqual(emptyProgress);
		expect(parseGameProgress({ version: 1, cookedDishes: ["burger", "ham"] })).toEqual({ ...emptyProgress, cookedDishes: ["burger", "ham"] });
		const current = {
			...emptyProgress,
			cookedDishes: ["ham"],
			completedDays: { ...emptyProgress.completedDays, easy: 1 },
			weekScores: { ...emptyProgress.weekScores, easy: { score: 10, maxScore: 20 } },
		};
		expect(parseGameProgress(current)).toEqual(current);
	});

	it("сценарий 'Битый блок': неизвестная версия, не объект и неверная форма читаются как пустой прогресс", () => {
		for (const broken of [null, undefined, 5, "строка", [], { version: 99, cookedDishes: ["burger"] }, { version: 1 }, { version: GAME_PROGRESS_VERSION, cookedDishes: "burger" }]) {
			expect(parseGameProgress(broken)).toEqual(emptyProgress);
		}
	});

	it("неизвестные блюда и повторы отбрасываются", () => {
		expect(parseGameProgress({ version: 1, cookedDishes: ["burger", "pizza", "burger", 7, "stew"] })).toEqual({ ...emptyProgress, cookedDishes: ["burger", "stew"] });
	});

	it("отметка блюда: новое блюдо добавляется, повтор даёт null, исходный блок не меняется", () => {
		const empty = createEmptyProgress();
		const marked = markDishCooked(empty, "burger");
		expect(marked).toEqual({ ...emptyProgress, cookedDishes: ["burger"] });
		expect(empty.cookedDishes).toEqual([]);
		expect(markDishCooked(marked!, "burger")).toBeNull();
	});

	it("сценарий 'Список блюд для подсказок': блюда меню без прогресса в порядке меню", () => {
		const progress: GameProgress = { ...emptyProgress, cookedDishes: ["burger", "ham"] };
		expect(listDishesNeedingTutorial(["burger", "ham", "veggieBurger"], progress)).toEqual(["veggieBurger"]);
		expect(listDishesNeedingTutorial(["burger", "ham"], progress)).toEqual([]);
		expect(listDishesNeedingTutorial(["stew", "burger"], createEmptyProgress())).toEqual(["stew", "burger"]);
	});

	it("блок со всеми блюдами в разы меньше лимита портала", () => {
		const full: GameProgress = { ...emptyProgress, cookedDishes: [...DISH_IDS] };
		expect(measureProgressBytes(full)).toBeLessThan(MAX_GAME_PROGRESS_BYTES / 10);
		expect(isProgressWithinLimit(full)).toBe(true);
	});
});
