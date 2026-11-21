// Расстановка статичных объектов по данным уровня (задача 6.2): пол по зонам, стены и мебель (props), столы и стулья.
// Станции расставляет stations.ts. Все объекты ставятся в те же координаты, что использует игровая логика: центр модели
// в центре прямоугольника, поворот rotationDeg по yaw, масштаб MODEL_SCALE (по Y дополнительно heightScale).
import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, SphereGeometry, Vector3 } from "three";
import { MODEL_SCALE, type FloorConfig, type LevelConfig, type PropConfig, type Rect, type Rotation, type ZoneKind } from "../contracts";
import { rectCenter } from "../common/math";
import type { LoadedAssets } from "./assets";
import { floorColors } from "./palette";

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

// Переводит rotationDeg в yaw (радианы): 0 - модель смотрит на камеру (+z), 90 - на +x.
export function rotationToYaw(rotationDeg: Rotation | number): number {
	return (rotationDeg * Math.PI) / 180;
}

// Ставит корень модели в центр прямоугольника с поворотом и масштабом MODEL_SCALE (по Y умножается на heightScale).
export function placeAtRect(object: Object3D, rect: Rect, rotationDeg: Rotation, heightScale = 1): Object3D {
	const center = rectCenter(rect);
	object.position.set(center.x, 0, center.z);
	object.rotation.y = rotationToYaw(rotationDeg);
	object.scale.set(MODEL_SCALE, MODEL_SCALE * heightScale, MODEL_SCALE);
	return object;
}

// Участок пола. Кухня: плитки модели пака через InstancedMesh (одна отрисовка на всю зону), остальные зоны: плита цвета зоны.
function createFloor(floor: FloorConfig, assets: LoadedAssets, disposables: Array<{ dispose(): void }>): Object3D {
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
	const material = new MeshStandardMaterial({ color: floorColors[floor.zone], roughness: 0.9, metalness: 0 });
	disposables.push(geometry, material);
	const slab = new Mesh(geometry, material);
	const center = rectCenter(rect);
	slab.position.set(center.x, -floorSlabThickness / 2, center.z);
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
	return instanced;
}

// Препятствие или декор (стена, колонна, мебель). Модель null означает невидимый объект: на сцене его нет.
function createProp(prop: PropConfig, assets: LoadedAssets): Object3D | null {
	if (prop.model === null) {
		return null;
	}
	const wrapper = new Group();
	wrapper.add(assets.cloneModel(prop.model));
	return placeAtRect(wrapper, prop.rect, prop.rotationDeg, prop.heightScale ?? 1);
}

// Расставляет пол, props, столы и стулья. Каждый созданный объект кладётся в реестр под идентификатором конфига:
// "floor-<номер>", prop.id, id стола, "<id стола>-chair-<номер места>".
export function buildStaticLayout(level: LevelConfig, assets: LoadedAssets): StaticLayout {
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

	level.floors.forEach((floor, index) => addPlaced(`floor-${index}`, createFloor(floor, assets, disposables)));
	level.props.forEach((prop) => addPlaced(prop.id, createProp(prop, assets)));

	// Наружная тротуарная полоса и зелёные кадки создают улицу вокруг входа, не добавляя коллизий навигации.
	const street = level.floors.find((floor) => floor.zone === "street");
	if (street) {
		const sidewalkGeometry = new BoxGeometry(street.rect.width, 0.035, Math.min(1.4, street.rect.depth));
		const sidewalkMaterial = new MeshStandardMaterial({ color: 0xc7bba7, roughness: 0.94 });
		disposables.push(sidewalkGeometry, sidewalkMaterial);
		const sidewalk = new Mesh(sidewalkGeometry, sidewalkMaterial);
		sidewalk.position.set(street.rect.x + street.rect.width / 2, 0.012, street.rect.z + 0.8);
		addPlaced("street-sidewalk", sidewalk);

		const planterMaterial = new MeshStandardMaterial({ color: 0xb86642, roughness: 0.86 });
		const leafMaterial = new MeshStandardMaterial({ color: 0x49864e, roughness: 0.9 });
		const planterGeometry = new BoxGeometry(0.88, 0.34, 0.62);
		const leafGeometry = new SphereGeometry(0.28, 10, 8);
		disposables.push(planterMaterial, leafMaterial, planterGeometry, leafGeometry);
		const plantXs = [level.door.rect.x + level.door.rect.width + 2.25, street.rect.x + street.rect.width - 1.25];
		plantXs.forEach((x, index) => {
			if (x < street.rect.x + 0.5 || x > street.rect.x + street.rect.width - 0.5) return;
			const planter = new Group();
			const box = new Mesh(planterGeometry, planterMaterial);
			box.position.y = 0.18;
			planter.add(box);
			for (let leaf = 0; leaf < 4; leaf += 1) {
				const crown = new Mesh(leafGeometry, leafMaterial);
				const angle = (leaf / 4) * Math.PI * 2;
				crown.position.set(Math.cos(angle) * 0.18, 0.48 + (leaf % 2) * 0.12, Math.sin(angle) * 0.16);
				crown.scale.set(1, 1.35, 0.9);
				planter.add(crown);
			}
			planter.position.set(x, 0, street.rect.z + 1.15 + index * 0.2);
			addPlaced(`street-plant-${index + 1}`, planter);
		});
	}

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
		addPlaced(table.id, placeAtRect(tableWrapper, table.rect, table.rotationDeg));
		table.seats.forEach((seat, seatIndex) => {
			const chairWrapper = new Group();
			chairWrapper.add(assets.cloneModel(seat.chairModel));
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
