// Реестр игр: принимает список модулей игр, проверяет манифесты и отбрасывает невалидные.

import { validateManifest } from "../contract/validate";
import type { GameManifest, GameModuleInput } from "../contract/types";

// Игра, которая не попала в реестр, с причинами отказа.
export interface RejectedGame {
	index: number;
	reasons: string[];
}

// Игра, успешно прошедшая проверку.
export interface RegisteredGame<T extends GameModuleInput> {
	manifest: GameManifest;
	module: T;
}

export interface RegistryResult<T extends GameModuleInput> {
	games: RegisteredGame<T>[];
	rejected: RejectedGame[];
}

// Строит реестр. Невалидная игра или повторный gameId не попадает в список, причина пишется в журнал.
export function buildRegistry<T extends GameModuleInput>(imports: T[], supportedVersion?: number): RegistryResult<T> {
	const games: RegisteredGame<T>[] = [];
	const rejected: RejectedGame[] = [];
	const registeredIds = new Set<string>();

	imports.forEach((moduleInput, index) => {
		const validation = validateManifest(moduleInput.manifest, supportedVersion);
		if (!validation.ok) {
			rejected.push({ index, reasons: validation.reasons });
			console.error(`[registry] игра #${index} не зарегистрирована: ${validation.reasons.join("; ")}`);
			return;
		}
		if (registeredIds.has(validation.manifest.gameId)) {
			const reason = `повторный gameId: ${validation.manifest.gameId}`;
			rejected.push({ index, reasons: [reason] });
			console.error(`[registry] игра #${index} не зарегистрирована: ${reason}`);
			return;
		}
		registeredIds.add(validation.manifest.gameId);
		games.push({ manifest: validation.manifest, module: moduleInput });
	});

	return { games, rejected };
}
