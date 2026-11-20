// Манифест демо-игры по контракту game-module-contract.
import type { GameManifest } from "@/core/contract/types";
import { demoTexts } from "./texts";

export const demoManifest: GameManifest = {
	gameId: "demo",
	title: demoTexts.title,
	description: demoTexts.description,
	contractVersion: 1,
	levels: [
		{ id: "easy", title: demoTexts.levelTitles.easy },
		{ id: "medium", title: demoTexts.levelTitles.medium },
		{ id: "hard", title: demoTexts.levelTitles.hard },
	],
	professionTags: [
		{ professionId: "analyst", weight: 0.8 },
		{ professionId: "designer", weight: 0.4 },
	],
	format: "quiz",
	summary: demoTexts.summary,
	preview: { frames: ["/game-previews/demo/frame-1.svg", "/game-previews/demo/frame-2.svg"] },
	estimatedMinutes: 2,
};
