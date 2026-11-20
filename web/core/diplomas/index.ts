// Дипломы: рейтинг по доле очков и выдача именного диплома за завершенный уровень.
// Функции чистые: они не обращаются к LocalStorage, сохранение делает слой прогресса.
import type { LevelId, LevelResult } from "../contract/types";
import { scorePercent } from "../achievements/rules";

export type DiplomaRating = "bronze" | "silver" | "gold";

// Порог серебряного рейтинга в процентах очков (включительно).
export const silverThresholdPercent = 50;
// Порог золотого рейтинга в процентах очков (включительно).
export const goldThresholdPercent = 80;

// Рейтинг прохождения: меньше 50 процентов - bronze, 50-79 - silver, от 80 - gold.
export function ratingForPercent(percent: number): DiplomaRating {
	if (percent >= goldThresholdPercent) {
		return "gold";
	}
	if (percent >= silverThresholdPercent) {
		return "silver";
	}
	return "bronze";
}

// Диплом за один завершенный уровень. Имя фиксируется на момент выдачи.
export interface Diploma {
	id: string;
	gameId: string;
	levelId: LevelId;
	playerName: string;
	score: number;
	maxScore: number;
	rating: DiplomaRating;
	issuedAt: string;
}

// Выдает диплом только за завершенный уровень с непустым именем. Иначе возвращает null.
export function issueDiploma(result: LevelResult, playerName: string, issuedAt: string): Diploma | null {
	const trimmedName = playerName.trim();
	if (!result.completed || trimmedName === "") {
		return null;
	}
	return {
		id: `${result.gameId}:${result.levelId}:${issuedAt}`,
		gameId: result.gameId,
		levelId: result.levelId,
		playerName: trimmedName,
		score: result.score,
		maxScore: result.maxScore,
		rating: ratingForPercent(scorePercent(result)),
		issuedAt,
	};
}

export * from "./certificate";
