// Правила выдачи ачивок. Функции чистые: они не обращаются к LocalStorage.
import type { LevelResult, PracticeAttempt } from "../contract/types";
import type { AchievementCondition, AchievementDefinition } from "./config";

// Сохраненная выдача ачивки с датой.
export interface AwardedAchievement {
	id: string;
	awardedAt: string;
}

// Процент очков уровня. При maxScore 0 результат считается нулевым.
export function scorePercent(result: LevelResult): number {
	if (result.maxScore <= 0) {
		return 0;
	}
	return (result.score / result.maxScore) * 100;
}

// Проверяет, что результат удовлетворяет условию ачивки. Незавершенный уровень условия не выполняет.
export function matchesCondition(result: LevelResult, condition: AchievementCondition): boolean {
	if (!result.completed || condition.practiceActivity !== undefined) {
		return false;
	}
	if (condition.gameId !== undefined && condition.gameId !== result.gameId) {
		return false;
	}
	if (condition.levelId !== undefined && condition.levelId !== result.levelId) {
		return false;
	}
	if (condition.minScorePercent !== undefined && scorePercent(result) < condition.minScorePercent) {
		return false;
	}
	return true;
}

// Возвращает идентификаторы ачивок, которые выполняет результат уровня.
export function evaluateAchievements(result: LevelResult, definitions: AchievementDefinition[], history = [result]): string[] {
	const completedGames = new Set(history.filter((attempt) => attempt.completed).map((attempt) => attempt.gameId)).size;
	return definitions.filter(({ condition }) => matchesCondition(result, condition)
		&& completedGames >= (condition.minCompletedGames ?? 0)).map(({ id }) => id);
}

export function evaluatePracticeAchievements(result: PracticeAttempt, definitions: AchievementDefinition[], history: PracticeAttempt[]): string[] {
	if (!result.completed) return [];
	const finishes = history.filter((attempt) => attempt.completed && attempt.gameId === result.gameId && attempt.activity === result.activity).length;
	return definitions.filter(({ condition }) => condition.practiceActivity === result.activity
		&& (condition.gameId === undefined || condition.gameId === result.gameId)
		&& result.score >= (condition.minScorePercent ?? 0)
		&& finishes >= (condition.minPracticeFinishes ?? 1)).map(({ id }) => id);
}

// Добавляет только новые ачивки. Уже выданные не меняются, поэтому повтор не создает дубликатов.
export function grantAchievements(
	awarded: AwardedAchievement[],
	earnedIds: string[],
	awardedAt: string,
): { updated: AwardedAchievement[]; newlyAwarded: AwardedAchievement[] } {
	const alreadyAwarded = new Set(awarded.map((item) => item.id));
	const newlyAwarded = earnedIds
		.filter((id, index) => !alreadyAwarded.has(id) && earnedIds.indexOf(id) === index)
		.map((id) => ({ id, awardedAt }));
	return { updated: [...awarded, ...newlyAwarded], newlyAwarded };
}
