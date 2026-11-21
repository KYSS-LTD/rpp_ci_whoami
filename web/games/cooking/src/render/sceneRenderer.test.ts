// Тесты сцены (задачи 6.2, 6.3, 6.6, 6.7) без видеокарты: устройство вывода подменено, модели заменены коробками
// с габаритами настоящих glTF (читаются из public/models), поэтому проверяются положения и размеры, а не вид.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BoxGeometry, Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Camera, type Object3D, type Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { getLevelConfig } from "../config/levels";
import { assetModelNames } from "../config/assets";
import { LEVEL_IDS, MODEL_SCALE, type DebugInfo, type LevelConfig, type NavGridView } from "../contracts";
import { createTestLevel } from "../sim/testing/testLevel";
import { createLoadedAssets, type LoadedAssets } from "./assets";
import { projectWorldPoint } from "./camera";
import { createDemoSnapshot } from "./demoSnapshot";
import { createSceneRendererCore, type RenderBackend } from "./sceneRenderer";

// Папка настоящих моделей: оттуда берутся габариты.
// Vitest запускается из папки web, поэтому путь строится от неё (URL файла в окружении jsdom недоступен).
const modelsDirectory = join(process.cwd(), "games", "cooking", "public", "models");

// Коробка с габаритами модели из её glTF (минимум и максимум позиций).
function createBoxModel(modelName: string): Object3D {
	const gltf = JSON.parse(readFileSync(join(modelsDirectory, `${modelName}.gltf`), "utf8")) as { accessors: Array<{ min?: number[]; max?: number[] }>; meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }> };
	const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
	const min = accessor.min ?? [-1, 0, -1];
	const max = accessor.max ?? [1, 1, 1];
	const geometry = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
	geometry.translate((max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2);
	const group = new Group();
	group.add(new Mesh(geometry, new MeshStandardMaterial()));
	return group;
}

// Хранилище с коробками вместо моделей: все имена из списка игры.
function createBoxAssets(): LoadedAssets {
	return createLoadedAssets(new Map(assetModelNames.map((name) => [name, createBoxModel(name)])));
}

// Устройство вывода без WebGL: запоминает размер и число отрисовок.
function createFakeBackend() {
	const backend = {
		domElement: document.createElement("canvas"),
		setSize: vi.fn<RenderBackend["setSize"]>(),
		render: vi.fn<(scene: Scene, camera: Camera) => void>(),
		dispose: vi.fn<RenderBackend["dispose"]>(),
	};
	return backend;
}

// Число объектов конфига, которые должны оказаться на сцене.
function countConfigObjects(level: LevelConfig): number {
	const visibleProps = level.props.filter((prop) => prop.model !== null).length;
	const seats = level.tables.reduce((sum, table) => sum + table.seats.length, 0);
	return level.floors.length + visibleProps + level.stations.length + level.tables.length + seats;
}

// Создаёт сцену на подмене.
function createScene(level: LevelConfig, debug = false, widthPx = 1280, heightPx = 720) {
	const container = document.createElement("div");
	Object.defineProperty(container, "clientWidth", { value: widthPx });
	Object.defineProperty(container, "clientHeight", { value: heightPx });
	const backend = createFakeBackend();
	const renderer = createSceneRendererCore({ container, level, debug }, createBoxAssets(), backend, () => null);
	return { renderer, backend, container };
}

// Центр объекта по XZ в мировых координатах.
function getWorldBounds(object: Object3D): Box3 {
	object.updateMatrixWorld(true);
	return new Box3().setFromObject(object);
}

