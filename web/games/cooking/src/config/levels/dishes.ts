// Награды и трудоёмкость блюд для настоящих уровней easy, medium, hard. Трудоёмкость (effort) измерена эталонным ботом:
// секунды его работы на блюдо без ожидания готовности, усреднено по проходам (задача 8.6, bot/verify.ts). Награды пропорциональны
// трудоёмкости. Значения по умолчанию в defaults.ts (для тестов областей) другие и здесь не используются. Владелец: Opus-агент.
import type { LevelParams } from "../../contracts";

// Параметры блюд для настоящих уровней.
export const calibratedDishes: LevelParams["dishes"] = {
	burger: { price: 10, maxTip: 5, effort: 11 },
	ham: { price: 8, maxTip: 4, effort: 8 },
	steak: { price: 9, maxTip: 4, effort: 8 },
	veggieBurger: { price: 14, maxTip: 7, effort: 17 },
	stew: { price: 20, maxTip: 10, effort: 19 },
};
