// Сценарий уровня (design.md, D2) и сборка результата для портала (D9).
import type { LevelId, LevelResult } from "@/core/contract/types";
import { levelMaxScore } from "../data/levels";

// Фазы уровня в порядке прохождения.
export const levelPhases = ["intro", "gameA", "summaryA", "gameB", "monthClose"] as const;

export type LevelPhase = (typeof levelPhases)[number];

// Следующая фаза. Последняя фаза остаётся последней.
export function getNextPhase(phase: LevelPhase): LevelPhase {
	const index = levelPhases.indexOf(phase);
	return levelPhases[Math.min(index + 1, levelPhases.length - 1)];
}

export interface LevelResultInput {
	gameId: string;
	levelId: LevelId;
	score: number;
	completed: boolean;
	startedAtMs: number;
	finishedAtMs: number;
}

// Результат уровня по контракту game-module-contract. Время считается от монтирования уровня.
export function buildLevelResult(input: LevelResultInput): LevelResult {
	return {
		gameId: input.gameId,
		levelId: input.levelId,
		score: Math.min(levelMaxScore, Math.max(0, input.score)),
		maxScore: levelMaxScore,
		completed: input.completed,
		durationSec: Math.max(0, Math.round((input.finishedAtMs - input.startedAtMs) / 1000)),
	};
}

// Отправка результата не чаще одного раза за запуск: повторный вызов ничего не делает и возвращает false.
export function createResultSender(onFinish: (result: LevelResult) => void) {
	let isSent = false;
	return {
		send(result: LevelResult): boolean {
			if (isSent) {
				return false;
			}
			isSent = true;
			onFinish(result);
			return true;
		},
		isSent(): boolean {
			return isSent;
		},
	};
}
