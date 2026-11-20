import { describe, expect, it } from "vitest";
import type { LevelResult } from "../contract/types";
import { AchievementConfigError, achievementDefinitions, loadAchievements, type AchievementDefinition } from "./config";
import { evaluateAchievements, grantAchievements, matchesCondition } from "./rules";

function createResult(overrides: Partial<LevelResult> = {}): LevelResult {
	return { gameId: "demo", levelId: "easy", score: 6, maxScore: 10, completed: true, durationSec: 40, ...overrides };
}

describe("конфигурация ачивок", () => {
	it("список загружается из файла конфигурации", () => {
		expect(achievementDefinitions.length).toBeGreaterThan(0);
	});

	it("дубликат id даёт ошибку", () => {
		const duplicate = [
			{ id: "a", title: "A", description: "A", condition: {} },
			{ id: "a", title: "B", description: "B", condition: {} },
		];
		expect(() => loadAchievements(duplicate)).toThrow(AchievementConfigError);
	});
});

describe("выдача ачивок по результату", () => {
	const definitions: AchievementDefinition[] = [
		{ id: "first", title: "Первый", description: "", condition: {} },
		{ id: "easy-50", title: "Easy", description: "", condition: { levelId: "easy", minScorePercent: 50 } },
	];

	it("завершенный уровень выдает ачивку, которая подходит по условию", () => {
		expect(evaluateAchievements(createResult(), definitions)).toEqual(["first", "easy-50"]);
	});

	it("незавершенный уровень не выдает ни одной ачивки", () => {
		expect(evaluateAchievements(createResult({ completed: false }), definitions)).toEqual([]);
	});

	it("граница процента учитывается", () => {
		expect(matchesCondition(createResult({ score: 5 }), { minScorePercent: 50 })).toBe(true);
		expect(matchesCondition(createResult({ score: 4.9 }), { minScorePercent: 50 })).toBe(false);
	});
});

describe("однократная выдача", () => {
	it("повторный результат не меняет список, дата первой выдачи сохраняется", () => {
		const first = grantAchievements([], ["first"], "2026-01-01T00:00:00.000Z");
		const second = grantAchievements(first.updated, ["first"], "2026-02-01T00:00:00.000Z");
		expect(second.updated).toEqual([{ id: "first", awardedAt: "2026-01-01T00:00:00.000Z" }]);
		expect(second.newlyAwarded).toEqual([]);
	});
});
