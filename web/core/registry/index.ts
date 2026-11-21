import { uavGameModule } from "../../games/uav-operator";
import type { GameModuleInput } from "../contract/types";
import { cookingGameModule } from "../../games/cooking";
import { accountantGameModule } from "../../games/accountant-1c";
import { buildRegistry } from "./registry";

// Список подключённых игр. Добавление игры: импорт модуля игры и одна строка в этом массиве.
export const gameImports: GameModuleInput[] = [uavGameModule, accountantGameModule, cookingGameModule];

// Готовый реестр, который используют страницы сайта.
export const gameRegistry = buildRegistry(gameImports);

export * from "./registry";
