// Отладочный оверлей сцены (задача 6.7): навигационная сетка, пути персонажей, зоны станций, точка выбора цели и
// идентификаторы станций. Создаётся только при NEXT_PUBLIC_DEBUG=true: при выключенной отладке функция возвращает null
// и в сцену ничего не добавляется. Тексты оверлея (идентификаторы) отладочные и в файлы текстов не выносятся.
import {
	BufferGeometry,
	CanvasTexture,
	Float32BufferAttribute,
	Group,
	InstancedMesh,
	Line,
	LineBasicMaterial,
	LineLoop,
	LineSegments,
	Matrix4,
	MeshBasicMaterial,
	PlaneGeometry,
	Sprite,
	SpriteMaterial,
	Vector3,
	type Material,
	type Object3D,
} from "three";
import type { DebugInfo, LevelConfig, NavGridView, Rect } from "../contracts";

// Высоты слоёв оверлея над полом (чтобы линии не мерцали на полу).
const gridHeight = 0.04;
const zoneHeight = 0.06;
const pathHeight = 0.09;

// Цвета оверлея.
const colors = {
	gridLine: 0xffffff,
	blockedNav: 0xff3b30,
	blockedCollision: 0xff9f0a,
	stationZone: 0x30d5c8,
	doorZone: 0x64d2ff,
	path: 0x32ff7e,
	probe: 0xffd60a,
} as const;

// Создатель подписи: по умолчанию рисует текст на canvas, в тестах подменяется.
export type DebugLabelFactory = (text: string) => Object3D | null;

// Отладочный оверлей.
export interface DebugOverlay {
	readonly root: Group;
	// Обновляет динамические слои (сетка, пути, точка выбора). null убирает их.
	setInfo(info: DebugInfo | null): void;
	// Сводка для тестов: что сейчас нарисовано.
	getStats(): { stationZones: number; labels: number; pathLines: number; hasGrid: boolean; hasProbe: boolean };
	dispose(): void;
}

// Подпись на canvas: белый текст на тёмной плашке. null, если canvas недоступен (тестовое окружение).
function createCanvasLabel(text: string): Object3D | null {
	const canvas = document.createElement("canvas");
	canvas.width = 256;
	canvas.height = 64;
	const context = canvas.getContext("2d");
	if (!context) {
		return null;
	}
	context.fillStyle = "rgba(0, 0, 0, 0.65)";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "#ffffff";
	context.font = "bold 28px monospace";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillText(text, canvas.width / 2, canvas.height / 2);
	const texture = new CanvasTexture(canvas);
	const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
	sprite.scale.set(1.2, 0.3, 1);
	sprite.renderOrder = 20;
	return sprite;
}

// Контур прямоугольника на полу.
function createRectOutline(rect: Rect, color: number, height: number): LineLoop {
	const geometry = new BufferGeometry().setFromPoints([
		new Vector3(rect.x, height, rect.z),
		new Vector3(rect.x + rect.width, height, rect.z),
		new Vector3(rect.x + rect.width, height, rect.z + rect.depth),
		new Vector3(rect.x, height, rect.z + rect.depth),
	]);
	return new LineLoop(geometry, new LineBasicMaterial({ color }));
}

// Освобождает геометрию и материалы объекта и его потомков.
function disposeObject(object: Object3D): void {
	object.traverse((node) => {
		const withGeometry = node as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
		withGeometry.geometry?.dispose();
		const material = withGeometry.material;
		if (Array.isArray(material)) {
			material.forEach((item) => disposeMaterial(item));
		} else if (material) {
			disposeMaterial(material);
		}
	});
}

function disposeMaterial(material: Material): void {
	const map = (material as MeshBasicMaterial).map;
	map?.dispose();
	material.dispose();
}

