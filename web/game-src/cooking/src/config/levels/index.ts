// Вход к данным уровней: получить уровень по идентификатору и выбрать проверенный seed расписания. Владелец: Opus-агент.
import { LEVEL_IDS, type LevelConfig, type LevelId } from "../../contracts";
import { createEasyLevel } from "./easy";
import { createHardLevel } from "./hard";
import { createMediumLevel } from "./medium";

// Фабрики уровней: каждый вызов возвращает новый объект, поэтому правка одного прогона не портит другой.
const levelFactories: Record<LevelId, () => LevelConfig> = {
	easy: createEasyLevel,
	medium: createMediumLevel,
	hard: createHardLevel,
};

// Проверка, что строка является идентификатором уровня.
export function isLevelId(value: string): value is LevelId {
	return (LEVEL_IDS as readonly string[]).includes(value);
}

// Возвращает новый объект уровня по идентификатору.
export function getLevelConfig(levelId: LevelId): LevelConfig {
	return levelFactories[levelId]();
}

// Выбирает один из проверенных seed уровня. random: источник чисел в [0, 1) (по умолчанию Math.random), подменяется в тестах.
// Расписание непроверенного seed в игре не используется (спецификация cooking-levels, "Проверенные seed расписания").
export function pickVerifiedSeed(level: LevelConfig, random: () => number = Math.random): number {
	const seeds = level.verifiedSeeds;
	if (seeds.length === 0) {
		throw new Error(`у уровня ${level.id} нет проверенных seed`);
	}
	return seeds[Math.min(seeds.length - 1, Math.floor(random() * seeds.length))];
}
