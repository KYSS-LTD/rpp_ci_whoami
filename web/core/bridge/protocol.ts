// Протокол моста между порталом и iframe-игрой (capability game-iframe-bridge, design D4).
// Только чистые функции: разбор сообщений игры и сборка сообщений портала. Подписка на события живёт в интерфейсе.
// Те же значения повторены в SDK (sdk/web/portal-bridge.js): при изменении протокола править оба места и docs/game-bridge-protocol.md.

import type { LevelId, PracticeAttempt } from "../contract/types";
import { isCheckpoint, isCheckpointSlot, type Checkpoint } from "../progress/checkpoints";

// Версия протокола. Сообщения с другой версией портал игнорирует.
export const bridgeProtocolVersion = 1;

// Метка сообщений от игры к порталу.
export const gameMessageSource = "portal-game";

// Метка сообщений от портала к игре.
export const portalMessageSource = "portal";

// Параметр адреса сборки, в котором портал передаёт уровень (entry?level=easy).
export const levelQueryParameter = "level";
export const maxGameProgressBytes = 4096;

export function isValidGameProgress(data: unknown): boolean {
	if (data === null || typeof data !== "object" || Array.isArray(data)) return false;
	try {
		const serialized = JSON.stringify(data);
		return typeof serialized === "string" && new TextEncoder().encode(serialized).length <= maxGameProgressBytes;
	} catch {
		return false;
	}
}

export type PracticeResult = Omit<PracticeAttempt, "gameId"> & { type: "practice-result" };

// Сообщения игры, которые портал понимает.
export type GameMessage =
	| { type: "ready" }
	| { type: "checkpoint"; slot: string; data: Checkpoint | null }
	| { type: "checkpoint-saved" }
	| { type: "progress"; data: Record<string, unknown> }
	| { type: "level-result"; score: number; maxScore: number; completed: boolean }
	| PracticeResult
	| { type: "exit" }
	| { type: "error"; message: string };

// Сообщение портала о старте уровня.
export interface StartMessage {
	source: typeof portalMessageSource;
	version: typeof bridgeProtocolVersion;
	type: "start";
	gameId: string;
	levelId: LevelId;
	progress: Record<string, unknown> | null;
	checkpoints?: Record<string, Checkpoint>;
}

// Итог разбора: сообщение или причина, по которой оно проигнорировано (для журнала отладки).
export type ParsedGameMessage = { ok: true; message: GameMessage } | { ok: false; reason: string };

// Разбирает данные события message. Проверяет метку, версию, тип и поля.
// Диапазоны очков здесь не проверяются: это делает общая проверка результата уровня (core/contract/result).
export function parseGameMessage(data: unknown): ParsedGameMessage {
	const raw = data as Record<string, unknown> | null;
	if (!raw || typeof raw !== "object") {
		return { ok: false, reason: "сообщение не является объектом" };
	}
	if (raw.source !== gameMessageSource) {
		return { ok: false, reason: `чужая метка сообщения: ${String(raw.source)}` };
	}
	if (raw.version !== bridgeProtocolVersion) {
		return { ok: false, reason: `неподдерживаемая версия протокола: ${String(raw.version)}` };
	}

	switch (raw.type) {
		case "ready":
			return { ok: true, message: { type: "ready" } };
		case "checkpoint-saved":
			return { ok: true, message: { type: "checkpoint-saved" } };
		case "checkpoint":
			if (!isCheckpointSlot(raw.slot) || (raw.data !== null && !isCheckpoint(raw.data))) {
				return { ok: false, reason: "неверное сохранение игры" };
			}
			return { ok: true, message: { type: "checkpoint", slot: raw.slot, data: raw.data } };
		case "progress":
			if (!isValidGameProgress(raw.data)) return { ok: false, reason: "неверный или слишком большой блок прогресса игры" };
			return { ok: true, message: { type: "progress", data: raw.data as Record<string, unknown> } };
		case "exit":
			return { ok: true, message: { type: "exit" } };
		case "error":
			return { ok: true, message: { type: "error", message: typeof raw.message === "string" ? raw.message : "" } };
		case "level-result":
			if (typeof raw.score !== "number" || typeof raw.maxScore !== "number" || typeof raw.completed !== "boolean") {
				return { ok: false, reason: "в level-result нужны числа score и maxScore и логическое completed" };
			}
			return {
				ok: true,
				message: { type: "level-result", score: raw.score, maxScore: raw.maxScore, completed: raw.completed },
			};
		case "practice-result": {
			const { activity, difficulty, score, completed, durationSec } = raw;
			const isolatedStage = activity === "assembly" || activity === "survey";
			const flight = activity === "beach" || activity === "field" || activity === "race";
			const knownDifficulty = difficulty === "easy" || difficulty === "medium" || difficulty === "hard";
			if ((!isolatedStage && !flight) || (isolatedStage ? !knownDifficulty : difficulty !== null)
				|| typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100
				|| typeof completed !== "boolean" || typeof durationSec !== "number" || !Number.isSafeInteger(durationSec) || durationSec < 0) {
				return { ok: false, reason: "неверный результат свободного упражнения" };
			}
			return { ok: true, message: { type: "practice-result", activity, difficulty: knownDifficulty ? difficulty : null, score, completed, durationSec } };
		}
		default:
			return { ok: false, reason: `неизвестный тип сообщения: ${String(raw.type)}` };
	}
}

// Собирает сообщение о старте уровня для игры.
export function buildStartMessage(gameId: string, levelId: LevelId, progress: unknown = null, checkpoints?: Record<string, Checkpoint>): StartMessage {
	return { source: portalMessageSource, version: bridgeProtocolVersion, type: "start", gameId, levelId,
		progress: isValidGameProgress(progress) ? progress as Record<string, unknown> : null, ...(checkpoints && { checkpoints }) };
}

// Адрес сборки с уровнем в параметре: "/game-builds/x/index.html" -> "/game-builds/x/index.html?level=easy".
export function buildLevelUrl(entry: string, levelId: LevelId): string {
	const separator = entry.includes("?") ? "&" : "?";
	return `${entry}${separator}${levelQueryParameter}=${encodeURIComponent(levelId)}`;
}
