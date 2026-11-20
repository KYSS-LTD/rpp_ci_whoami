// Экспорт демо-игры для реестра. Добавление новой игры: такой же файл index.ts и строка в core/registry.
import type { GameModuleInput } from "@/core/contract/types";
import { demoManifest } from "./manifest";
import { DemoLevel } from "./levels/DemoLevel";

export const demoGameModule: GameModuleInput = {
	manifest: demoManifest,
	levelComponents: {
		easy: DemoLevel,
		medium: DemoLevel,
		hard: DemoLevel,
	},
};
