// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

// Эталонная реализация mulberry32 из открытого описания алгоритма: независимая проверка последовательности.
function referenceMulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function takeNumbers(seed: number, count: number): number[] {
	const rng = createRng(seed);
	return Array.from({ length: count }, () => rng.next());
}

describe("генератор случайных чисел", () => {
	it("один seed даёт одну и ту же последовательность", () => {
		expect(takeNumbers(12345, 50)).toEqual(takeNumbers(12345, 50));
	});

	it("разные seed дают разные последовательности", () => {
		expect(takeNumbers(1, 10)).not.toEqual(takeNumbers(2, 10));
	});

	it("последовательность совпадает с эталонным mulberry32", () => {
		const reference = referenceMulberry32(987654);
		const expected = Array.from({ length: 20 }, () => reference());
		expect(takeNumbers(987654, 20)).toEqual(expected);
	});

	it("next возвращает числа в полуинтервале [0, 1)", () => {
		const values = takeNumbers(7, 2000);
		expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...values)).toBeLessThan(1);
	});

	it("nextInt включает обе границы и не выходит за них", () => {
		const rng = createRng(3);
		const seen = new Set<number>();
		for (let index = 0; index < 500; index += 1) {
			const value = rng.nextInt(2, 5);
			expect(Number.isInteger(value)).toBe(true);
			seen.add(value);
		}
		expect([...seen].sort()).toEqual([2, 3, 4, 5]);
		expect(rng.nextInt(4, 4)).toBe(4);
		expect(() => rng.nextInt(5, 2)).toThrow(RangeError);
	});

	it("nextRange укладывается в [min, max)", () => {
		const rng = createRng(11);
		for (let index = 0; index < 200; index += 1) {
			const value = rng.nextRange(-1.5, 2.5);
			expect(value).toBeGreaterThanOrEqual(-1.5);
			expect(value).toBeLessThan(2.5);
		}
	});

	it("pick выбирает элементы массива и не принимает пустой массив", () => {
		const rng = createRng(5);
		const items = ["a", "b", "c"] as const;
		const seen = new Set<string>();
		for (let index = 0; index < 100; index += 1) {
			seen.add(rng.pick(items));
		}
		expect([...seen].sort()).toEqual(["a", "b", "c"]);
		expect(() => rng.pick([])).toThrow(RangeError);
	});

	it("weightedIndex соблюдает веса: нулевой вес не выпадает, частоты близки к долям", () => {
		const rng = createRng(21);
		const counts = [0, 0, 0];
		const draws = 6000;
		for (let index = 0; index < draws; index += 1) {
			counts[rng.weightedIndex([1, 0, 3])] += 1;
		}
		expect(counts[1]).toBe(0);
		expect(counts[0] / draws).toBeGreaterThan(0.2);
		expect(counts[0] / draws).toBeLessThan(0.3);
		expect(counts[2] / draws).toBeGreaterThan(0.7);
	});

	it("weightedIndex отвергает пустые и отрицательные веса", () => {
		const rng = createRng(1);
		expect(() => rng.weightedIndex([])).toThrow(RangeError);
		expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
		expect(() => rng.weightedIndex([1, -1])).toThrow(RangeError);
	});

	it("нецелый и отрицательный seed не ломают генератор", () => {
		const fractional = takeNumbers(1.7, 5);
		const negative = takeNumbers(-5, 5);
		[...fractional, ...negative].forEach((value) => {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		});
	});
});
