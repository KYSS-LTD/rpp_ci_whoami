// Общая планировка ресторана: на всех уровнях одна карта, одна кухня, один вход и одна очередь. Уровни отличаются только
// числом столов в зале (столы берутся из фиксированных мест ниже по порядку добавления), меню, расписанием и терпением.
// Кухня компактная (6 x 5) и обставляется по дням кампании: станция появляется в свой день (StationConfig.fromDay) и дальше
// стоит на том же месте. Разбор маршрутов, по которому выбрана расстановка: docs/cooking.md, раздел "Планировка кухни".
import type { DoorConfig, FloorConfig, PropConfig, StationConfig, TableConfig, Vec2 } from "../../contracts";
import { WALL_THICKNESS, createCrate, createFourTop, createQueue, createShell, createStation, createTwoTop, createWallRun, point, rect, type ShellResult, type ShellSpec } from "./builders";

// Оболочка ресторана: мир 14 в ширину, внутри 10 в глубину, улица 3. Здание Г-образное: кухня (6 x 5) в юго-западном углу у
// передней стены, ближе к камере, зал (7 x 10) справа от неё на всю глубину. Место севернее кухни (x от 0 до 6.5, z от 0 до 5)
// отдано улице: там газон с кустами (render/interior.ts). Разделяющая стена на x = 6.5: у кухни в ней окно выдачи, севернее кухни
// это наружная стена зала. Прохода из кухни в зал нет: блюда уходят через окно выдачи.
export const sharedShellSpec: ShellSpec = {
	width: 14,
	interiorDepth: 10,
	streetDepth: 3,
	dividerX: 6.5,
	doorX: 10,
	// Куски по 2 для прямоугольной заготовки (createShell); createSharedShell заменяет разделяющую стену своими кусками.
	dividerKinds: ["wall", "wall", "wall", "skip", "wall"],
};

// Кухня: клетки 1 x 1, шесть столбцов (x от 0.5 до 6.5) и пять рядов (z от 5.5 до 10.5); пятый ряд стоит у низкой передней
// стены. Севернее кухни её наружная стена и газон.
export const KITCHEN_COLUMNS = 6;
export const KITCHEN_ROWS = 5;
const KITCHEN_X = WALL_THICKNESS;
const KITCHEN_Z = WALL_THICKNESS + sharedShellSpec.interiorDepth - KITCHEN_ROWS;
// Северная стена кухни (наружная, высокая: она позади кухни и камеру не загораживает).
const KITCHEN_NORTH_WALL_Z = KITCHEN_Z - WALL_THICKNESS;
// Окно выдачи напротив рядов 3 и 4 кухни: по нему выбрана расстановка станций (раздел "Планировка кухни" в docs/cooking.md).
const WINDOW_Z = KITCHEN_Z + 2;
const WINDOW_LENGTH = 2;

// Собирает оболочку Г-образного здания из прямоугольной заготовки: северная стена идёт только вдоль зала, западная только вдоль
// кухни, кухню сверху закрывает её северная стена, разделяющая стена собрана заново с окном выдачи у кухни. Крайние куски короче 2
// рендер сжимает по длине (render/layout.ts).
export function createSharedShell(): ShellResult {
	const shell = createShell(sharedShellSpec);
	const hallWestX = sharedShellSpec.dividerX;
	const props: PropConfig[] = [];
	for (const prop of shell.props) {
		const north = /^wall-north-(\d+)$/.exec(prop.id);
		const west = /^wall-west-(\d+)$/.exec(prop.id);
		if (prop.id.startsWith("wall-divider-")) {
			continue;
		}
		if (north) {
			// Над кухней нет здания: северная стена начинается у разделяющей.
			if (prop.rect.x + prop.rect.width <= hallWestX) continue;
			props.push(prop.rect.x < hallWestX ? { ...prop, rect: rect(hallWestX, prop.rect.z, prop.rect.x + prop.rect.width - hallWestX, prop.rect.depth) } : prop);
		} else if (west) {
			// Западная стена только вдоль кухни, кусок на углу начинается от северной стены кухни.
			const top = prop.rect.z;
			const bottom = prop.rect.z + prop.rect.depth;
			if (bottom <= KITCHEN_NORTH_WALL_Z) continue;
			props.push(top < KITCHEN_NORTH_WALL_Z ? { ...prop, rect: rect(prop.rect.x, KITCHEN_NORTH_WALL_Z, prop.rect.width, bottom - KITCHEN_NORTH_WALL_Z) } : prop);
		} else {
			props.push(prop);
		}
	}
	// Северная стена кухни между западной и разделяющей.
	props.push(...createWallRun("wall-kitchen-north", KITCHEN_X, KITCHEN_NORTH_WALL_Z, "x", ["wall", "wall", "wall"]));
	// Разделяющая стена сверху вниз: три куска зала у газона, кусок до окна, окно выдачи (станция), низкий кусок у передней стены
	// (высокий закрыл бы от камеры блюда в окне).
	const dividerPiece = (index: number, z: number, length: number, low: boolean): PropConfig => ({
		id: `wall-divider-${index}`,
		model: low ? "wall_low" : "wall",
		rect: rect(hallWestX, z, WALL_THICKNESS, length),
		rotationDeg: 90,
		blocking: true,
	});
	const interiorTop = WALL_THICKNESS;
	const frontWallZ = shell.frontWallZ;
	props.push(
		dividerPiece(0, interiorTop, 2, false),
		dividerPiece(1, interiorTop + 2, 2, false),
		dividerPiece(2, interiorTop + 4, WINDOW_Z - interiorTop - 4, false),
		dividerPiece(3, WINDOW_Z + WINDOW_LENGTH, frontWallZ - WINDOW_Z - WINDOW_LENGTH, true),
	);
	return { ...shell, props, windowRect: rect(hallWestX, WINDOW_Z, WALL_THICKNESS, WINDOW_LENGTH) };
}

