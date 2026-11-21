// Загрузчик конфигурации ачивок. Список хранится в achievements.json, отдельно от кода игр.
import rawAchievements from "./achievements.json";
import type { LevelId, PracticeActivity } from "../contract/types";

// Условие выдачи. Незаданное поле означает "любое значение".
export interface AchievementCondition {
	gameId?: string;
	levelId?: LevelId;
	minScorePercent?: number;
	minCompletedGames?: number;
	practiceActivity?: PracticeActivity;
	minPracticeFinishes?: number;
}

export interface AchievementDefinition {
	id: string;
	title: string;
	description: string;
	icon?: string;
	condition: AchievementCondition;
}

// Ошибка конфигурации, например повторный id ачивки.
export class AchievementConfigError extends Error {}

// Проверяет список ачивок: у каждой должен быть уникальный id, название, описание и условие.
export function loadAchievements(rawList: unknown[]): AchievementDefinition[] {
	const seenIds = new Set<string>();
	return rawList.map((raw) => {
		const definition = raw as Partial<AchievementDefinition>;
		if (typeof definition.id !== "string" || definition.id.trim() === "") {
			throw new AchievementConfigError("у ачивки отсутствует id");
		}
		if (seenIds.has(definition.id)) {
			throw new AchievementConfigError(`повторный id ачивки: ${definition.id}`);
		}
		seenIds.add(definition.id);
		if (typeof definition.title !== "string" || typeof definition.description !== "string") {
			throw new AchievementConfigError(`у ачивки ${definition.id} нет названия или описания`);
		}
		return {
			id: definition.id,
			title: definition.title,
			description: definition.description,
			...(definition.icon ? { icon: definition.icon } : {}),
			condition: definition.condition ?? {},
		};
	});
}

// Список ачивок платформы из файла конфигурации.
export const achievementDefinitions: AchievementDefinition[] = loadAchievements(rawAchievements);