describe("расстановка по данным уровня (6.2)", () => {
	it("на тестовом уровне число объектов на сцене совпадает с числом объектов конфига", () => {
		const level = createTestLevel();
		const { renderer } = createScene(level);
		expect(renderer.registry.size).toBe(countConfigObjects(level));
	});

	it.each(LEVEL_IDS)("на уровне %s каждая станция, стол, стул, стена и пол есть на сцене", (levelId) => {
		const level = getLevelConfig(levelId);
		const { renderer } = createScene(level);
		expect(renderer.registry.size).toBe(countConfigObjects(level));
		level.stations.forEach((station) => expect(renderer.registry.has(station.id)).toBe(true));
		level.tables.forEach((table) => {
			expect(renderer.registry.has(table.id)).toBe(true);
			table.seats.forEach((_, seatIndex) => expect(renderer.registry.has(`${table.id}-chair-${seatIndex}`)).toBe(true));
		});
		level.props.filter((prop) => prop.model !== null).forEach((prop) => expect(renderer.registry.has(prop.id)).toBe(true));
	});

	it("Совпадение логики и вида: модель станции нарисована в её прямоугольнике", () => {
		const level = createTestLevel();
		const { renderer } = createScene(level);
		for (const station of level.stations) {
			const bounds = getWorldBounds(renderer.registry.get(station.id) as Object3D);
			const center = bounds.getCenter(new Vector3());
			const rectCenterX = station.rect.x + station.rect.width / 2;
			const rectCenterZ = station.rect.z + station.rect.depth / 2;
			// Допуск на выступающие детали моделей (ручки сковород, ручки плит).
			expect(Math.abs(center.x - rectCenterX), station.id).toBeLessThan(0.3);
			expect(Math.abs(center.z - rectCenterZ), station.id).toBeLessThan(0.3);
		}
	});

	it("стены стоят в своих прямоугольниках, столы центрированы и не больше прямоугольника", () => {
		const level = createTestLevel();
		const { renderer } = createScene(level);
		for (const prop of level.props.filter((item) => item.model !== null)) {
			const bounds = getWorldBounds(renderer.registry.get(prop.id) as Object3D);
			const center = bounds.getCenter(new Vector3());
			expect(center.x, prop.id).toBeCloseTo(prop.rect.x + prop.rect.width / 2, 1);
			expect(center.z, prop.id).toBeCloseTo(prop.rect.z + prop.rect.depth / 2, 1);
		}
		for (const table of level.tables) {
			const bounds = getWorldBounds(renderer.registry.get(table.id) as Object3D);
			const size = bounds.getSize(new Vector3());
			const center = bounds.getCenter(new Vector3());
			// Круглая столешница вписана в прямоугольник стола (она не больше него).
			expect(size.x, table.id).toBeLessThanOrEqual(table.rect.width + 0.01);
			expect(size.z, table.id).toBeLessThanOrEqual(table.rect.depth + 0.01);
			expect(size.x, table.id).toBeGreaterThan(table.rect.width * 0.7);
			expect(center.x, table.id).toBeCloseTo(table.rect.x + table.rect.width / 2, 1);
			expect(center.z, table.id).toBeCloseTo(table.rect.z + table.rect.depth / 2, 1);
		}
	});

	it("повёрнутая на 90 градусов стена вытянута вдоль оси z", () => {
		const level = createTestLevel();
		const { renderer } = createScene(level);
		const size = getWorldBounds(renderer.registry.get("wall-west-0") as Object3D).getSize(new Vector3());
		expect(size.z).toBeGreaterThan(size.x * 3);
	});

	it("heightScale уменьшает высоту модели по Y", () => {
		const level = createTestLevel();
		level.props.push({ id: "low-wall", model: "wall", rect: { x: 0, z: 0, width: 2, depth: 0.5 }, rotationDeg: 0, blocking: true, heightScale: 0.35 });
		const { renderer } = createScene(level);
		const full = getWorldBounds(renderer.registry.get("wall-north-0") as Object3D).getSize(new Vector3()).y;
		const low = getWorldBounds(renderer.registry.get("low-wall") as Object3D).getSize(new Vector3()).y;
		expect(full).toBeCloseTo(4 * MODEL_SCALE, 2);
		expect(low).toBeCloseTo(full * 0.35, 2);
	});

	it("невидимое препятствие без модели на сцену не попадает", () => {
		const level = createTestLevel();
		level.props.push({ id: "invisible", model: null, rect: { x: 0, z: 0, width: 1, depth: 1 }, rotationDeg: 0, blocking: true });
		const { renderer } = createScene(level);
		expect(renderer.registry.has("invisible")).toBe(false);
	});

	it("кадр по демо-снимку рисуется без ошибок и создаёт персонажей и блюда", () => {
		const level = getLevelConfig("easy");
		const { renderer, backend } = createScene(level);
		renderer.render(createDemoSnapshot(level, 3), 1 / 60);
		renderer.render(createDemoSnapshot(level, 3.016), 1 / 60);
		expect(backend.render).toHaveBeenCalledTimes(2);
		const counts = renderer.getLayerCounts();
		expect(counts.customers).toBeGreaterThan(3);
		expect(counts.windowDishes).toBe(2);
		expect(counts.tableDishes).toBeGreaterThan(0);
	});

	it("после dispose холст убран, рисование прекращено", () => {
		const level = createTestLevel();
		const { renderer, backend, container } = createScene(level);
		expect(container.contains(backend.domElement)).toBe(true);
		renderer.dispose();
		expect(container.contains(backend.domElement)).toBe(false);
		expect(backend.dispose).toHaveBeenCalledTimes(1);
		renderer.render(createDemoSnapshot(level, 1), 1 / 60);
		expect(backend.render).not.toHaveBeenCalled();
	});
});

