// Сцена three.js (задачи 6.2-6.7): собирает статику, станции, персонажей, посуду, подсветку и отладочный оверлей,
// рисует по снимку и подстраивает камеру под размер фрейма. WebGL-часть вынесена в RenderBackend, поэтому всё остальное
// проверяется тестами без видеокарты (createSceneRendererCore с подменой).
import { AmbientLight, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer, type Camera } from "three";
import { debugLog } from "../config/debug";
import type { DebugInfo, GameSnapshot, SceneRenderer, SceneRendererOptions, SimEvent } from "../contracts";
import { createActorLayer } from "./actors";
import type { LoadedAssets } from "./assets";
import { createSceneCamera, resizeSceneCamera } from "./camera";
import { createCharacterFactory } from "./characters";
import { createDebugOverlay, type DebugLabelFactory, type DebugOverlay } from "./debugOverlay";
import { createTargetHighlight } from "./highlight";
import { createItemVisualFactory } from "./items";
import { buildStaticLayout, type PlacedRegistry } from "./layout";
import { backgroundColor } from "./palette";
import { createStationViews } from "./stations";
import { createTablewareLayer } from "./tableware";

// Ограничение плотности пикселей: на телефонах с экранами 3x тяжело и незаметно.
const maxPixelRatio = 2;

// Что нужно сцене от устройства вывода: холст, размер и отрисовка. Реализация на WebGL создаётся createWebGLBackend.
export interface RenderBackend {
	readonly domElement: HTMLElement;
	setSize(widthPx: number, heightPx: number): void;
	render(scene: Scene, camera: Camera): void;
	dispose(): void;
}

// Устройство вывода на WebGLRenderer.
export function createWebGLBackend(): RenderBackend {
	const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
	return {
		domElement: renderer.domElement,
		setSize(widthPx, heightPx) {
			// false: размер стиля задаёт CSS (холст на весь фрейм), здесь меняется только буфер.
			renderer.setSize(widthPx, heightPx, false);
		},
		render(scene, camera) {
			renderer.render(scene, camera);
		},
		dispose() {
			renderer.dispose();
			renderer.forceContextLoss();
		},
	};
}

// Сцена с доступом к внутренностям для тестов и отладки.
export interface SceneRendererInternals extends SceneRenderer {
	readonly scene: Scene;
	readonly camera: PerspectiveCamera;
	// Реестр расставленных по конфигу объектов: идентификатор конфига -> корень объекта.
	readonly registry: PlacedRegistry;
	readonly debugOverlay: DebugOverlay | null;
	// Корни слоёв: персонажи и посуда (для проверок).
	getLayerCounts(): { customers: number; tableDishes: number; windowDishes: number };
}

// Освещение: мягкий общий свет и одно направленное солнце без теней (без тяжёлых теней ради слабых телефонов).
function addLights(scene: Scene): void {
	scene.add(new AmbientLight(0xffffff, 0.9));
	scene.add(new HemisphereLight(0xdfeaff, 0x8c7a66, 1.1));
	const sun = new DirectionalLight(0xfff3df, 1.9);
	sun.position.set(-6, 14, 9);
	scene.add(sun);
}

// Размер контейнера с запасным значением, если вёрстка ещё не посчитана.
function measureContainer(container: HTMLElement): { width: number; height: number } {
	const width = container.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 0) || 1;
	const height = container.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 0) || 1;
	return { width, height };
}

// Сцена на подменяемом устройстве вывода. Основная фабрика createSceneRenderer вызывает её с WebGL.
// createDebugLabel: подмена создателя подписей отладки (в тестах canvas недоступен).
export function createSceneRendererCore(
	options: SceneRendererOptions,
	assets: LoadedAssets,
	backend: RenderBackend,
	createDebugLabel?: DebugLabelFactory,
): SceneRendererInternals {
	const { level, container, debug } = options;
	const scene = new Scene();
	scene.background = new Color(backgroundColor);
	addLights(scene);

	const initialSize = measureContainer(container);
	const camera = createSceneCamera(level.view, initialSize.width / initialSize.height);

	const items = createItemVisualFactory(assets);
	const characters = createCharacterFactory();
	const staticLayout = buildStaticLayout(level, assets);
	const stations = createStationViews(level, assets, items, staticLayout.registry);
	const actors = createActorLayer(characters, items);
	const tableware = createTablewareLayer(level, items);
	const highlight = createTargetHighlight(level.stations, stations.surfaceHeights);
	const debugOverlay = createDebugOverlay(level, debug, createDebugLabel);

	scene.add(staticLayout.root, stations.root, stations.indicatorRoot, tableware.root, actors.root, highlight.root);
	if (debugOverlay) {
		scene.add(debugOverlay.root);
	}

	container.appendChild(backend.domElement);
	let widthPx = initialSize.width;
	let heightPx = initialSize.height;
	backend.setSize(widthPx, heightPx);

	let timeSec = 0;
	let disposed = false;

	function resize(nextWidth: number, nextHeight: number): void {
		if (disposed || nextWidth <= 0 || nextHeight <= 0) {
			return;
		}
		widthPx = nextWidth;
		heightPx = nextHeight;
		backend.setSize(widthPx, heightPx);
		resizeSceneCamera(camera, level.view, widthPx, heightPx);
	}

	// Контейнер меняет размер (поворот телефона, изменение окна): холст следует за ним без участия main.
	let resizeObserver: ResizeObserver | null = null;
	if (typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => {
			const size = measureContainer(container);
			if (size.width !== widthPx || size.height !== heightPx) {
				resize(size.width, size.height);
			}
		});
		resizeObserver.observe(container);
	}

	return {
		scene,
		camera,
		registry: staticLayout.registry,
		debugOverlay,
		render(snapshot: GameSnapshot, frameDtSec: number) {
			if (disposed) {
				return;
			}
			timeSec += frameDtSec;
			stations.update(snapshot.stations, timeSec);
			tableware.update(snapshot);
			actors.update(snapshot, frameDtSec);
			highlight.update(snapshot.chef.target, frameDtSec, timeSec);
			backend.render(scene, camera);
		},
		handleEvents(events: readonly SimEvent[]) {
			for (const event of events) {
				// Отказ действия кратко краснит подсветку цели: обратная связь без текста (текст показывает HUD).
				if (event.type === "actionRejected") {
					highlight.flashReject();
				}
			}
		},
		setDebugInfo(info: DebugInfo | null) {
			debugOverlay?.setInfo(info);
		},
		resize,
		getLayerCounts() {
			const counts = tableware.getCounts();
			return { customers: actors.getCustomerCount(), tableDishes: counts.table, windowDishes: counts.window };
		},
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			resizeObserver?.disconnect();
			debugLog("scene", "сцена освобождена");
			actors.dispose();
			tableware.dispose();
			highlight.dispose();
			stations.dispose();
			staticLayout.dispose();
			debugOverlay?.dispose();
			characters.dispose();
			scene.clear();
			backend.domElement.remove();
			backend.dispose();
		},
	};
}

// Основная фабрика сцены (контракт SceneRenderer): создаёт холст WebGL в контейнере.
export function createSceneRenderer(options: SceneRendererOptions, assets: LoadedAssets): SceneRenderer {
	return createSceneRendererCore(options, assets, createWebGLBackend());
}
