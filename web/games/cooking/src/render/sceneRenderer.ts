// Сцена three.js (задачи 6.2-6.7): собирает статику, станции, персонажей, посуду, подсветку и отладочный оверлей,
// рисует по снимку и подстраивает камеру под размер фрейма. WebGL-часть вынесена в RenderBackend, поэтому всё остальное
// проверяется тестами без видеокарты (createSceneRendererCore с подменой).
import {
	AmbientLight,
	Color,
	DirectionalLight,
	Fog,
	HemisphereLight,
	MathUtils,
	PCFShadowMap,
	PerspectiveCamera,
	Scene,
	WebGLRenderer,
	type Camera,
	type Mesh,
	type Object3D,
} from "three";
import { debugLog } from "../config/debug";
import type { DebugInfo, GameSnapshot, LevelConfig, SceneRenderer, SceneRendererOptions, SimEvent } from "../contracts";
import { rectCenter } from "../common/math";
import { createActorLayer } from "./actors";
import type { LoadedAssets } from "./assets";
import { createDecorMaterials } from "./batch";
import { CAMERA_FOV_DEG, CAMERA_PITCH_DEG, createSceneCamera, resizeSceneCamera } from "./camera";
import { createCharacterFactory } from "./characters";
import { createDebugOverlay, type DebugLabelFactory, type DebugOverlay } from "./debugOverlay";
import { createEffectsLayer } from "./effects";
import { createEnvironment } from "./environment";
import { createTargetHighlight } from "./highlight";
import { createInterior } from "./interior";
import { createItemVisualFactory } from "./items";
import { buildStaticLayout, type PlacedRegistry } from "./layout";
import { ambientColors, skyColors, sunColors } from "./palette";
import { createStationViews } from "./stations";
import { createTablewareLayer } from "./tableware";
import { createSceneTextures } from "./textures";

// Ограничение плотности пикселей: на телефонах с экранами 3x тяжело и незаметно.
const maxPixelRatio = 2;

// Размер карты теней солнца (пикселей по стороне). Карта рисуется один раз, поэтому большой размер дёшев.
const shadowMapSize = 2048;

// Что нужно сцене от устройства вывода: холст, размер и отрисовка. Реализация на WebGL создаётся createWebGLBackend.
export interface RenderBackend {
	readonly domElement: HTMLElement;
	// Можно ли рисовать текстуры с canvas (доски пола, плитка, картины). У подмены в тестах нет: сцена берёт простые цвета.
	readonly supportsCanvasTextures?: boolean;
	setSize(widthPx: number, heightPx: number): void;
	render(scene: Scene, camera: Camera): void;
	dispose(): void;
}

