// Прогресс игры cooking: какие блюда игрок уже готовил своими руками (design D23, D24). Блок данных хранит портал, игра читает
// его из сообщения старта и отправляет обновление через мост. Здесь только чистые функции без DOM и моста. Владелец: Opus-агент.
import { DISH_IDS, GAME_PROGRESS_VERSION, LEVEL_IDS, MAX_GAME_PROGRESS_BYTES, type DishId, type GameProgress, type LevelId, type WeekScore } from "./contracts";

function createEmptyWeekScores(): GameProgress["weekScores"] {
	return { easy: { score: 0, maxScore: 0 }, medium: { score: 0, maxScore: 0 }, hard: { score: 0, maxScore: 0 } };
}

// Пустой прогресс: игрок ничего не готовил.
export function createEmptyProgress(): GameProgress {
	return { version: GAME_PROGRESS_VERSION, cookedDishes: [], completedDays: { easy: 0, medium: 0, hard: 0 }, weekScores: createEmptyWeekScores() };
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
	// Очки недели: старый блок без поля читается как нулевые очки. Неверные числа отбрасываются.
	const weekScores = createEmptyWeekScores();
	if (record.weekScores !== null && typeof record.weekScores === "object" && !Array.isArray(record.weekScores)) {
		for (const levelId of LEVEL_IDS) {
			const value = (record.weekScores as Record<string, unknown>)[levelId] as Partial<WeekScore> | null | undefined;
			if (value && Number.isFinite(value.score) && Number.isFinite(value.maxScore) && value.score! >= 0 && value.score! <= value.maxScore!) {
				weekScores[levelId] = { score: value.score!, maxScore: value.maxScore! };
			}
		}
	}
	return { version: GAME_PROGRESS_VERSION, cookedDishes, completedDays, weekScores };
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

// Отмечает день завершённым и прибавляет его очки к очкам недели. Первый день недели начинает сумму заново.
export function markCampaignDayCompleted(progress: GameProgress, levelId: LevelId, dayScore: WeekScore): GameProgress | null {
	const completed = progress.completedDays[levelId];
	if (completed >= 5) return null;
	const previous = completed === 0 ? { score: 0, maxScore: 0 } : progress.weekScores[levelId];
	return {
		...progress,
		completedDays: { ...progress.completedDays, [levelId]: completed + 1 },
		weekScores: { ...progress.weekScores, [levelId]: { score: previous.score + dayScore.score, maxScore: previous.maxScore + dayScore.maxScore } },
	};
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
