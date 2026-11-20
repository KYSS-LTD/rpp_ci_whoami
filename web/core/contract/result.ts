// Проверка результата уровня перед сохранением (game-module-contract, "Result validated before saving").
// Результат приходит из кода игры, которому платформа не доверяет: он может быть ошибочным или подделанным.

import type { LevelResult } from "./types";

// Итог проверки: либо результат, либо причины отказа для журнала отладки.
export type ResultValidation = { ok: true; result: LevelResult } | { ok: false; reasons: string[] };

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

// Проверяет числа и типы результата. gameId и levelId сверяет с запущенным уровнем вызывающий код.
export function validateLevelResult(input: unknown): ResultValidation {
	const result = input as Partial<LevelResult> | null;
	if (!result || typeof result !== "object") {
		return { ok: false, reasons: ["результат не является объектом"] };
	}

	const reasons: string[] = [];
	if (typeof result.gameId !== "string" || result.gameId.length === 0) {
		reasons.push("не указан gameId");
	}
	if (typeof result.levelId !== "string" || result.levelId.length === 0) {
		reasons.push("не указан levelId");
	}
	if (typeof result.completed !== "boolean") {
		reasons.push("поле completed должно быть true или false");
	}
	if (!isFiniteNumber(result.maxScore) || result.maxScore <= 0) {
		reasons.push(`maxScore должен быть конечным числом больше 0: ${String(result.maxScore)}`);
	}
	if (!isFiniteNumber(result.score) || result.score < 0) {
		reasons.push(`score должен быть конечным числом не меньше 0: ${String(result.score)}`);
	} else if (isFiniteNumber(result.maxScore) && result.score > result.maxScore) {
		reasons.push(`score больше maxScore: ${result.score} > ${result.maxScore}`);
	}
	if (!isFiniteNumber(result.durationSec) || result.durationSec < 0) {
		reasons.push(`durationSec должен быть конечным числом не меньше 0: ${String(result.durationSec)}`);
	}

	if (reasons.length > 0) {
		return { ok: false, reasons };
	}
	return { ok: true, result: result as LevelResult };
}