// Пол: кухня, зал, улица и газон севернее кухни (пол не рисуется, видна трава окружения; прямоугольник нужен для кустов).
export function createSharedFloors(shell: ShellResult): FloorConfig[] {
	const spec = sharedShellSpec;
	const hallStartX = spec.dividerX + WALL_THICKNESS;
	return [
		{ rect: rect(KITCHEN_X, KITCHEN_Z, spec.dividerX - KITCHEN_X, KITCHEN_ROWS), zone: "kitchen" },
		{ rect: rect(hallStartX, WALL_THICKNESS, spec.width - WALL_THICKNESS - hallStartX, spec.interiorDepth), zone: "hall" },
		{ rect: rect(0, shell.streetZ, spec.width, shell.bounds.depth - shell.streetZ), zone: "street" },
		{ rect: rect(0, 0, spec.dividerX, KITCHEN_NORTH_WALL_Z), zone: "garden" },
	];
}

// Левый верхний угол клетки кухни: столбец 1..6 с запада, ряд 1..5 с севера.
function cell(column: number, row: number): { x: number; z: number } {
	return { x: KITCHEN_X + column - 1, z: KITCHEN_Z + row - 1 };
}

// Станция в клетке кухни с днём появления.
function placed(day: number, station: StationConfig): StationConfig {
	return { ...station, fromDay: day };
}

// Кухня пятого дня целиком. Схема (ряды с севера, столбцы с запада; "." проход, W окно выдачи на разделяющей стене):
//   ряд 1:  прилавок  лук        раковина   плита+к.   духовка    ветчина
//   ряд 2:  .         .          .          .          .          .
//   ряд 3:  .         морковь    картофель  доска      тарелки    .        W
//   ряд 4:  .         .          .          .          .          .        W
//   ряд 5:  прилавок  урна       плита      булочки    плита      стейк
// Проходы (ряды 2 и 4, концы ряда 3) образуют кольцо вокруг острова; к каждой станции подходят прямо, к острову с двух сторон.
// Тарелки стоят на острове прямо напротив окна: "на тарелку и в окно" почти без шагов. Из прохода ряда 4 повар достаёт доску и
// булочки (столбец 4), тарелки и плиту (столбец 5), стейк и окно (столбец 6); из прохода ряда 2 кастрюлю и доску (столбец 4),
// духовку и тарелки (столбец 5). Высокая духовка у северной стены не закрывает кухню от камеры. Расстановка найдена перебором
// перестановок по длине маршрутов блюд всех пяти дней (bot/routeAnalysis.ts, docs/cooking.md, раздел "Планировка кухни").
// День в первом аргументе placed: в этот день станция появляется на кухне и дальше стоит на том же месте (config/levels/campaign.ts).
export function createSharedKitchenStations(): StationConfig[] {
	const station = (day: number, id: string, kind: StationConfig["kind"], column: number, row: number, extra: Partial<StationConfig> = {}) =>
		placed(day, createStation(id, kind, cell(column, row).x, cell(column, row).z, 0, extra));
	const crate = (day: number, ingredient: NonNullable<StationConfig["ingredient"]>, column: number, row: number) =>
		placed(day, createCrate(ingredient, cell(column, row).x, cell(column, row).z));
	return [
		// День 1 (окорок): духовка, два прилавка, урна, ящик ветчины, тарелки.
		station(1, "oven-1", "oven", 5, 1),
		crate(1, "ham", 6, 1),
		station(1, "plates-1", "plateStack", 5, 3),
		station(1, "counter-1", "counter", 1, 1),
		station(1, "counter-2", "counter", 1, 5),
		station(1, "trash-1", "trash", 2, 5),
		// День 2 (стейк): ящик стейков у окна и две плиты для жарки в южном ряду.
		crate(2, "steak", 6, 5),
		station(2, "stove-1", "stove", 5, 5),
		station(2, "stove-2", "stove", 3, 5),
		// День 3 (бургер): стол с разделочной доской на острове рядом с тарелками, ящик булочек между плитами.
		station(3, "board-1", "cuttingBoard", 4, 3),
		crate(3, "bun", 4, 5),
		// День 4 (овощной бургер): картофель и морковь на острове рядом с доской.
		crate(4, "potato", 3, 3),
		crate(4, "carrot", 2, 3),
		// День 5 (рагу): плита с кастрюлей напротив доски, раковина рядом с ней, ящик лука.
		station(5, "pot-stove", "stove", 4, 1, { startItem: "pot" }),
		station(5, "sink-1", "tap", 3, 1),
		crate(5, "onion", 2, 1),
	];
}

