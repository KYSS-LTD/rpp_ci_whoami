// Экспорт игры "Закрытие квартала" для реестра: один компонент уровня на все три уровня (design.md, D1).
import type { GameModuleInput } from "@/core/contract/types";
import { accountantManifest } from "./manifest";
import { AccountantLevel } from "./levels/AccountantLevel";

export const accountantGameModule: GameModuleInput = {
	manifest: accountantManifest,
	levelComponents: {
		easy: AccountantLevel,
		medium: AccountantLevel,
		hard: AccountantLevel,
	},
};