describe("камера (6.3)", () => {
	// Все слоты очереди с членами групп, столы и станции должны быть в кадре.
	function collectKeyPoints(level: LevelConfig) {
		const points: Array<{ name: string; x: number; z: number }> = [];
		for (const slot of level.queue.slots) {
			level.queue.memberOffsets.forEach((offset, memberIndex) => points.push({ name: `очередь ${slot.index}.${memberIndex}`, x: slot.position.x + offset.x, z: slot.position.z + offset.z }));
		}
		level.stations.forEach((station) => points.push({ name: station.id, x: station.rect.x + station.rect.width / 2, z: station.rect.z + station.rect.depth / 2 }));
		level.tables.forEach((table) => points.push({ name: table.id, x: table.rect.x + table.rect.width / 2, z: table.rect.z + table.rect.depth / 2 }));
		points.push({ name: "угол view", x: level.view.x, z: level.view.z }, { name: "угол view", x: level.view.x + level.view.width, z: level.view.z + level.view.depth });
		return points;
	}

	const sizes: Array<[number, number]> = [
		[1280, 720],
		[390, 844],
		[844, 390],
	];

	it.each(LEVEL_IDS)("на уровне %s при 1280x720, 390x844 и 844x390 все слоты очереди, станции и столы внутри кадра", (levelId) => {
		const level = getLevelConfig(levelId);
		const { renderer } = createScene(level);
		for (const [width, height] of sizes) {
			renderer.resize(width, height);
			for (const point of collectKeyPoints(level)) {
				const projected = projectWorldPoint(renderer.camera, point);
				expect(projected.visible, `${levelId} ${width}x${height} ${point.name}`).toBe(true);
			}
		}
	});

	it.each(LEVEL_IDS)("кадр уровня %s занимает экран плотно и симметрично, а не прижат к краю", (levelId) => {
		const level = getLevelConfig(levelId);
		const { renderer } = createScene(level);
		for (const [width, height] of sizes) {
			renderer.resize(width, height);
			const corners = [
				{ x: level.view.x, z: level.view.z },
				{ x: level.view.x + level.view.width, z: level.view.z },
				{ x: level.view.x, z: level.view.z + level.view.depth },
				{ x: level.view.x + level.view.width, z: level.view.z + level.view.depth },
			].map((corner) => projectWorldPoint(renderer.camera, corner));
			const minY = Math.min(...corners.map((corner) => corner.y));
			const maxY = Math.max(...corners.map((corner) => corner.y));
			const minX = Math.min(...corners.map((corner) => corner.x));
			const maxX = Math.max(...corners.map((corner) => corner.x));
			// Верх стен над линией z = 0 занимает часть кадра, поэтому по вертикали допуск шире.
			expect(Math.abs(minX + maxX), `${levelId} ${width}x${height} по x`).toBeLessThan(0.1);
			expect(Math.abs(minY + maxY), `${levelId} ${width}x${height} по y`).toBeLessThan(0.25);
			// Область занимает основную часть кадра по более тесной оси.
			expect(Math.max(maxX - minX, maxY - minY), `${levelId} ${width}x${height} размер`).toBeGreaterThan(1.6);
		}
	});

	it("камера не вращается по осям и наклонена примерно на 50 градусов", () => {
		const { renderer } = createScene(getLevelConfig("easy"));
		const direction = renderer.camera.getWorldDirection(new Vector3());
		expect(direction.x).toBeCloseTo(0, 5);
		expect(Math.asin(-direction.y) * (180 / Math.PI)).toBeCloseTo(50, 1);
		expect(direction.z).toBeLessThan(0);
	});

	it("Изменение размера фрейма: размер холста и пропорции камеры следуют за ним", () => {
		const { renderer, backend } = createScene(getLevelConfig("easy"));
		renderer.resize(390, 844);
		expect(backend.setSize).toHaveBeenLastCalledWith(390, 844);
		expect(renderer.camera.aspect).toBeCloseTo(390 / 844, 3);
		renderer.resize(1280, 720);
		expect(renderer.camera.aspect).toBeCloseTo(1280 / 720, 3);
	});

	it("нулевой размер игнорируется", () => {
		const { renderer, backend } = createScene(getLevelConfig("easy"));
		const calls = backend.setSize.mock.calls.length;
		renderer.resize(0, 0);
		expect(backend.setSize.mock.calls.length).toBe(calls);
	});
});

