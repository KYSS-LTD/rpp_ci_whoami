// Экспорт игры "Повар" для реестра. Игра из веб-сборки: компоненты уровней не нужны,
// уровень запускает портал во фрейме по полю runtime манифеста.
import type { GameModuleInput } from "@/core/contract/types";
import { cookingManifest } from "./manifest";

export const cookingGameModule: GameModuleInput = {
	manifest: cookingManifest,
};