// Создаёт оверлей. При enabled = false возвращает null: объекты отладки не создаются вовсе.
export function createDebugOverlay(level: LevelConfig, enabled: boolean, createLabel: DebugLabelFactory = createCanvasLabel): DebugOverlay | null {
	if (!enabled) {
		return null;
	}
	const root = new Group();
	root.name = "debug-overlay";
	const staticLayer = new Group();
	const dynamicLayer = new Group();
	root.add(staticLayer, dynamicLayer);

	// Статичные слои: зоны станций с подписями, проём двери, зоны пола.
	let stationZones = 0;
	let labels = 0;
	for (const station of level.stations) {
		staticLayer.add(createRectOutline(station.rect, colors.stationZone, zoneHeight));
		stationZones += 1;
		const label = createLabel(station.id);
		if (label) {
			label.position.set(station.rect.x + station.rect.width / 2, 1.4, station.rect.z + station.rect.depth / 2);
			staticLayer.add(label);
			labels += 1;
		}
	}
	staticLayer.add(createRectOutline(level.door.rect, colors.doorZone, zoneHeight));
	level.floors.forEach((floor) => staticLayer.add(createRectOutline(floor.rect, 0xbf5af2, gridHeight)));

	// Динамические слои.
	let gridLayer: Group | null = null;
	let gridSource: NavGridView | null = null;
	let pathLines = 0;
	let pathLayer: Group | null = null;
	let probe: Object3D | null = null;

	// Сетка: линии клеток и закрашенные заблокированные клетки навигации (красные) и столкновений (оранжевые).
	function buildGrid(info: DebugInfo): Group {
		const group = new Group();
		const nav = info.navGrid;
		const collision = info.collisionGrid;
		const linePositions: number[] = [];
		for (let column = 0; column <= nav.cols; column += 1) {
			const x = nav.originX + column * nav.cellSize;
			linePositions.push(x, gridHeight, nav.originZ, x, gridHeight, nav.originZ + nav.rows * nav.cellSize);
		}
		for (let row = 0; row <= nav.rows; row += 1) {
			const z = nav.originZ + row * nav.cellSize;
			linePositions.push(nav.originX, gridHeight, z, nav.originX + nav.cols * nav.cellSize, gridHeight, z);
		}
		const lineGeometry = new BufferGeometry();
		lineGeometry.setAttribute("position", new Float32BufferAttribute(linePositions, 3));
		group.add(new LineSegments(lineGeometry, new LineBasicMaterial({ color: colors.gridLine, transparent: true, opacity: 0.18 })));

		const cellGeometry = new PlaneGeometry(nav.cellSize * 0.94, nav.cellSize * 0.94).rotateX(-Math.PI / 2);
		for (const [grid, color, opacity] of [
			[nav, colors.blockedNav, 0.35],
			[collision, colors.blockedCollision, 0.25],
		] as const) {
			const blocked: Vector3[] = [];
			for (let row = 0; row < grid.rows; row += 1) {
				for (let column = 0; column < grid.cols; column += 1) {
					if (grid.isBlocked(column, row)) {
						const center = grid.cellToWorld(column, row);
						blocked.push(new Vector3(center.x, grid === nav ? gridHeight + 0.002 : gridHeight + 0.004, center.z));
					}
				}
			}
			if (blocked.length === 0) {
				continue;
			}
			const mesh = new InstancedMesh(cellGeometry, new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), blocked.length);
			const matrix = new Matrix4();
			blocked.forEach((position, index) => {
				matrix.makeTranslation(position.x, position.y, position.z);
				mesh.setMatrixAt(index, matrix);
			});
			mesh.instanceMatrix.needsUpdate = true;
			group.add(mesh);
		}
		return group;
	}

	return {
		root,
		setInfo(info) {
			if (info === null) {
				if (gridLayer) {
					dynamicLayer.remove(gridLayer);
					disposeObject(gridLayer);
					gridLayer = null;
					gridSource = null;
				}
				if (pathLayer) {
					dynamicLayer.remove(pathLayer);
					disposeObject(pathLayer);
					pathLayer = null;
				}
				pathLines = 0;
				if (probe) {
					dynamicLayer.remove(probe);
					disposeObject(probe);
					probe = null;
				}
				return;
			}

			// Сетка строится заново только при смене объекта сетки.
			if (gridSource !== info.navGrid) {
				if (gridLayer) {
					dynamicLayer.remove(gridLayer);
					disposeObject(gridLayer);
				}
				gridLayer = buildGrid(info);
				gridSource = info.navGrid;
				dynamicLayer.add(gridLayer);
			}

			// Пути пересоздаются каждый вызов: их мало, а отладка нужна точной.
			if (pathLayer) {
				dynamicLayer.remove(pathLayer);
				disposeObject(pathLayer);
			}
			pathLayer = new Group();
			pathLines = 0;
			for (const path of info.paths) {
				if (path.points.length === 0) {
					continue;
				}
				const geometry = new BufferGeometry().setFromPoints(path.points.map((point) => new Vector3(point.x, pathHeight, point.z)));
				pathLayer.add(new Line(geometry, new LineBasicMaterial({ color: colors.path })));
				pathLines += 1;
			}
			dynamicLayer.add(pathLayer);

			// Точка выбора цели перед поваром.
			if (probe) {
				dynamicLayer.remove(probe);
				disposeObject(probe);
				probe = null;
			}
			if (info.chefProbe) {
				const marker = new Group();
				marker.add(createRectOutline({ x: -0.08, z: -0.08, width: 0.16, depth: 0.16 }, colors.probe, 0));
				marker.position.set(info.chefProbe.x, pathHeight, info.chefProbe.z);
				probe = marker;
				dynamicLayer.add(marker);
			}
		},
		getStats() {
			return { stationZones, labels, pathLines, hasGrid: gridLayer !== null, hasProbe: probe !== null };
		},
		dispose() {
			disposeObject(root);
			root.clear();
		},
	};
}