describe("персонажи (6.4, 6.6)", () => {
	it("Тарелка в руках: предмет виден перед поваром и двигается вместе с ним", () => {
		const level = getLevelConfig("easy");
		const { renderer } = createScene(level);
		const base = createDemoSnapshot(level, 3);
		const withPlate = (x: number, z: number) => ({
			...base,
			chef: { ...base.chef, position: { x, z }, hand: { type: "plate" as const, contents: [], dish: "burger" as const } },
		});
		const chefRoot = (): Object3D => renderer.scene.getObjectByName("character-chef") as Object3D;
		renderer.render(withPlate(3, 3), 1 / 60);
		const anchor = chefRoot().getObjectByName("hand-anchor") as Object3D;
		expect(anchor.children.length).toBe(1);
		const first = anchor.getWorldPosition(new Vector3());
		// Повар сместился на 2 единицы: сглаживание позиции пропускается при скачке, предмет оказывается там же вместе с ним.
		renderer.render(withPlate(5, 3), 1 / 60);
		const second = anchor.getWorldPosition(new Vector3());
		expect(second.x - first.x).toBeCloseTo(2, 1);
		expect(Math.hypot(second.x - 5, second.z - 3)).toBeLessThan(0.6);
		// Рука опустела: предмет убран.
		renderer.render({ ...withPlate(5, 3), chef: { ...base.chef, position: { x: 5, z: 3 }, hand: null } }, 1 / 60);
		expect(anchor.children.length).toBe(0);
	});

	it("Различимость: у повара, официанта и клиента разные формы или цвета", () => {
		const level = getLevelConfig("easy");
		const { renderer } = createScene(level);
		renderer.render(createDemoSnapshot(level, 3), 1 / 60);
		const colorsOf = (name: string): string => {
			const colors = new Set<number>();
			(renderer.scene.getObjectByName(name) as Object3D).traverse((node) => {
				const mesh = node as Mesh;
				if (mesh.isMesh && (mesh.material as MeshStandardMaterial).color) {
					colors.add((mesh.material as MeshStandardMaterial).color.getHex());
				}
			});
			return [...colors].sort().join(",");
		};
		const chef = colorsOf("character-chef");
		const waiter = colorsOf("character-waiter");
		const customer = colorsOf("character-customer");
		expect(new Set([chef, waiter, customer]).size).toBe(3);
	});

	it("поворот повара на 180 градусов идёт плавно, а не за один кадр", () => {
		const level = getLevelConfig("easy");
		const { renderer } = createScene(level);
		const base = createDemoSnapshot(level, 3);
		const facing = (yaw: number) => ({ ...base, chef: { ...base.chef, yaw } });
		const chefRoot = (): Object3D => renderer.scene.getObjectByName("character-chef") as Object3D;
		for (let frame = 0; frame < 30; frame += 1) {
			renderer.render(facing(0), 1 / 60);
		}
		expect(chefRoot().rotation.y).toBeCloseTo(0, 2);
		renderer.render(facing(Math.PI), 1 / 60);
		const afterOneFrame = Math.abs(chefRoot().rotation.y);
		expect(afterOneFrame).toBeGreaterThan(0.05);
		expect(afterOneFrame).toBeLessThan(Math.PI * 0.6);
		for (let frame = 0; frame < 90; frame += 1) {
			renderer.render(facing(Math.PI), 1 / 60);
		}
		expect(Math.abs(Math.abs(chefRoot().rotation.y) - Math.PI)).toBeLessThan(0.05);
	});
});

