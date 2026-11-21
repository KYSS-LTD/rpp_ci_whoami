// Расстановка статичных объектов по данным уровня (задача 6.2): пол по зонам, стены и мебель (props), столы и стулья.
// Станции расставляет stations.ts. Все объекты ставятся в те же координаты, что использует игровая логика: центр модели
// в центре прямоугольника, поворот rotationDeg по yaw, масштаб MODEL_SCALE (по Y дополнительно heightScale).
// В реестр попадают только объекты конфига; декор улицы и зала строят environment.ts и interior.ts отдельно.
import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3, type BufferGeometry, type Material } from "three";
import { MODEL_SCALE, type FloorConfig, type LevelConfig, type PropConfig, type Rect, type Rotation, type ZoneKind } from "../contracts";
import { rectCenter } from "../common/math";
import type { LoadedAssets } from "./assets";
import { floorColors } from "./palette";
import { textureTileSizes, type SceneTextures } from "./textures";
import { WALL_MODEL_THICKNESS } from "./wallModels";

// Толщина плиты пола под нулевой отметкой (верх пола лежит на y = 0).
const floorSlabThickness = 0.1;

// Толщина плитки пола из модели пака в мире: модель floor_kitchen_small в паке имеет толщину 0.5 (0.25 в мире после масштаба).
const floorTileThicknessWorld = 0.5 * MODEL_SCALE;

// Какая модель плитки рисует каждую зону. Зоны без модели (null) рисуются плитой цвета зоны.
const floorTileModels: Readonly<Record<ZoneKind, string | null>> = {
	kitchen: "floor_kitchen_small",
	hall: null,
	street: null,
};

// Доля прямоугольника стола, которую занимает видимая столешница (коллизия и места считаются по полному прямоугольнику).
const tableVisualFill = 0.84;

// Реестр объектов конфига на сцене: идентификатор из LevelConfig -> корневой объект. Нужен тестам и подсветке.
export type PlacedRegistry = Map<string, Object3D>;

// Результат расстановки статики.
export interface StaticLayout {
	root: Group;
	registry: PlacedRegistry;
	dispose(): void;
}

// Поверхности пола, которые задаёт сцена: дерево зала из текстур и общий с окружением материал тротуара.
export interface LayoutSurfaces {
	textures?: SceneTextures;
	// Материал зоны улицы: тот же, что у продолжения тротуара в environment.ts (плитка без шва).
	streetMaterial?: Material;
}

// Переводит rotationDeg в yaw (радианы): 0 - модель смотрит на камеру (+z), 90 - на +x.
export function rotationToYaw(rotationDeg: Rotation | number): number {
	return (rotationDeg * Math.PI) / 180;
}

// Номер куска стены по идентификатору ("wall-north-3" -> 3) или null, если кусок из другого ряда.
export function wallPieceIndex(propId: string, run: "north" | "east" | "west"): number | null {
	const match = new RegExp(`^wall-${run}-(\\d+)$`).exec(propId);
	return match ? Number(match[1]) : null;
}

// Модель окна для куска наружной стены или null. Окна прорезаны в северной стене (кухня и зал) и в боковых стенах через кусок,
// чтобы стены не были глухими. Меняется только модель: размер, положение и коллизия стены остаются из конфига.
export function getWallWindowModel(prop: Pick<PropConfig, "id" | "model">): string | null {
	if (prop.model !== "wall") {
		return null;
	}
	const north = wallPieceIndex(prop.id, "north");
	if (north !== null) {
		return north === 1 || north === 5 ? "wall_window_closed" : null;
	}
	const side = wallPieceIndex(prop.id, "east") ?? wallPieceIndex(prop.id, "west");
	if (side !== null) {
		return side === 1 || side === 3 ? "wall_window_closed" : null;
	}
	return null;
}

// Ставит корень модели в центр прямоугольника с поворотом и масштабом MODEL_SCALE (по Y умножается на heightScale).
export function placeAtRect(object: Object3D, rect: Rect, rotationDeg: Rotation, heightScale = 1): Object3D {
	const center = rectCenter(rect);
	object.position.set(center.x, 0, center.z);
	object.rotation.y = rotationToYaw(rotationDeg);
	object.scale.set(MODEL_SCALE, MODEL_SCALE * heightScale, MODEL_SCALE);
	return object;
}

