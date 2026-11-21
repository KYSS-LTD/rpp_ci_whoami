// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DISH_IDS, GAME_PROGRESS_VERSION, MAX_GAME_PROGRESS_BYTES } from "./contracts";
import { createEmptyProgress, isProgressWithinLimit, listDishesNeedingTutorial, markDishCooked, measureProgressBytes, parseGameProgress } from "./progress";

describe("прогресс игры", () => {
	it("пустой прогресс и разбор корректного блока", () => {
		expect(createEmptyProgress()).toEqual({ version: GAME_PROGRESS_VERSION, cookedDishes: [] });
		expect(parseGameProgress({ version: 1, cookedDishes: ["burger", "ham"] })).toEqual({ version: 1, cookedDishes: ["burger", "ham"] });
	});

	it("сценарий 'Битый блок': неизвестная версия, не объект и неверная форма читаются как пустой прогресс", () => {
		for (const broken of [null, undefined, 5, "строка", [], { version: 2, cookedDishes: ["burger"] }, { version: 1 }, { version: 1, cookedDishes: "burger" }]) {
			expect(parseGameProgress(broken)).toEqual(createEmptyProgress());
		}
	});

	it("неизвестные блюда и повторы отбрасываются", () => {
		expect(parseGameProgress({ version: 1, cookedDishes: ["burger", "pizza", "burger", 7, "stew"] })).toEqual({ version: 1, cookedDishes: ["burger", "stew"] });
	});

	it("отметка блюда: новое блюдо добавляется, повтор даёт null, исходный блок не меняется", () => {
		const empty = createEmptyProgress();
		const marked = markDishCooked(empty, "burger");
		expect(marked).toEqual({ version: 1, cookedDishes: ["burger"] });
		expect(empty.cookedDishes).toEqual([]);
		expect(markDishCooked(marked!, "burger")).toBeNull();
	});

	it("сценарий 'Список блюд для подсказок': блюда меню без прогресса в порядке меню", () => {
		const progress = { version: 1 as const, cookedDishes: ["burger" as const, "ham" as const] };
		expect(listDishesNeedingTutorial(["burger", "ham", "veggieBurger"], progress)).toEqual(["veggieBurger"]);
		expect(listDishesNeedingTutorial(["burger", "ham"], progress)).toEqual([]);
		expect(listDishesNeedingTutorial(["stew", "burger"], createEmptyProgress())).toEqual(["stew", "burger"]);
	});

	it("блок со всеми блюдами в разы меньше лимита портала", () => {
		const full = { version: 1 as const, cookedDishes: [...DISH_IDS] };
		expect(measureProgressBytes(full)).toBeLessThan(MAX_GAME_PROGRESS_BYTES / 10);
		expect(isProgressWithinLimit(full)).toBe(true);
	});
});
