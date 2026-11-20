// Экспорт игры "Город будущего" для реестра. Игра из веб-сборки: компоненты уровней не нужны,
// уровень запускает портал во фрейме по полю runtime манифеста.
import type { GameModuleInput } from "@/core/contract/types";
import { cityBuilderManifest } from "./manifest";

export const cityBuilderGameModule: GameModuleInput = {
	manifest: cityBuilderManifest,
};