// Устройство вывода на WebGLRenderer. Тени статичны: карта теней рисуется на первом кадре и больше не обновляется
// (стены, мебель и декор не двигаются, а персонажи и предметы в карту теней не попадают, у них свои пятна-тени).
export function createWebGLBackend(): RenderBackend {
	const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = true;
	return {
		domElement: renderer.domElement,
		supportsCanvasTextures: true,
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

// Освещение: общий свет, небо-земля и солнце с тенями. Солнце светит слева спереди, тени ложатся вправо и назад, не закрывая
// станции и столы. Камера теней покрывает ресторан с улицей и ближайшие деревья.
interface SceneLights {
	ambient: AmbientLight;
	hemisphere: HemisphereLight;
	sun: DirectionalLight;
}

function addLights(scene: Scene, level: LevelConfig): SceneLights {
	const ambient = new AmbientLight(0xffffff, 0.5);
	const hemisphere = new HemisphereLight(skyColors.hemisphereMorning, 0x8c7a66, 0.95);
	const sun = new DirectionalLight(sunColors.morning, 2.6);
	const center = rectCenter(level.bounds);
	sun.position.set(center.x - 7, 16, center.z + 10);
	sun.target.position.set(center.x, 0, center.z + 1);
	sun.castShadow = true;
	sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
	const extent = Math.max(level.bounds.width, level.bounds.depth) / 2 + 8;
	sun.shadow.camera.left = -extent;
	sun.shadow.camera.right = extent;
	sun.shadow.camera.top = extent;
	sun.shadow.camera.bottom = -extent;
	sun.shadow.camera.near = 1;
	sun.shadow.camera.far = 70;
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.025;
	sun.shadow.radius = 2.5;
	scene.add(ambient, hemisphere, sun, sun.target);
	return { ambient, hemisphere, sun };
}

// Включает тени у статичных мешей станций (основания, плиты, духовки). Прозрачные и неосвещаемые (огонь, индикаторы) не трогаются.
function enableStaticShadows(root: Object3D): void {
	root.traverse((node) => {
		const mesh = node as Mesh;
		if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.type === "MeshStandardMaterial" && !mesh.material.transparent) {
			mesh.castShadow = true;
			mesh.receiveShadow = true;
		}
	});
}

// Туман прячет край травяного поля: начинается за рестораном и густеет к краю кадра. Зависит от расстояния камеры,
// которое меняется с пропорциями экрана (на узком портретном экране камера дальше).
function updateFog(fog: Fog, camera: PerspectiveCamera): void {
	const distance = camera.position.y / Math.sin(MathUtils.degToRad(CAMERA_PITCH_DEG));
	fog.near = distance + 16;
	fog.far = distance + 70;
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
	const skyColor = new Color(skyColors.morning);
	scene.background = skyColor;
	const fog = new Fog(skyColor.getHex(), 40, 120);
	scene.fog = fog;
	const lights = addLights(scene, level);
	const morningSky = new Color(skyColors.morning);
	const eveningSky = new Color(skyColors.evening);
	const morningSun = new Color(sunColors.morning);
	const eveningSun = new Color(sunColors.evening);
	const morningHemisphere = new Color(skyColors.hemisphereMorning);
	const eveningHemisphere = new Color(skyColors.hemisphereEvening);
	const morningAmbient = new Color(ambientColors.morning);
	const eveningAmbient = new Color(ambientColors.evening);

	const initialSize = measureContainer(container);
	const camera = createSceneCamera(level.view, initialSize.width / initialSize.height);
	updateFog(fog, camera);

	// Текстуры с canvas только при настоящем выводе: в тестах материалы берут простые цвета.
	const textures = createSceneTextures(backend.supportsCanvasTextures === true);
	const decorMaterials = createDecorMaterials();
	const environment = createEnvironment(level, decorMaterials, textures);
	const interior = createInterior(level, assets, decorMaterials, textures);
	const items = createItemVisualFactory(assets);
	const characters = createCharacterFactory();
	const staticLayout = buildStaticLayout(level, assets, { textures, streetMaterial: environment.pavingMaterial });
	const stations = createStationViews(level, assets, items, staticLayout.registry);
	enableStaticShadows(stations.root);
	const actors = createActorLayer(characters, items, { heart: textures.emoteHeart, angry: textures.emoteAngry });
	const tableware = createTablewareLayer(level, items);
	const highlight = createTargetHighlight(level.stations, stations.surfaceHeights);
	const debugOverlay = createDebugOverlay(level, debug, createDebugLabel);
	const effects = createEffectsLayer(level, stations.surfaceHeights);

	scene.add(environment.root, staticLayout.root, interior.root, stations.root, stations.indicatorRoot, tableware.root, actors.root, effects.root, highlight.root);
	if (debugOverlay) {
		scene.add(debugOverlay.root);
	}

	container.appendChild(backend.domElement);
	let widthPx = initialSize.width;
	let heightPx = initialSize.height;
	backend.setSize(widthPx, heightPx);
	// Плотность пикселей буфера та же, что у WebGLRenderer: от неё зависит размер частиц на экране.
	const pixelRatio = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, maxPixelRatio) : 1;
	effects.setViewport(heightPx, pixelRatio, CAMERA_FOV_DEG);

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
		updateFog(fog, camera);
		effects.setViewport(heightPx, pixelRatio, CAMERA_FOV_DEG);
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
			// День идёт от утра к вечеру вместе со сменой: небо и туман теплеют, солнце желтеет и слабеет, фонари загораются.
			const dayProgress = Math.min(1, Math.max(0, snapshot.elapsedSec / Math.max(1, snapshot.durationSec)));
			skyColor.lerpColors(morningSky, eveningSky, dayProgress);
			fog.color.copy(skyColor);
			lights.sun.color.lerpColors(morningSun, eveningSun, dayProgress);
			lights.sun.intensity = 2.6 - 0.85 * dayProgress;
			lights.hemisphere.color.lerpColors(morningHemisphere, eveningHemisphere, dayProgress);
			lights.ambient.color.lerpColors(morningAmbient, eveningAmbient, dayProgress);
			environment.update(frameDtSec, dayProgress);
			stations.update(snapshot.stations, timeSec);
			tableware.update(snapshot);
			actors.update(snapshot, frameDtSec);
			effects.update(snapshot, frameDtSec);
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
			effects.handleEvents(events);
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
			effects.dispose();
			tableware.dispose();
			highlight.dispose();
			stations.dispose();
			staticLayout.dispose();
			interior.dispose();
			environment.dispose();
			decorMaterials.dispose();
			textures.dispose();
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
