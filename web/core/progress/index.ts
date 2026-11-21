// Прогресс пользователя: имя, результаты уровней, ачивки и подписка интерфейса на изменения.
import { achievementDefinitions, evaluateAchievements, grantAchievements, type AwardedAchievement } from "../achievements";
import { isValidRating } from "../analysis";
import { issueDiploma, type Diploma } from "../diplomas";
import { validateLevelResult } from "../contract/result";
import type { LevelResult } from "../contract/types";
import { debugLog } from "../debug";
import { platformStorage, storageKeys, type PlatformStorage, type StorageWriteResult } from "../storage";

// Подписчики, которым нужно перерисоваться при изменении прогресса.
const progressListeners = new Set<() => void>();
let progressVersion = 0;

// Подписывает интерфейс на изменения прогресса. Возвращает функцию отписки.
export function subscribeToProgress(listener: () => void): () => void {
	progressListeners.add(listener);
	return () => {
		progressListeners.delete(listener);
	};
}

// Текущая версия прогресса: меняется при каждом уведомлении.
export function getProgressVersion(): number {
	return progressVersion;
}

// Уведомляет подписчиков, что данные изменились.
export function notifyProgressChanged(): void {
	progressVersion += 1;
	progressListeners.forEach((listener) => listener());
}

// Возвращает имя пользователя или пустую строку, если имя еще не введено.
export function readPlayerName(storage: PlatformStorage = platformStorage): string {
	return storage.read(storageKeys.playerName, "");
}

// Возвращает все попытки прохождения уровней.
export function readLevelResults(storage: PlatformStorage = platformStorage): LevelResult[] {
	return storage.read<LevelResult[]>(storageKeys.levelResults, []);
}

// Возвращает выданные дипломы. Каждый диплом хранит имя на момент выдачи.
export function readDiplomas(storage: PlatformStorage = platformStorage): Diploma[] {
	return storage.read<Diploma[]>(storageKeys.diplomas, []);
}

// Возвращает оценки игр (gameId -> оценка от 1 до 5).
export function readGameRatings(storage: PlatformStorage = platformStorage): Record<string, number> {
	return storage.read<Record<string, number>>(storageKeys.gameRatings, {});
}

// Возвращает сохранённый блок данных указанной игры для сообщения старта iframe.
export function readGameProgress(gameId: string, storage: PlatformStorage = platformStorage): unknown {
	const progress = storage.read<Record<string, unknown>>(storageKeys.gameProgress, {});
	return Object.prototype.hasOwnProperty.call(progress, gameId) ? progress[gameId] : null;
}

// Сохраняет блок данных игры до 4096 байт JSON. Ограничение повторно проверяется мостом до записи.
export function saveGameProgress(gameId: string, data: Record<string, unknown>, storage: PlatformStorage = platformStorage): boolean {
	let serialized: string;
	try {
		serialized = JSON.stringify(data);
	} catch {
		return false;
	}
	if (new TextEncoder().encode(serialized).length > 4096) return false;
	const current = storage.read<Record<string, unknown>>(storageKeys.gameProgress, {});
	const result = storage.write(storageKeys.gameProgress, { ...current, [gameId]: data });
	if (!result.ok) return false;
	notifyProgressChanged();
	return true;
}

// Причины отказа при сохранении оценки.
export type RatingSaveResult = { ok: true } | { ok: false; reason: "invalid" | "not-played" | "quota" | "failed" };

// Сохраняет оценку игры. Оценка принимается только после прохождения хотя бы одного уровня и в диапазоне 1-5.
export function saveGameRating(gameId: string, rating: number, storage: PlatformStorage = platformStorage): RatingSaveResult {
	if (!isValidRating(rating)) {
		return { ok: false, reason: "invalid" };
	}
	const hasCompletedLevel = readLevelResults(storage).some((result) => result.gameId === gameId && result.completed);
	if (!hasCompletedLevel) {
		return { ok: false, reason: "not-played" };
	}
	const writeResult = storage.write(storageKeys.gameRatings, { ...readGameRatings(storage), [gameId]: rating });
	if (!writeResult.ok) {
		return { ok: false, reason: writeResult.reason };
	}
	notifyProgressChanged();
	return { ok: true };
}

// Возвращает выданные ачивки с датами.
export function readAwardedAchievements(storage: PlatformStorage = platformStorage): AwardedAchievement[] {
	return storage.read<AwardedAchievement[]>(storageKeys.achievements, []);
}

// Итог сохранения попытки: принят ли результат, статус записи и ачивки, выданные именно за эту попытку.
// Если результат не прошёл проверку, accepted = false, в хранилище ничего не пишется, а writeResult остаётся { ok: true }.
export interface RecordOutcome {
	accepted: boolean;
	invalidReasons: string[];
	writeResult: StorageWriteResult;
	newlyAwarded: AwardedAchievement[];
	newDiploma: Diploma | null;
}

// Сохраняет попытку уровня и выдает ачивки. Попытки с completed=false хранятся, но не дают наград.
// Результат сначала проверяется: неверный не сохраняется и не даёт наград.
export function recordLevelResult(
	result: LevelResult,
	storage: PlatformStorage = platformStorage,
	awardedAt: string = new Date().toISOString(),
	issueStoredDiploma = true,
): RecordOutcome {
	const validation = validateLevelResult(result);
	if (!validation.ok) {
		debugLog("progress", "результат уровня отклонён", validation.reasons, result);
		return { accepted: false, invalidReasons: validation.reasons, writeResult: { ok: true }, newlyAwarded: [], newDiploma: null };
	}

	const attempts = readLevelResults(storage);
	const writeResult = storage.write(storageKeys.levelResults, [...attempts, result]);
	if (!writeResult.ok) {
		return { accepted: true, invalidReasons: [], writeResult, newlyAwarded: [], newDiploma: null };
	}

	const earnedIds = evaluateAchievements(result, achievementDefinitions);
	const { updated, newlyAwarded } = grantAchievements(readAwardedAchievements(storage), earnedIds, awardedAt);
	if (newlyAwarded.length > 0) {
		storage.write(storageKeys.achievements, updated);
	}
	const diploma = issueStoredDiploma ? issueDiploma(result, readPlayerName(storage), awardedAt) : null;
	if (diploma) {
		storage.write(storageKeys.diplomas, [...readDiplomas(storage), diploma]);
	}
	notifyProgressChanged();
	return { accepted: true, invalidReasons: [], writeResult, newlyAwarded, newDiploma: diploma };
}

// Сбрасывает результаты всех игр и профессий, имя сохраняется.
export function resetProgress(storage: PlatformStorage = platformStorage): void {
	storage.clearProgress();
	notifyProgressChanged();
}