// UV по мировым x и z: плиты пола разных зон и тротуары окружения стыкуются без шва текстуры.
function applyWorldUv(geometry: BufferGeometry, centerX: number, centerZ: number, tileSize: number): void {
	const position = geometry.getAttribute("position");
	const uv = geometry.getAttribute("uv");
	for (let index = 0; index < position.count; index += 1) {
		uv.setXY(index, (position.getX(index) + centerX) / tileSize, -(position.getZ(index) + centerZ) / tileSize);
	}
	uv.needsUpdate = true;
}

// Участок пола. Кухня: плитки модели пака через InstancedMesh (одна отрисовка на всю зону); зал: доски из текстуры;
// улица: плитка тротуара общим материалом окружения. Без текстур зоны рисуются плитой цвета зоны.
function createFloor(floor: FloorConfig, assets: LoadedAssets, surfaces: LayoutSurfaces, disposables: Array<{ dispose(): void }>): Object3D {
	const tileModelName = floorTileModels[floor.zone];
	const rect = floor.rect;
	if (tileModelName !== null && assets.has(tileModelName)) {
		const template = assets.cloneModel(tileModelName);
		let tileMesh: Mesh | null = null;
		template.traverse((node) => {
			const mesh = node as Mesh;
			if (!tileMesh && mesh.isMesh) {
				tileMesh = mesh;
			}
		});
		if (tileMesh) {
			return createTiledFloor(tileMesh, rect);
		}
	}
	const geometry = new BoxGeometry(rect.width, floorSlabThickness, rect.depth);
	const center = rectCenter(rect);
	disposables.push(geometry);
	let material: Material;
	if (floor.zone === "street" && surfaces.streetMaterial) {
		material = surfaces.streetMaterial;
		applyWorldUv(geometry, center.x, center.z, textureTileSizes.paving);
	} else if (floor.zone === "hall" && surfaces.textures?.hallFloor) {
		material = new MeshStandardMaterial({ map: surfaces.textures.hallFloor, roughness: 0.78, metalness: 0 });
		applyWorldUv(geometry, center.x, center.z, textureTileSizes.hallFloor);
		disposables.push(material);
	} else {
		material = new MeshStandardMaterial({ color: floorColors[floor.zone], roughness: 0.9, metalness: 0 });
		disposables.push(material);
	}
	const slab = new Mesh(geometry, material);
	slab.position.set(center.x, -floorSlabThickness / 2, center.z);
	slab.receiveShadow = true;
	return slab;
}

// Плитки пола 1 x 1 (floor_kitchen_small после масштаба). Крайние плитки неполного размера сжимаются по осям.
function createTiledFloor(tileMesh: Mesh, rect: Rect): InstancedMesh {
	const tileSize = 2 * MODEL_SCALE;
	const columns = Math.ceil(rect.width / tileSize - 1e-6);
	const rows = Math.ceil(rect.depth / tileSize - 1e-6);
	const instanced = new InstancedMesh(tileMesh.geometry, tileMesh.material, columns * rows);
	const matrix = new Matrix4();
	const position = new Vector3();
	const scale = new Vector3();
	const rotation = new Quaternion();
	let index = 0;
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const tileWidth = Math.min(tileSize, rect.width - column * tileSize);
			const tileDepth = Math.min(tileSize, rect.depth - row * tileSize);
			// Начало плитки в центре (модель 2 x 2 в паке, центр в начале координат), поэтому сдвиг на половину её размера.
			position.set(rect.x + column * tileSize + tileWidth / 2, -floorTileThicknessWorld, rect.z + row * tileSize + tileDepth / 2);
			scale.set((MODEL_SCALE * tileWidth) / tileSize, MODEL_SCALE, (MODEL_SCALE * tileDepth) / tileSize);
			matrix.compose(position, rotation, scale);
			instanced.setMatrixAt(index, matrix);
			index += 1;
		}
	}
	instanced.instanceMatrix.needsUpdate = true;
	instanced.receiveShadow = true;
	return instanced;
}

// Включает тени у всех мешей объекта: статичные стены и мебель отбрасывают и принимают запечённые тени солнца.
function enableShadows(object: Object3D): void {
	object.traverse((node) => {
		const mesh = node as Mesh;
		if (mesh.isMesh) {
			mesh.castShadow = true;
			mesh.receiveShadow = true;
		}
	});
}

