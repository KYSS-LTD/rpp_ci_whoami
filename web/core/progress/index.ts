// Прогресс пользователя: имя, результаты уровней, ачивки и подписка интерфейса на изменения.
import { achievementDefinitions, evaluateAchievements, evaluatePracticeAchievements, grantAchievements, type AwardedAchievement } from "../achievements";
import { isValidRating } from "../analysis";
import { issueDiploma, type Diploma } from "../diplomas";
import { validateLevelResult } from "../contract/result";
import type { LevelResult, PracticeAttempt } from "../contract/types";
import { debugLog } from "../debug";
import { platformStorage, storageKeyPrefix, storageKeys, type PlatformStorage, type StorageWriteResult } from "../storage";

// Подписчики, которым нужно перерисоваться при изменении прогресса.
const progressListeners = new Set<() => void>();
let progressVersion = 0;

// Подписывает интерфейс на изменения прогресса. Возвращает функцию отписки.
export function subscribeToProgress(listener: () => void): () => void {
	progressListeners.add(listener);
	if (progressListeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorageChanged);
	return () => {
		progressListeners.delete(listener);
		if (progressListeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorageChanged);
	};
}

function onStorageChanged(event: StorageEvent) {
	if (event.key === null || event.key.startsWith(storageKeyPrefix)) notifyProgressChanged();
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

export const maxPlayerNameLength = 120;

export function normalizePlayerName(name: string): string {
	return name.trim().replace(/\s+/g, " ").normalize("NFC").slice(0, maxPlayerNameLength).trimEnd();
}

// Возвращает имя пользователя или пустую строку, если имя еще не введено.
export function readPlayerName(storage: PlatformStorage = platformStorage): string {
	const name = storage.read<unknown>(storageKeys.playerName, "");
	return typeof name === "string" ? normalizePlayerName(name) : "";
}

export function savePlayerName(name: string, storage: PlatformStorage = platformStorage):
	{ ok: true; name: string } | { ok: false; reason: "empty" | "quota" | "failed" } {
	const normalized = normalizePlayerName(name);
	if (!normalized) return { ok: false, reason: "empty" };
	const result = storage.write(storageKeys.playerName, normalized);
	if (!result.ok) return result;
	notifyProgressChanged();
	return { ok: true, name: normalized };
}

// Возвращает все попытки прохождения уровней.
export function readLevelResults(storage: PlatformStorage = platformStorage): LevelResult[] {
	const results = storage.read<LevelResult[]>(storageKeys.levelResults, []);
	return Array.isArray(results) ? results : [];
}

export function readPracticeResults(storage: PlatformStorage = platformStorage): PracticeAttempt[] {
	const results = storage.read<PracticeAttempt[]>(storageKeys.practiceResults, []);
	return Array.isArray(results) ? results : [];
}

// Возвращает выданные дипломы. Каждый диплом хранит имя на момент выдачи.
export function readDiplomas(storage: PlatformStorage = platformStorage): Diploma[] {
	return storage.read<Diploma[]>(storageKeys.diplomas, []);
}

// Возвращает оценки игр (gameId -> оценка от 1 до 5).
export function readGameRatings(storage: PlatformStorage = platformStorage): Record<string, number> {
	const ratings = storage.read<Record<string, number>>(storageKeys.gameRatings, {});
	return ratings && typeof ratings === "object" && !Array.isArray(ratings) ? ratings : {};
}

// Причины отказа при сохранении оценки.
export type RatingSaveResult = { ok: true } | { ok: false; reason: "invalid" | "not-played" | "quota" | "failed" };

// Сохраняет оценку игры. Оценка принимается только после прохождения хотя бы одного уровня и в диапазоне 1-5.
export function saveGameRating(gameId: string, rating: number, storage: PlatformStorage = platformStorage): RatingSaveResult {
	if (!isValidRating(rating)) {
		return { ok: false, reason: "invalid" };
	}
	const hasPlayed = [...readLevelResults(storage), ...readPracticeResults(storage)].some((result) => result?.gameId === gameId && result.completed);
	if (!hasPlayed) {
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
	const awards = storage.read<AwardedAchievement[]>(storageKeys.achievements, []);
	return Array.isArray(awards) ? awards : [];
}

function storeAchievements(earnedIds: string[], awardedAt: string, storage: PlatformStorage) {
	const { updated, newlyAwarded } = grantAchievements(readAwardedAchievements(storage), earnedIds, awardedAt);
	const writeResult = newlyAwarded.length > 0 ? storage.write(storageKeys.achievements, updated) : { ok: true as const };
	return { writeResult, newlyAwarded: writeResult.ok ? newlyAwarded : [] };
}

export function recordPracticeResult(
	result: PracticeAttempt,
	storage: PlatformStorage = platformStorage,
	awardedAt: string = new Date().toISOString(),
): { writeResult: StorageWriteResult; newlyAwarded: AwardedAchievement[] } {
	if (!result.completed) return { writeResult: { ok: true }, newlyAwarded: [] };
	const history = [...readPracticeResults(storage), result];
	const writeResult = storage.write(storageKeys.practiceResults, history);
	if (!writeResult.ok) return { writeResult, newlyAwarded: [] };
	const awards = storeAchievements(evaluatePracticeAchievements(result, achievementDefinitions, history), awardedAt, storage);
	notifyProgressChanged();
	return awards;
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

	const attempts = [...readLevelResults(storage), result];
	const writeResult = storage.write(storageKeys.levelResults, attempts);
	if (!writeResult.ok) {
		return { accepted: true, invalidReasons: [], writeResult, newlyAwarded: [], newDiploma: null };
	}

	const awards = storeAchievements(evaluateAchievements(result, achievementDefinitions, attempts), awardedAt, storage);
	const diploma = issueStoredDiploma ? issueDiploma(result, readPlayerName(storage), awardedAt) : null;
	if (diploma) {
		storage.write(storageKeys.diplomas, [...readDiplomas(storage), diploma]);
	}
	notifyProgressChanged();
	return { accepted: true, invalidReasons: [], ...awards, newDiploma: diploma };
}

// Сбрасывает результаты всех игр и профессий, имя сохраняется.
export function resetProgress(storage: PlatformStorage = platformStorage): void {
	storage.clearProgress();
	notifyProgressChanged();
}
