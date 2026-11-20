import type { GameModuleInput } from "../contract/types";
import { demoGameModule } from "../../games/demo";
import { cityBuilderGameModule } from "../../games/city-builder";
import { pixelLabGameModule } from "../../games/pixel-lab";
import { accountantGameModule } from "../../games/accountant-1c";
import { buildRegistry } from "./registry";

// Список подключённых игр. Добавление игры: импорт модуля игры и одна строка в этом массиве.
export const gameImports: GameModuleInput[] = [demoGameModule, cityBuilderGameModule, pixelLabGameModule, accountantGameModule];

// Готовый реестр, который используют страницы сайта.
export const gameRegistry = buildRegistry(gameImports);

export * from "./registry";
