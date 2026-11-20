// Манифест игры-заглушки "Пиксельная лаборатория" по контракту game-module-contract.
// Игра ещё не готова: уровни показывают превью сцены и не отправляют результат.
import type { GameManifest } from "@/core/contract/types";
import { pixelLabTexts } from "./texts";

export const pixelLabManifest: GameManifest = {
	gameId: "pixel-lab",
	title: pixelLabTexts.title,
	description: pixelLabTexts.description,
	contractVersion: 1,
	levels: [
		{ id: "easy", title: pixelLabTexts.levelTitles.easy },
		{ id: "medium", title: pixelLabTexts.levelTitles.medium },
		{ id: "hard", title: pixelLabTexts.levelTitles.hard },
	],
	professionTags: [
		{ professionId: "programmer", weight: 0.8 },
		{ professionId: "analyst", weight: 0.4 },
	],
	format: "2d",
	summary: pixelLabTexts.summary,
	preview: { frames: ["/game-previews/pixel-lab/frame-1.svg", "/game-previews/pixel-lab/frame-2.svg"] },
	estimatedMinutes: 7,
	inDevelopment: true,
};