// Старт повара: в проходе у окна выдачи (столбец 5, ряд 4).
export const sharedChefStart = { position: point(KITCHEN_X + 4.5, KITCHEN_Z + 3.5), facing: 0 as const };

// Точки ожидания официантов; уровню достаётся нужное число первых точек.
export const sharedWaiterWaitPoints: readonly Vec2[] = [point(12.75, 1.25), point(12.75, 6.25)];

// Общая боковая линия подачи: все места подаются с свободного прохода справа от столов.
const SHARED_APPROACH_X = 12.75;

// Столы зала в порядке добавления: каждый следующий уровень оставляет предыдущие столы на местах и ставит новые в свободные.
// Сверху вниз по залу: 4-местный на z = 1, дополнительный 4-местный на z = 3.5, четыре 2-местных на z = 6, 7, 8, 9.
type HallTableSlot = { id: string; seats: 2 | 4; z: number };
const HALL_TABLE_SLOTS: readonly HallTableSlot[] = [
	{ id: "four-top-north", seats: 4, z: 1 },
	{ id: "four-top-middle", seats: 4, z: 3.5 },
	{ id: "two-top-1", seats: 2, z: 6 },
	{ id: "two-top-2", seats: 2, z: 7 },
	{ id: "two-top-3", seats: 2, z: 8 },
	{ id: "two-top-4", seats: 2, z: 9 },
];

// Какие места из HALL_TABLE_SLOTS занимает уровень (по индексам): каждый следующий уровень только добавляет столы.
export const EASY_TABLE_SLOTS: readonly number[] = [0, 2, 3];
export const MEDIUM_TABLE_SLOTS: readonly number[] = [0, 1, 2, 3];
export const HARD_TABLE_SLOTS: readonly number[] = [0, 1, 2, 3, 4, 5];

// Столы уровня: номера идут сверху вниз по залу.
export function createHallTables(slotIndices: readonly number[]): TableConfig[] {
	return slotIndices.map((slotIndex, order) => {
		const slot = HALL_TABLE_SLOTS[slotIndex];
		const id = `table-${order + 1}`;
		return slot.seats === 4 ? createFourTop(id, order + 1, 10, slot.z, SHARED_APPROACH_X) : createTwoTop(id, order + 1, 10, slot.z, SHARED_APPROACH_X);
	});
}

// Дверь и путь клиентов: одинаковые на всех уровнях.
export function createSharedDoor(shell: ShellResult): DoorConfig {
	return {
		rect: shell.doorRect,
		rotationDeg: 0,
		insidePoint: point(11, 10.25),
		outsidePoint: point(11, 11.5),
		spawnPoint: point(11, 11.8),
		exitPoint: point(12.5, 13.2),
	};
}

// Слоты очереди слева от двери: четыре в первом ряду и два во втором; уровню достаётся нужное число первых слотов.
const sharedQueuePoints: readonly Vec2[] = [point(9.5, 12), point(7, 12), point(4.5, 12), point(2, 12), point(9.5, 13.3), point(7, 13.3)];

export function createSharedQueue(slotCount: number) {
	return createQueue(sharedQueuePoints.slice(0, slotCount));
}
