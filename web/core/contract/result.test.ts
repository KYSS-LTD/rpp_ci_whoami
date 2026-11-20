import { describe, expect, it } from "vitest";
import { validateLevelResult } from "./result";

// Валидный результат, от которого отталкиваются тесты.
const validResult = { gameId: "demo", levelId: "easy", score: 2, maxScore: 3, completed: true, durationSec: 40 };

// Возвращает причины отказа одной строкой, чтобы проверять их по подстроке.
function reasonsOf(input: unknown): string {
	const validation = validateLevelResult(input);
	return validation.ok ? "" : validation.reasons.join(" ");
}

describe("проверка результата уровня", () => {
	it("принимает валидный результат", () => {
		expect(validateLevelResult(validResult)).toEqual({ ok: true, result: validResult });
	});

	it("принимает нулевые очки и незавершённый уровень", () => {
		expect(validateLevelResult({ ...validResult, score: 0, completed: false }).ok).toBe(true);
	});

	it("отклоняет очки больше максимума", () => {
		expect(reasonsOf({ ...validResult, score: 15, maxScore: 3 })).toContain("score больше maxScore");
	});

	it("отклоняет отрицательные очки", () => {
		expect(reasonsOf({ ...validResult, score: -1 })).toContain("score");
	});

	it("отклоняет нулевой и отрицательный максимум", () => {
		expect(reasonsOf({ ...validResult, score: 0, maxScore: 0 })).toContain("maxScore");
		expect(reasonsOf({ ...validResult, maxScore: -5 })).toContain("maxScore");
	});

	it("отклоняет NaN, бесконечность и строки вместо чисел", () => {
		expect(reasonsOf({ ...validResult, score: Number.NaN })).toContain("score");
		expect(reasonsOf({ ...validResult, maxScore: Number.POSITIVE_INFINITY })).toContain("maxScore");
		expect(reasonsOf({ ...validResult, durationSec: "40" })).toContain("durationSec");
	});

	it("отклоняет отрицательное время", () => {
		expect(reasonsOf({ ...validResult, durationSec: -1 })).toContain("durationSec");
	});

	it("отклоняет результат без completed и без идентификаторов", () => {
		const reasons = reasonsOf({ score: 1, maxScore: 2, durationSec: 1 });
		expect(reasons).toContain("completed");
		expect(reasons).toContain("gameId");
		expect(reasons).toContain("levelId");
	});

	it("отклоняет значение, которое не является объектом", () => {
		expect(validateLevelResult(null).ok).toBe(false);
		expect(validateLevelResult("результат").ok).toBe(false);
	});
});
