// Тесты подготовки ресурсов (задача 6.1) с подменой моста: сценарии "Идёт загрузка", "Ошибка загрузки", "Нет WebGL".
import { Group } from "three";
import { describe, expect, it, vi, type Mock } from "vitest";
import type { PortalBridgeApi } from "../contracts";
import { systemTexts } from "../texts";
import { prepareAssets } from "./prepare";

// Мост с подсчётом вызовов: методы с побочными эффектами заменены шпионами с точными типами.
interface FakeBridge extends PortalBridgeApi {
	onStart: Mock<PortalBridgeApi["onStart"]>;
	finish: Mock<PortalBridgeApi["finish"]>;
	exit: Mock<PortalBridgeApi["exit"]>;
	reportError: Mock<PortalBridgeApi["reportError"]>;
}

// Подмена моста: считает вызовы.
function createFakeBridge(): FakeBridge {
	return {
		protocolVersion: 1,
		isEmbedded: false,
		getLevelId: () => "easy",
		onStart: vi.fn<PortalBridgeApi["onStart"]>(),
		finish: vi.fn<PortalBridgeApi["finish"]>(() => true),
		exit: vi.fn<PortalBridgeApi["exit"]>(),
		reportError: vi.fn<PortalBridgeApi["reportError"]>(),
		saveProgress: vi.fn<PortalBridgeApi["saveProgress"]>(() => true),
	};
}

describe("prepareAssets", () => {
	it("Идёт загрузка: пока модели грузятся, портал не получает ни ошибки, ни готовности", async () => {
		const bridge = createFakeBridge();
		let finishLoading: (models: Map<string, Group>) => void = () => undefined;
		const loadModels = vi.fn(() => new Promise<Map<string, Group>>((resolve) => (finishLoading = resolve)));
		const settled = vi.fn();

		const pending = prepareAssets({ bridge, loadModels, isWebGLAvailable: () => true });
		void pending.then(settled);
		await Promise.resolve();
		await Promise.resolve();

		expect(loadModels).toHaveBeenCalledTimes(1);
		expect(settled).not.toHaveBeenCalled();
		expect(bridge.reportError).not.toHaveBeenCalled();
		expect(bridge.onStart).not.toHaveBeenCalled();

		finishLoading(new Map([["wall", new Group()]]));
		const assets = await pending;
		expect(assets).not.toBeNull();
		expect(assets?.has("wall")).toBe(true);
		// Готовность сообщает main, а не prepareAssets.
		expect(bridge.onStart).not.toHaveBeenCalled();
		expect(bridge.reportError).not.toHaveBeenCalled();
	});

	it("Ошибка загрузки: одна модель не загрузилась, портал получает сообщение об ошибке", async () => {
		const bridge = createFakeBridge();
		const loadModels = vi.fn(() => Promise.reject(new Error("404")));

		const assets = await prepareAssets({ bridge, loadModels, isWebGLAvailable: () => true });

		expect(assets).toBeNull();
		expect(bridge.reportError).toHaveBeenCalledTimes(1);
		expect(bridge.reportError).toHaveBeenCalledWith(systemTexts.assetsFailed);
		expect(bridge.finish).not.toHaveBeenCalled();
		expect(bridge.onStart).not.toHaveBeenCalled();
	});

	it("Нет WebGL: портал получает ошибку, модели не грузятся, результат не передаётся", async () => {
		const bridge = createFakeBridge();
		const loadModels = vi.fn(() => Promise.resolve(new Map()));

		const assets = await prepareAssets({ bridge, loadModels, isWebGLAvailable: () => false });

		expect(assets).toBeNull();
		expect(loadModels).not.toHaveBeenCalled();
		expect(bridge.reportError).toHaveBeenCalledTimes(1);
		expect(bridge.reportError).toHaveBeenCalledWith(systemTexts.webglUnavailable);
		expect(bridge.finish).not.toHaveBeenCalled();
		expect(bridge.exit).not.toHaveBeenCalled();
	});

	it("проверка WebGL, бросившая исключение, считается отсутствием WebGL", async () => {
		const bridge = createFakeBridge();
		const assets = await prepareAssets({
			bridge,
			isWebGLAvailable: () => {
				throw new Error("контекст недоступен");
			},
		});
		expect(assets).toBeNull();
		expect(bridge.reportError).toHaveBeenCalledWith(systemTexts.webglUnavailable);
	});
});
