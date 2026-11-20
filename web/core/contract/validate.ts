// Проверка манифеста игры по контракту game-module-contract.

import {
	gameBuildsPath,
	gameFormats,
	requiredLevelIds,
	supportedContractVersion,
	type GameManifest,
	type ManifestValidation,
} from "./types";

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

// Проверяет необязательные поля витрины. Отсутствующее поле не ошибка, неверный тип - ошибка.
function collectPresentationReasons(manifest: Partial<GameManifest>): string[] {
	const reasons: string[] = [];
	if (manifest.format !== undefined && !gameFormats.includes(manifest.format)) {
		reasons.push(`неизвестный формат игры: ${String(manifest.format)}, допустимы: ${gameFormats.join(", ")}`);
	}
	if (manifest.summary !== undefined && typeof manifest.summary !== "string") {
		reasons.push("поле summary должно быть строкой");
	}
	if (manifest.preview !== undefined) {
		const frames = (manifest.preview as { frames?: unknown } | null)?.frames;
		if (!Array.isArray(frames) || frames.length === 0 || !frames.every(isNonEmptyString)) {
			reasons.push("поле preview.frames должно быть непустым списком путей к кадрам");
		}
	}
	if (
		manifest.estimatedMinutes !== undefined &&
		(typeof manifest.estimatedMinutes !== "number" || !(manifest.estimatedMinutes > 0))
	) {
		reasons.push(`время уровня должно быть положительным числом: ${String(manifest.estimatedMinutes)}`);
	}
	if (manifest.inDevelopment !== undefined && typeof manifest.inDevelopment !== "boolean") {
		reasons.push("поле inDevelopment должно быть true или false");
	}
	return reasons;
}

// Проверяет объявление сборки: вид запуска iframe, путь внутри /game-builds/<gameId>/, положительный таймаут.
// Путь без "..", "//", "\\" и схемы, чтобы сборка не указывала на чужую папку или внешний адрес.
function collectRuntimeReasons(manifest: Partial<GameManifest>): string[] {
	if (manifest.runtime === undefined) {
		return [];
	}
	const runtime = manifest.runtime as { kind?: unknown; entry?: unknown; readyTimeoutSec?: unknown } | null;
	if (!runtime || typeof runtime !== "object") {
		return ["поле runtime должно быть объектом"];
	}
	const reasons: string[] = [];
	if (runtime.kind !== "iframe") {
		reasons.push(`неизвестный вид запуска: ${String(runtime.kind)}, допустим iframe`);
	}
	const expectedPrefix = `${gameBuildsPath}/${String(manifest.gameId)}/`;
	const entry = runtime.entry;
	if (!isNonEmptyString(entry)) {
		reasons.push("не указан путь к сборке runtime.entry");
	} else if (
		!entry.startsWith(expectedPrefix) ||
		entry.length === expectedPrefix.length ||
		entry.includes("..") ||
		entry.slice(1).includes("//") ||
		entry.includes("\\") ||
		entry.includes(":")
	) {
		reasons.push(`путь к сборке должен вести внутрь ${expectedPrefix}: ${entry}`);
	}
	if (
		runtime.readyTimeoutSec !== undefined &&
		(typeof runtime.readyTimeoutSec !== "number" || !Number.isFinite(runtime.readyTimeoutSec) || runtime.readyTimeoutSec <= 0)
	) {
		reasons.push(`время ожидания сборки должно быть положительным числом: ${String(runtime.readyTimeoutSec)}`);
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
	reasons.push(...collectPresentationReasons(manifest));
	reasons.push(...collectRuntimeReasons(manifest));

	if (reasons.length > 0) {
		return { ok: false, reasons };
	}
	return { ok: true, manifest: manifest as GameManifest };
}
