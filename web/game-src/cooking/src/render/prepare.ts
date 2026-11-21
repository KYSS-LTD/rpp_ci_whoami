// Подготовка ресурсов (задача 6.1): проверка WebGL, загрузка моделей, сообщение порталу об ошибке при сбое.
// Готовность (PortalBridge.onStart) отсюда НЕ сообщается: её вызывает main после успешной загрузки (design D13).
import type { Object3D } from "three";
import { debugLog } from "../config/debug";
import type { PrepareAssetsDeps } from "../contracts";
import { systemTexts } from "../texts";
import { createLoadedAssets, loadGltfModels, type LoadedAssets } from "./assets";

// Проверяет наличие WebGL на временном canvas.
export function detectWebGL(): boolean {
	try {
		const canvas = document.createElement("canvas");
		return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
	} catch {
		return false;
	}
}

// Приводит результат подменяемого загрузчика к карте "имя -> модель". Допустимы Map и обычный объект; остальное даёт пустую карту.
function normalizeLoadedModels(loaded: unknown): Map<string, Object3D> {
	if (loaded instanceof Map) {
		return new Map(loaded as Map<string, Object3D>);
	}
	if (loaded !== null && typeof loaded === "object") {
		return new Map(Object.entries(loaded as Record<string, Object3D>));
	}
	return new Map();
}

// Проверяет WebGL и грузит все модели. При отсутствии WebGL или сбое загрузки вызывает bridge.reportError и возвращает null.
// Пока модели грузятся, промис не завершён и порталу ничего не сообщается.
export async function prepareAssets(deps: PrepareAssetsDeps): Promise<LoadedAssets | null> {
	const isWebGLAvailable = deps.isWebGLAvailable ?? detectWebGL;
	let hasWebGL = false;
	try {
		hasWebGL = isWebGLAvailable();
	} catch (error) {
		debugLog("prepare", "проверка WebGL завершилась ошибкой", error);
	}
	if (!hasWebGL) {
		deps.bridge.reportError(systemTexts.webglUnavailable);
		return null;
	}

	try {
		const loaded = await (deps.loadModels ?? (() => loadGltfModels()))();
		return createLoadedAssets(normalizeLoadedModels(loaded));
	} catch (error) {
		debugLog("prepare", "модели не загрузились", error);
		deps.bridge.reportError(systemTexts.assetsFailed);
		return null;
	}
}
