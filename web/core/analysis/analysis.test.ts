import { describe, expect, it } from "vitest";
import type { GameManifest, LevelResult } from "../contract/types";
import { bestCompletedAttempts, computeProfessionScores, isValidRating, ratingFactor } from "./index";

const levels = [
	{ id: "easy" as const, title: "Лёгкий" },
	{ id: "medium" as const, title: "Средний" },
	{ id: "hard" as const, title: "Сложный" },
];

const gameA: GameManifest = {
	gameId: "a",
	title: "A",
	description: "",
	contractVersion: 1,
	levels,
	professionTags: [
		{ professionId: "analyst", weight: 1 },
		{ professionId: "designer", weight: 0.5 },
	],
};

const gameB: GameManifest = {
	gameId: "b",
	title: "B",
	description: "",
	contractVersion: 1,
	levels,
	professionTags: [{ professionId: "analyst", weight: 0.5 }],
};

function attempt(gameId: string, levelId: "easy" | "medium" | "hard", score: number, completed = true): LevelResult {
	return { gameId, levelId, score, maxScore: 10, completed, durationSec: 30 };
}

describe("оценка игры", () => {
	it("принимает целые значения от 1 до 5 и отклоняет остальные", () => {
		expect([1, 3, 5].every(isValidRating)).toBe(true);
		expect([0, 6, 2.5].some(isValidRating)).toBe(false);
	});

	it("нормирует оценку по формуле (r - 1) / 4 и использует 0.5 без оценки", () => {
		expect(ratingFactor(1)).toBe(0);
		expect(ratingFactor(5)).toBe(1);
		expect(ratingFactor(undefined)).toBe(0.5);
	});
});

describe("расчет баллов профессий", () => {
	it("без завершенных уровней анализ не рассчитывается", () => {
		expect(computeProfessionScores([gameA], [attempt("a", "easy", 10, false)], {})).toBeNull();
	});

	it("эталонный расчет по формуле D6 на одном уровне", () => {
		// Доля 0.6, оценка 5 (фактор 1). Аналитик: 1*0.6*1 / 1 = 0.6.
		const scores = computeProfessionScores([gameA], [attempt("a", "easy", 6)], { a: 5 });
		expect(scores).toEqual([
			{ professionId: "analyst", score: 0.6 },
			{ professionId: "designer", score: 0.6 },
		]);
	});

	it("профессия без нужного веса не попадает в результат", () => {
		const scores = computeProfessionScores([gameB], [attempt("b", "easy", 10)], {});
		expect(scores?.map((item) => item.professionId)).toEqual(["analyst"]);
	});

	it("две попытки одного уровня дают один вклад, берется лучшая", () => {
		const results = [attempt("a", "easy", 2), attempt("a", "easy", 8)];
		expect(bestCompletedAttempts(results)).toHaveLength(1);
		const scores = computeProfessionScores([gameA], results, { a: 3 });
		// Фактор оценки 3 = 0.5, доля лучшей попытки 0.8: 0.8 * 0.5 = 0.4.
		expect(scores?.find((item) => item.professionId === "analyst")?.score).toBeCloseTo(0.4);
	});

	it("профессии сортируются по убыванию балла", () => {
		const scores = computeProfessionScores([gameA, gameB], [attempt("a", "easy", 9), attempt("b", "medium", 2)], { a: 5, b: 1 });
		const values = scores?.map((item) => item.score) ?? [];
		expect(values).toEqual([...values].sort((first, second) => second - first));
	});
});
