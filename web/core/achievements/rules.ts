// Правила выдачи ачивок. Функции чистые: они не обращаются к LocalStorage.
import type { LevelResult } from "../contract/types";
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
	if (!result.completed) {
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
export function evaluateAchievements(result: LevelResult, definitions: AchievementDefinition[]): string[] {
	return definitions.filter((definition) => matchesCondition(result, definition.condition)).map((definition) => definition.id);
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
