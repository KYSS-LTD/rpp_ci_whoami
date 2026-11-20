// Экспорт игры-заглушки "Пиксельная лаборатория" для реестра.
import type { GameModuleInput } from "@/core/contract/types";
import { pixelLabManifest } from "./manifest";
import { PixelLabLevel } from "./levels/PixelLabLevel";

export const pixelLabGameModule: GameModuleInput = {
	manifest: pixelLabManifest,
	levelComponents: {
		easy: PixelLabLevel,
		medium: PixelLabLevel,
		hard: PixelLabLevel,
	},
};
