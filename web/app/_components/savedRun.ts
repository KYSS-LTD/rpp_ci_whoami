import { requiredLevelIds } from "@/core/contract/types";
import { readGameProgress, saveGameProgress } from "@/core/progress";
import { clear_Checkpoints, hasCheckpoint } from "@/core/progress/checkpoints";
import { parseGameProgress } from "@/games/cooking/src/progress";

function read_Campaign(gameId: string, route: string) {
	const levelId = requiredLevelIds.find((id) => id === route);
	if (gameId !== "cooking" || !levelId) return null;
	return { levelId, progress: parseGameProgress(readGameProgress(gameId)) };
}

export function has_SavedRun(gameId: string, route: string): boolean {
	if (hasCheckpoint(gameId, route)) return true;
	const campaign = read_Campaign(gameId, route);
	if (!campaign) return false;
	const completedDays = campaign.progress.completedDays[campaign.levelId];
	return completedDays > 0 && completedDays < 5;
}

export function reset_SavedRun(gameId: string, route: string): boolean {
	const campaign = read_Campaign(gameId, route);
	if (campaign && campaign.progress.completedDays[campaign.levelId] > 0) {
		const { levelId, progress } = campaign;
		progress.completedDays[levelId] = 0;
		progress.weekScores[levelId] = { score: 0, maxScore: 0 };
		if (!saveGameProgress(gameId, { ...progress })) return false;
	}
	return clear_Checkpoints(gameId, route);
}
