// Блюда на столах и в окне выдачи (задача 6.5): подача перед клиентом и слоты окна на границе кухни и зала.
// Блюда создаются при появлении в снимке и убираются, когда пропадают.
import { Group, type Object3D } from "three";
import type { DishId, GameSnapshot, LevelConfig, Vec2 } from "../contracts";
import type { ItemVisualFactory } from "./items";

// Высота столешницы (единицы мира): модель стола в паке 1.0, после масштаба 0.5.
export const tableTopHeight = 0.5;

// Высота выступа окна выдачи, на который ставятся блюда (единицы мира).
export const windowSillHeight = 0.5;

// Насколько блюдо в окне выдвинуто к залу от точки слота (единицы мира): иначе стена закрывает его от камеры.
// Смещение мало и не меняет смысл данных уровня (слот остаётся на выступе окна).
export const windowDishOffset = 0.12;

// Слой посуды на столах и в окне.
export interface TablewareLayer {
	readonly root: Group;
	update(snapshot: GameSnapshot): void;
	// Сколько блюд сейчас на столах и в окне (для тестов).
	getCounts(): { table: number; window: number };
	dispose(): void;
}

// Запись пула: объект и блюдо, чтобы пересобирать только при смене.
interface PooledDish {
	object: Object3D;
	dish: DishId;
}

// Создаёт слой посуды по данным уровня.
export function createTablewareLayer(level: LevelConfig, items: ItemVisualFactory): TablewareLayer {
	const root = new Group();
	root.name = "tableware";
	const tableDishes = new Map<string, PooledDish>();
	const windowDishes = new Map<string, PooledDish>();

	// Точка блюда на столе для места клиента или null, если данные не найдены.
	const dishPoints = new Map<string, Vec2>();
	// Лицевая сторона окна (к залу): вектор взгляда (sin yaw, cos yaw) станции окна выдачи.
	const windowStation = level.stations.find((station) => station.id === level.window.stationId);
	const windowYaw = ((windowStation?.rotationDeg ?? 0) * Math.PI) / 180;
	const windowFront: Vec2 = { x: Math.sin(windowYaw), z: Math.cos(windowYaw) };
	for (const table of level.tables) {
		table.seats.forEach((seat, seatIndex) => dishPoints.set(`${table.id}:${seatIndex}`, seat.dishPoint));
	}

	// Синхронизирует пул с желаемым набором: создаёт недостающие, убирает лишние, пересоздаёт при смене блюда.
	function syncPool(pool: Map<string, PooledDish>, wanted: Map<string, { dish: DishId; point: Vec2; height: number }>): void {
		for (const [key, entry] of pool) {
			const want = wanted.get(key);
			if (!want || want.dish !== entry.dish) {
				root.remove(entry.object);
				pool.delete(key);
			}
		}
		for (const [key, want] of wanted) {
			if (pool.has(key)) {
				continue;
			}
			const visual = items.createDishVisual(want.dish);
			visual.object.position.set(want.point.x, want.height, want.point.z);
			root.add(visual.object);
			pool.set(key, { object: visual.object, dish: want.dish });
		}
	}

	return {
		root,
		update(snapshot) {
			const onTable = new Map<string, { dish: DishId; point: Vec2; height: number }>();
			for (const customer of snapshot.customers) {
				if (!customer.dishOnTable || customer.tableId === null || customer.seatIndex === null) {
					continue;
				}
				const point = dishPoints.get(`${customer.tableId}:${customer.seatIndex}`);
				if (point) {
					onTable.set(customer.id, { dish: customer.dish, point, height: tableTopHeight });
				}
			}
			syncPool(tableDishes, onTable);

			const inWindow = new Map<string, { dish: DishId; point: Vec2; height: number }>();
			for (const windowDish of snapshot.windowDishes) {
				const point = level.window.dishPoints[windowDish.slotIndex];
				if (point) {
					const shifted = { x: point.x + windowFront.x * windowDishOffset, z: point.z + windowFront.z * windowDishOffset };
					inWindow.set(windowDish.id, { dish: windowDish.dish, point: shifted, height: windowSillHeight });
				}
			}
			syncPool(windowDishes, inWindow);
		},
		getCounts() {
			return { table: tableDishes.size, window: windowDishes.size };
		},
		dispose() {
			root.clear();
			tableDishes.clear();
			windowDishes.clear();
		},
	};
}
