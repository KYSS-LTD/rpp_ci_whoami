// Манифест игры "Повар" по контракту game-module-contract.
// Игра подключена готовой веб-сборкой на three.js (public/game-builds/cooking, исходники game-src/cooking),
// см. capability game-iframe-bridge.
import type { GameManifest } from "@/core/contract/types";
import { cookingTexts } from "./texts";

export const cookingManifest: GameManifest = {
	gameId: "cooking",
	title: cookingTexts.title,
	description: cookingTexts.description,
	contractVersion: 1,
	levels: [
		{ id: "easy", title: cookingTexts.levelTitles.easy },
		{ id: "medium", title: cookingTexts.levelTitles.medium },
		{ id: "hard", title: cookingTexts.levelTitles.hard },
	],
	professionTags: [{ professionId: "cook", weight: 1 }],
	format: "3d",
	summary: cookingTexts.summary,
	// Кадры из игры 1280x800 (16:10): первый показывается в ленте, оба листаются в карточке игры.
	preview: { frames: ["/game-previews/cooking/frame-1.webp", "/game-previews/cooking/frame-2.webp"] },
	estimatedMinutes: 4,
	runtime: {
		kind: "iframe",
		entry: "/game-builds/cooking/index.html",
		// Около 50 моделей glTF и текстура: на медленном канале 30 секунд по умолчанию мало (design D13).
		readyTimeoutSec: 60,
	},
};