// Растягивает модель куска стены (и окна выдачи) по толщине на всю полосу из конфига. Стенка моделей пака тоньше полосы
// (0.25 против 0.5): по центру полосы она оставляла щели до пола и тротуара, через которые видна трава, а в углах торцы боковых
// стен не доходили до поперечных, и те выступали наружу. Во всю полосу стыки пола и углы смыкаются, видимая стена совпадает
// с коллизией. Модель должна стоять в обёртке с масштабом MODEL_SCALE (placeAtRect, addLocalModel).
export function fitWallThickness(model: Object3D, rect: Rect): void {
	model.scale.z *= Math.min(rect.width, rect.depth) / (WALL_MODEL_THICKNESS * MODEL_SCALE);
}

// Препятствие или декор (стена, колонна, мебель). Модель null означает невидимый объект: на сцене его нет.
// Наружные стены могут получить модель с окном того же размера (getWallWindowModel).
function createProp(prop: PropConfig, assets: LoadedAssets): Object3D | null {
	if (prop.model === null) {
		return null;
	}
	const windowModel = getWallWindowModel(prop);
	const modelName = windowModel !== null && assets.has(windowModel) ? windowModel : prop.model;
	const wrapper = new Group();
	const model = assets.cloneModel(modelName);
	if (modelName.startsWith("wall")) {
		fitWallThickness(model, prop.rect);
	}
	wrapper.add(model);
	enableShadows(wrapper);
	return placeAtRect(wrapper, prop.rect, prop.rotationDeg, prop.heightScale ?? 1);
}

// Расставляет пол, props, столы и стулья. Каждый созданный объект кладётся в реестр под идентификатором конфига:
// "floor-<номер>", prop.id, id стола, "<id стола>-chair-<номер места>".
export function buildStaticLayout(level: LevelConfig, assets: LoadedAssets, surfaces: LayoutSurfaces = {}): StaticLayout {
	const root = new Group();
	root.name = "level-static";
	const registry: PlacedRegistry = new Map();
	const disposables: Array<{ dispose(): void }> = [];

	function addPlaced(id: string, object: Object3D | null): void {
		if (object === null) {
			return;
		}
		object.name = id;
		object.userData.configId = id;
		registry.set(id, object);
		root.add(object);
	}

	level.floors.forEach((floor, index) => addPlaced(`floor-${index}`, createFloor(floor, assets, surfaces, disposables)));
	level.props.forEach((prop) => addPlaced(prop.id, createProp(prop, assets)));
	// Порог под проёмами (кухня-зал, входная дверь): зоны пола кончаются у полосы стены, и без порога в проёме видна трава.
	// Доски зала с мировыми UV продолжают рисунок пола без шва. В реестр не попадает: это не объект конфига.
	level.props
		.filter((prop) => prop.model !== null && prop.model.includes("doorway"))
		.forEach((prop) => {
			const threshold = createFloor({ rect: prop.rect, zone: "hall" }, assets, surfaces, disposables);
			threshold.name = `threshold-${prop.id}`;
			root.add(threshold);
		});

	for (const table of level.tables) {
		const tableWrapper = new Group();
		const tableModel = assets.cloneModel(table.model);
		// Одна квадратная модель стола на все размеры: растягиваем её по плану (x, z) до прямоугольника стола, высоту не трогаем.
		const modelBox = new Box3().setFromObject(tableModel);
		if (!modelBox.isEmpty()) {
			// Столешница чуть меньше прямоугольника стола: между вплотную стоящими столами остаётся видимая щель.
			const footprintScale = (table.rect.width * tableVisualFill) / ((modelBox.max.x - modelBox.min.x) * MODEL_SCALE);
			tableModel.scale.set(footprintScale, 1, footprintScale);
		}
		tableWrapper.add(tableModel);
		enableShadows(tableWrapper);
		addPlaced(table.id, placeAtRect(tableWrapper, table.rect, table.rotationDeg));
		table.seats.forEach((seat, seatIndex) => {
			const chairWrapper = new Group();
			chairWrapper.add(assets.cloneModel(seat.chairModel));
			enableShadows(chairWrapper);
			addPlaced(`${table.id}-chair-${seatIndex}`, placeAtRect(chairWrapper, seat.chairRect, seat.rotationDeg));
		});
	}

	return {
		root,
		registry,
		dispose() {
			disposables.forEach((item) => item.dispose());
		},
	};
}
