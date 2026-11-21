// Прогресс игры cooking: какие блюда игрок уже готовил своими руками (design D23, D24). Блок данных хранит портал, игра читает
// его из сообщения старта и отправляет обновление через мост. Здесь только чистые функции без DOM и моста. Владелец: Opus-агент.
import { DISH_IDS, GAME_PROGRESS_VERSION, LEVEL_IDS, MAX_GAME_PROGRESS_BYTES, type DishId, type GameProgress, type LevelId } from "./contracts";

// Пустой прогресс: игрок ничего не готовил.
export function createEmptyProgress(): GameProgress {
	return { version: GAME_PROGRESS_VERSION, cookedDishes: [], completedDays: { easy: 0, medium: 0, hard: 0 } };
}

// Разбирает блок данных из сообщения старта. Неизвестная версия, битая форма или не объект дают пустой прогресс;
// неизвестные блюда и повторы отбрасываются.
export function parseGameProgress(raw: unknown): GameProgress {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		return createEmptyProgress();
	}
	const record = raw as Record<string, unknown>;
	if ((record.version !== 1 && record.version !== GAME_PROGRESS_VERSION) || !Array.isArray(record.cookedDishes)) {
		return createEmptyProgress();
	}
	const cookedDishes: DishId[] = [];
	for (const entry of record.cookedDishes) {
		if ((DISH_IDS as readonly unknown[]).includes(entry) && !cookedDishes.includes(entry as DishId)) {
			cookedDishes.push(entry as DishId);
		}
	}
	const completedDays = { easy: 0, medium: 0, hard: 0 };
	if (record.completedDays !== null && typeof record.completedDays === "object" && !Array.isArray(record.completedDays)) {
		for (const levelId of LEVEL_IDS) {
			const value = (record.completedDays as Record<string, unknown>)[levelId];
			if (typeof value === "number" && Number.isInteger(value)) completedDays[levelId] = Math.max(0, Math.min(5, value));
		}
	}
	return { version: GAME_PROGRESS_VERSION, cookedDishes, completedDays };
}

// Отмечает блюдо приготовленным. Возвращает новый прогресс или null, если блюдо уже было отмечено.
export function markDishCooked(progress: GameProgress, dish: DishId): GameProgress | null {
	if (progress.cookedDishes.includes(dish)) {
		return null;
	}
	return { ...progress, version: GAME_PROGRESS_VERSION, cookedDishes: [...progress.cookedDishes, dish] };
}

export function getCampaignDay(progress: GameProgress, levelId: LevelId): number {
	return Math.min(5, progress.completedDays[levelId] + 1);
}

export function markCampaignDayCompleted(progress: GameProgress, levelId: LevelId): GameProgress | null {
	const completed = progress.completedDays[levelId];
	if (completed >= 5) return null;
	return { ...progress, completedDays: { ...progress.completedDays, [levelId]: completed + 1 } };
}

export function getCampaignMenu(day: number): DishId[] {
	const unlockOrder: DishId[] = ["ham", "steak", "burger", "veggieBurger", "stew"];
	return unlockOrder.slice(0, Math.max(1, Math.min(5, Math.floor(day))));
}

// Блюда меню, которых нет в прогрессе: по ним HUD показывает подсказки. Порядок как в меню.
export function listDishesNeedingTutorial(menu: readonly DishId[], progress: GameProgress): DishId[] {
	return menu.filter((dish) => !progress.cookedDishes.includes(dish));
}

// Размер блока в байтах (длина JSON в UTF-8), как его считает портал.
export function measureProgressBytes(progress: GameProgress): number {
	return new TextEncoder().encode(JSON.stringify(progress)).length;
}

// Укладывается ли блок в лимит портала.
export function isProgressWithinLimit(progress: GameProgress): boolean {
	return measureProgressBytes(progress) <= MAX_GAME_PROGRESS_BYTES;
}
