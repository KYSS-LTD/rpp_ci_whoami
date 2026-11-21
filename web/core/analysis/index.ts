// Анализ профессий: балл по весам игр, долям очков и оценкам пользователя.
// Чистые функции: данные передаются аргументами, сети и LocalStorage здесь нет.
import type { GameManifest, LevelId, LevelResult, PracticeAttempt } from "../contract/types";
import { validateLevelResult } from "../contract/result";
import { scorePercent } from "../achievements/rules";

// Оценка игры пользователя: целое число от 1 до 5.
export const minRating = 1;
export const maxRating = 5;
// Нейтральное значение нормированной оценки, если пользователь игру не оценил.
export const neutralRatingFactor = 0.5;

// Результат расчета по одной профессии. score - доля от 0 до 1.
export interface ProfessionScore {
	professionId: string;
	score: number;
}

// Проверяет оценку игры: только целое число в диапазоне 1-5.
export function isValidRating(value: number): boolean {
	return Number.isInteger(value) && value >= minRating && value <= maxRating;
}

// Нормирует оценку к диапазону 0..1 по формуле (r - 1) / 4. Без оценки возвращает 0.5.
export function ratingFactor(rating: number | undefined): number {
	if (rating === undefined || !isValidRating(rating)) {
		return neutralRatingFactor;
	}
	return (rating - minRating) / (maxRating - minRating);
}

// Лучшая завершенная попытка каждого уровня. Незавершенные попытки не учитываются.
export function bestCompletedAttempts(results: LevelResult[]): LevelResult[] {
	const bestByLevel = new Map<string, LevelResult>();
	for (const result of results) {
		if (!result?.completed || !validateLevelResult(result).ok) {
			continue;
		}
		const key = `${result.gameId}:${result.levelId}`;
		const current = bestByLevel.get(key);
		if (!current || scorePercent(result) > scorePercent(current)) {
			bestByLevel.set(key, result);
		}
	}
	return Array.from(bestByLevel.values());
}

export function bestPracticeAttempts(results: PracticeAttempt[]): PracticeAttempt[] {
	const best = new Map<string, PracticeAttempt>();
	for (const result of results) {
		if (!result?.completed || !Number.isInteger(result.score) || result.score < 0 || result.score > 100) continue;
		const key = `${result.gameId}:${result.activity}:${result.difficulty ?? ""}`;
		const previous = best.get(key);
		if (!previous || result.score > previous.score || (result.score === previous.score && result.durationSec < previous.durationSec)) {
			best.set(key, result);
		}
	}
	return [...best.values()];
}

// Считает баллы профессий по формуле design.md (D6):
// score(p) = sum(w(g,p) * s(g,l) * q(g)) / sum(w(g,p)) по завершенным уровням.
// Возвращает null, если завершенных уровней нет и анализ не рассчитывается.
export function computeProfessionScores(
	games: GameManifest[],
	results: LevelResult[],
	ratings: Record<string, number>,
	practiceResults: PracticeAttempt[] = [],
): ProfessionScore[] | null {
	const attempts = [
		...bestCompletedAttempts(results).map((attempt) => ({ gameId: attempt.gameId, share: scorePercent(attempt) / 100 })),
		...bestPracticeAttempts(practiceResults).map((attempt) => ({ gameId: attempt.gameId, share: attempt.score / 100 })),
	];
	const numerators = new Map<string, number>();
	const denominators = new Map<string, number>();

	for (const attempt of attempts) {
		const game = games.find((registered) => registered.gameId === attempt.gameId);
		if (!game) {
			continue;
		}
		const factor = ratingFactor(ratings[game.gameId]);
		for (const tag of game.professionTags) {
			numerators.set(tag.professionId, (numerators.get(tag.professionId) ?? 0) + tag.weight * attempt.share * factor);
			denominators.set(tag.professionId, (denominators.get(tag.professionId) ?? 0) + tag.weight);
		}
	}

	const scores: ProfessionScore[] = [];
	for (const [professionId, denominator] of denominators) {
		if (denominator > 0) {
			scores.push({ professionId, score: (numerators.get(professionId) ?? 0) / denominator });
		}
	}
	return scores.length ? scores.sort((first, second) => second.score - first.score) : null;
}

// Уровни, которые пройдены хотя бы раз (для отображения на странице анализа).
export function completedLevelIds(results: LevelResult[]): Array<{ gameId: string; levelId: LevelId }> {
	return bestCompletedAttempts(results).map((result) => ({ gameId: result.gameId, levelId: result.levelId }));
}
