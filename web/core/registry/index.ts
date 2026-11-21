import type { GameModuleInput } from "../contract/types";
import { demoGameModule } from "../../games/demo";
import { cityBuilderGameModule } from "../../games/city-builder";
import { cookingGameModule } from "../../games/cooking";
import { pixelLabGameModule } from "../../games/pixel-lab";
import { buildRegistry } from "./registry";

// Список подключённых игр. Добавление игры: импорт модуля игры и одна строка в этом массиве.
export const gameImports: GameModuleInput[] = [demoGameModule, cityBuilderGameModule, pixelLabGameModule, cookingGameModule];

// Готовый реестр, который используют страницы сайта.
export const gameRegistry = buildRegistry(gameImports);

export * from "./registry";
