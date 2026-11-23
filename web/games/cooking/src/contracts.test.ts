// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	DISH_IDS,
	EMPTY_INPUT,
	FACING_COUNT,
	FACING_VECTORS,
	GRID_STEP,
	ITEM_CATALOG,
	LEVEL_IDS,
	MODEL_SCALE,
	SIM_STEP_SEC,
	type IngredientKind,
	type ItemState,
} from "./contracts";

// Допустимые виды и состояния: тип проверяет, что каталог не использует лишнего.
const knownKinds: readonly IngredientKind[] = ["steak", "bun", "ham", "potato", "carrot", "onion", "patty", "veggiePatty", "friedSteak", "stew"];
const knownStates: readonly ItemState[] = ["raw", "chopped", "cooked", "burnt"];

describe("контракты игры", () => {
	it("каждый экспортируемый тип, интерфейс и константа описаны комментарием на русском", () => {
		const source = readFileSync(resolve(__dirname, "contracts.ts"), "utf8").split(/\r?\n/);
		const missing: string[] = [];
		source.forEach((line, index) => {
			const declaration = /^export (?:interface|type|const|function) (\w+)/.exec(line);
			if (!declaration) {
				return;
			}
			// Комментарий лежит непосредственно над объявлением (подряд идущие строки //).
			let cursor = index - 1;
			let hasCyrillicComment = false;
			while (cursor >= 0 && source[cursor].trim().startsWith("//")) {
				if (/[А-Яа-яЁё]/.test(source[cursor])) {
					hasCyrillicComment = true;
				}
				cursor -= 1;
			}
			if (!hasCyrillicComment) {
				missing.push(`${declaration[1]} (строка ${index + 1})`);
			}
		});
		expect(missing).toEqual([]);
	});

	it("константы согласованы: шаг сетки, масштаб, шаг симуляции, восемь направлений единичной длины", () => {
		expect(GRID_STEP).toBe(0.5);
		expect(MODEL_SCALE).toBe(0.5);
		expect(SIM_STEP_SEC).toBeCloseTo(1 / 60);
		expect(FACING_COUNT).toBe(8);
		expect(FACING_VECTORS).toHaveLength(FACING_COUNT);
		FACING_VECTORS.forEach((vector) => expect(Math.hypot(vector.x, vector.z)).toBeCloseTo(1));
		expect(LEVEL_IDS).toEqual(["easy", "medium", "hard"]);
		expect(DISH_IDS).toEqual(["ham", "steak", "burger", "veggieBurger", "stew"]);
	});

	it("каталог предметов не содержит повторов и только известные виды и состояния", () => {
		const keys = ITEM_CATALOG.map((spec) => `${spec.kind}/${spec.state}`);
		expect(new Set(keys).size).toBe(keys.length);
		ITEM_CATALOG.forEach((spec) => {
			expect(knownKinds).toContain(spec.kind);
			expect(knownStates).toContain(spec.state);
		});
	});

	it("пустой ввод ничего не нажимает", () => {
		expect(EMPTY_INPUT).toEqual({
			moveVector: { x: 0, z: 0 },
			actionPressed: false,
			actionHeld: false,
			workPressed: false,
			workHeld: false,
		});
	});
});
