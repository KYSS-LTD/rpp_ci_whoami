// Манифест игры "Закрытие квартала" по контракту game-module-contract.
import type { GameManifest } from "@/core/contract/types";
import { accountantTexts } from "./texts";

export const accountantManifest: GameManifest = {
	gameId: "accountant-1c",
	title: accountantTexts.title,
	description: accountantTexts.description,
	contractVersion: 1,
	levels: [
		{ id: "easy", title: accountantTexts.levelTitles.easy },
		{ id: "medium", title: accountantTexts.levelTitles.medium },
		{ id: "hard", title: accountantTexts.levelTitles.hard },
	],
	professionTags: [
		{ professionId: "accountant", weight: 1.0 },
		{ professionId: "analyst", weight: 0.4 },
	],
	format: "simulation",
	summary: accountantTexts.summary,
	preview: { frames: ["/game-previews/accountant-1c/poster.webp"], animation: "/game-previews/accountant-1c/play.webp" },
	estimatedMinutes: 5,
};