describe("подсветка цели (6.6)", () => {
	it("подсветка следует за целью повара и гаснет без цели", () => {
		const level = getLevelConfig("easy");
		const { renderer } = createScene(level);
		const highlight = renderer.scene.getObjectByName("target-highlight") as Object3D;
		const snapshot = createDemoSnapshot(level, 0.1);
		for (let frame = 0; frame < 120; frame += 1) {
			renderer.render(snapshot, 1 / 60);
		}
		expect(highlight.visible).toBe(true);
		const targetId = snapshot.chef.target?.stationId;
		const targetStation = level.stations.find((station) => station.id === targetId);
		expect(targetStation).toBeDefined();
		const ring = highlight.children[0];
		expect(ring.position.x).toBeCloseTo((targetStation?.rect.x ?? 0) + (targetStation?.rect.width ?? 0) / 2, 1);
		expect(ring.position.z).toBeCloseTo((targetStation?.rect.z ?? 0) + (targetStation?.rect.depth ?? 0) / 2, 1);

		const withoutTarget = { ...snapshot, chef: { ...snapshot.chef, target: null } };
		for (let frame = 0; frame < 240; frame += 1) {
			renderer.render(withoutTarget, 1 / 60);
		}
		expect(highlight.visible).toBe(false);
	});
});

// Простая сетка 4 x 4 для проверки оверлея.
function createFakeGrid(): NavGridView {
	return {
		originX: 0,
		originZ: 0,
		cellSize: 0.5,
		cols: 4,
		rows: 4,
		isBlocked: (column, row) => column === 0 || row === 0,
		worldToCell: (point) => ({ col: Math.floor(point.x / 0.5), row: Math.floor(point.z / 0.5) }),
		cellToWorld: (column, row) => ({ x: (column + 0.5) * 0.5, z: (row + 0.5) * 0.5 }),
	};
}

describe("отладочный оверлей (6.7)", () => {
	it("Отладка включена: на сцене есть оверлей, сетка и пути рисуются", () => {
		const { renderer } = createScene(createTestLevel(), true);
		expect(renderer.scene.getObjectByName("debug-overlay")).toBeDefined();
		expect(renderer.debugOverlay).not.toBeNull();
		const info: DebugInfo = {
			collisionGrid: createFakeGrid(),
			navGrid: createFakeGrid(),
			paths: [{ agentId: "waiter-1", points: [{ x: 1, z: 1 }, { x: 2, z: 2 }] }],
			chefProbe: { x: 1.5, z: 1.5 },
		};
		renderer.setDebugInfo(info);
		const stats = renderer.debugOverlay?.getStats();
		expect(stats?.hasGrid).toBe(true);
		expect(stats?.pathLines).toBe(1);
		expect(stats?.hasProbe).toBe(true);
		expect(stats?.stationZones).toBe(createTestLevel().stations.length);
		renderer.setDebugInfo(null);
		expect(renderer.debugOverlay?.getStats().hasGrid).toBe(false);
	});

	it("Отладка выключена: оверлей не создаётся, вызов setDebugInfo безвреден", () => {
		const { renderer } = createScene(createTestLevel(), false);
		expect(renderer.scene.getObjectByName("debug-overlay")).toBeUndefined();
		expect(renderer.debugOverlay).toBeNull();
		expect(() =>
			renderer.setDebugInfo({ collisionGrid: createFakeGrid(), navGrid: createFakeGrid(), paths: [], chefProbe: null }),
		).not.toThrow();
		let debugObjects = 0;
		renderer.scene.traverse((node) => {
			if (node.name.includes("debug")) {
				debugObjects += 1;
			}
		});
		expect(debugObjects).toBe(0);
	});
});
