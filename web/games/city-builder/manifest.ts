// Манифест игры "Город будущего" по контракту game-module-contract.
// Игра подключена готовой веб-сборкой на three.js (public/game-builds/city-builder), см. capability game-iframe-bridge.
import type { GameManifest } from "@/core/contract/types";
import { cityBuilderTexts } from "./texts";

export const cityBuilderManifest: GameManifest = {
	gameId: "city-builder",
	title: cityBuilderTexts.title,
	description: cityBuilderTexts.description,
	contractVersion: 1,
	levels: [
		{ id: "easy", title: cityBuilderTexts.levelTitles.easy },
		{ id: "medium", title: cityBuilderTexts.levelTitles.medium },
		{ id: "hard", title: cityBuilderTexts.levelTitles.hard },
	],
	professionTags: [
		{ professionId: "engineer", weight: 0.8 },
		{ professionId: "designer", weight: 0.5 },
	],
	format: "3d",
	summary: cityBuilderTexts.summary,
	preview: { frames: ["/game-previews/city-builder/frame-1.svg", "/game-previews/city-builder/frame-2.svg"] },
	estimatedMinutes: 5,
	runtime: {
		kind: "iframe",
		entry: "/game-builds/city-builder/index.html",
	},
};
