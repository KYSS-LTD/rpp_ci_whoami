import type { GameModuleInput } from "../contract/types";
import { demoGameModule } from "../../games/demo";
import { buildRegistry } from "./registry";

// Список подключённых игр. Добавление игры: импорт модуля игры и одна строка в этом массиве.
export const gameImports: GameModuleInput[] = [demoGameModule];

// Готовый реестр, который используют страницы сайта.
export const gameRegistry = buildRegistry(gameImports);

export * from "./registry";
