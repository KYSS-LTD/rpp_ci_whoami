// Проверка манифеста игры по контракту game-module-contract.

import { requiredLevelIds, supportedContractVersion, type GameManifest, type ManifestValidation } from "./types";

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

// Проверяет список уровней: ровно три уровня с идентификаторами easy, medium, hard, без повторов.
function collectLevelReasons(levels: unknown): string[] {
	if (!Array.isArray(levels)) {
		return ["поле levels должно быть списком"];
	}
	if (levels.length !== requiredLevelIds.length) {
		return [`уровней должно быть ${requiredLevelIds.length}, передано ${levels.length}`];
	}
	const levelIds = levels.map((level) => (level as { id?: unknown } | null)?.id);
	const reasons: string[] = [];
	for (const requiredId of requiredLevelIds) {
		if (!levelIds.includes(requiredId)) {
			reasons.push(`нет уровня ${requiredId}`);
		}
	}
	const unknownIds = levelIds.filter((levelId) => !requiredLevelIds.includes(levelId as (typeof requiredLevelIds)[number]));
	if (unknownIds.length > 0) {
		reasons.push(`неизвестные уровни: ${unknownIds.map(String).join(", ")}`);
	}
	return reasons;
}

// Проверяет теги профессий: вес числом от 0 до 1 включительно.
function collectProfessionReasons(professionTags: unknown): string[] {
	if (!Array.isArray(professionTags)) {
		return ["поле professionTags должно быть списком"];
	}
	const reasons: string[] = [];
	for (const tag of professionTags as Array<{ professionId?: unknown; weight?: unknown }>) {
		if (!isNonEmptyString(tag?.professionId)) {
			reasons.push("у профессии не указан professionId");
		}
		if (typeof tag?.weight !== "number" || Number.isNaN(tag.weight) || tag.weight < 0 || tag.weight > 1) {
			reasons.push(`вес профессии вне диапазона 0-1: ${String(tag?.weight)}`);
		}
	}
	return reasons;
}

// Проверяет манифест целиком и возвращает либо манифест, либо причины отказа.
export function validateManifest(input: unknown, supportedVersion: number = supportedContractVersion): ManifestValidation {
	const manifest = input as Partial<GameManifest> | null;
	if (!manifest || typeof manifest !== "object") {
		return { ok: false, reasons: ["манифест не является объектом"] };
	}

	const reasons: string[] = [];
	if (!isNonEmptyString(manifest.gameId)) {
		reasons.push("отсутствует gameId");
	}
	if (!isNonEmptyString(manifest.title)) {
		reasons.push("отсутствует название игры");
	}
	if (manifest.contractVersion !== supportedVersion) {
		reasons.push(`несовместимая версия контракта: ${String(manifest.contractVersion)}, поддерживается ${supportedVersion}`);
	}
	reasons.push(...collectLevelReasons(manifest.levels));
	reasons.push(...collectProfessionReasons(manifest.professionTags));

	if (reasons.length > 0) {
		return { ok: false, reasons };
	}
	return { ok: true, manifest: manifest as GameManifest };
}
