// Общая тестовая фикстура: небольшой, но полный и валидный уровень (все виды станций, три стола на 2, 4 и 2 места,
// окно выдачи, дверь, очередь из трёх слотов, один официант). Нужна тестам всех областей, чтобы не собирать уровень заново.
// Владелец: Opus-агент. Это не уровень игры: настоящие easy, medium и hard лежат в config/levels (задачи 8.1-8.3).
// Если фикстуры не хватает (нужен второй официант, меню на hard и так далее), используйте overrides или просите в inbox-opus.md.
//
// Схема (x вправо, z вниз; клетка 0.5; прилавок 1 x 1):
//   x 0..7.5   кухня (север: ящики, запад: прилавки и тарелки, центр: две доски, юг: плиты, духовка, урна)
//   x 7..7.5   разделяющая стена: стена, окно выдачи (z 2.5..4.5), проход (z 4.5..6.5), стена
//   x 7.5..18  зал: три стола (2, 4 и 2 места), дверь в южной стене (x 8..10), улица с очередью (z 9..14)
import type { LevelConfig, LevelParams, PropConfig, Rect, Rotation, SeatConfig, StationConfig, TableConfig } from "../../contracts";
import { createParams, type DeepPartial } from "../../config/levels/defaults";

// Прямоугольник по четырём числам.
function rect(x: number, z: number, width: number, depth: number): Rect {
	return { x, z, width, depth };
}

// Ряд стен из кусков длиной 2 (модель wall). axis x: кусок 2 x 0.5, axis z: кусок 0.5 x 2 с поворотом 90.
function createWallRun(idPrefix: string, startX: number, startZ: number, pieceCount: number, axis: "x" | "z", skipPieces: number[] = []): PropConfig[] {
	const props: PropConfig[] = [];
	for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
		if (skipPieces.includes(pieceIndex)) {
			continue;
		}
		const offset = pieceIndex * 2;
		props.push({
			id: `${idPrefix}-${pieceIndex}`,
			model: "wall",
			rect: axis === "x" ? rect(startX + offset, startZ, 2, 0.5) : rect(startX, startZ + offset, 0.5, 2),
			rotationDeg: axis === "x" ? 0 : 90,
			blocking: true,
		});
	}
	return props;
}

// Станция 1 x 1.
function createStation(id: string, kind: StationConfig["kind"], x: number, z: number, extra: Partial<StationConfig> = {}): StationConfig {
	return { id, kind, rect: rect(x, z, 1, 1), rotationDeg: 0, ...extra };
}

// Место за столом: прямоугольник стула и точки считаются от параметров.
function createSeat(chairRect: Rect, rotationDeg: Rotation, approachPoint: SeatConfig["approachPoint"], dishPoint: SeatConfig["dishPoint"]): SeatConfig {
	return {
		chairRect,
		chairModel: "chair_A",
		rotationDeg,
		approachPoint,
		sitPoint: { x: chairRect.x + chairRect.width / 2, z: chairRect.z + chairRect.depth / 2 },
		dishPoint,
		servePoint: approachPoint,
	};
}

// Три стола: два места слева сверху, четыре места в центре, два места справа сверху.
function createTables(): TableConfig[] {
	return [
		{
			id: "table-1",
			number: 1,
			rect: rect(10, 1.5, 1, 1),
			model: "table_round_A_small",
			rotationDeg: 0,
			seats: [
				createSeat(rect(9.5, 1.5, 0.5, 1), 90, { x: 9, z: 2 }, { x: 10.2, z: 2 }),
				createSeat(rect(11, 1.5, 0.5, 1), 270, { x: 12, z: 2 }, { x: 10.8, z: 2 }),
			],
		},
		{
			id: "table-2",
			number: 2,
			rect: rect(10, 4.5, 1.5, 1.5),
			model: "table_round_A",
			rotationDeg: 0,
			seats: [
				createSeat(rect(10.5, 4, 0.5, 0.5), 0, { x: 10.75, z: 3.5 }, { x: 10.75, z: 4.85 }),
				createSeat(rect(11.5, 5, 0.5, 0.5), 270, { x: 12.5, z: 5.25 }, { x: 11.15, z: 5.25 }),
				createSeat(rect(10.5, 6, 0.5, 0.5), 180, { x: 10.75, z: 7 }, { x: 10.75, z: 5.65 }),
				createSeat(rect(9.5, 5, 0.5, 0.5), 90, { x: 9, z: 5.25 }, { x: 10.35, z: 5.25 }),
			],
		},
		{
			id: "table-3",
			number: 3,
			rect: rect(14.5, 1.5, 1, 1),
			model: "table_round_A_small",
			rotationDeg: 0,
			seats: [
				createSeat(rect(14, 1.5, 0.5, 1), 90, { x: 13.5, z: 2 }, { x: 14.7, z: 2 }),
				createSeat(rect(15.5, 1.5, 0.5, 1), 270, { x: 16.5, z: 2 }, { x: 15.3, z: 2 }),
			],
		},
	];
}

// Станции кухни и окно выдачи.
function createStations(): StationConfig[] {
	return [
		// Северный ряд: ящики с ингредиентами.
		createStation("crate-steak", "crate", 1, 0.5, { ingredient: "steak" }),
		createStation("crate-bun", "crate", 2, 0.5, { ingredient: "bun" }),
		createStation("crate-ham", "crate", 3, 0.5, { ingredient: "ham" }),
		createStation("crate-potato", "crate", 4, 0.5, { ingredient: "potato" }),
		createStation("crate-carrot", "crate", 5, 0.5, { ingredient: "carrot" }),
		createStation("crate-onion", "crate", 6, 0.5, { ingredient: "onion" }),
		// Западная сторона: два прилавка и стопка тарелок.
		createStation("counter-1", "counter", 0.5, 2, { rotationDeg: 90 }),
		createStation("counter-2", "counter", 0.5, 3, { rotationDeg: 90 }),
		createStation("plates-1", "plateStack", 0.5, 5, { rotationDeg: 90 }),
		// Прилавок и раковина для воды.
		createStation("counter-pot", "counter", 0.5, 6.5, { rotationDeg: 90 }),
		createStation("tap-1", "tap", 6, 6.5, { rotationDeg: 270 }),
		// Остров: две разделочные доски.
		createStation("board-1", "cuttingBoard", 3, 4),
		createStation("board-2", "cuttingBoard", 4, 4),
		// Южный ряд: две плиты для жарки, плита с кастрюлей, духовка, урна.
		createStation("pan-1", "stove", 2, 7.5, { rotationDeg: 180 }),
		createStation("pan-2", "stove", 3, 7.5, { rotationDeg: 180 }),
		createStation("stove-1", "stove", 4, 7.5, { rotationDeg: 180, startItem: "pot" }),
		createStation("oven-1", "oven", 5, 7.5, { rotationDeg: 180 }),
		createStation("trash-1", "trash", 6, 7.5, { rotationDeg: 180 }),
		// Окно выдачи на разделяющей стене.
		{ id: "window-1", kind: "servingWindow", rect: rect(7, 2.5, 0.5, 2), rotationDeg: 90, model: "wall_orderwindow" },
	];
}

// Стены и дверной проём.
function createProps(): PropConfig[] {
	return [
		// Северная стена (9 кусков по 2).
		...createWallRun("wall-north", 0, 0, 9, "x"),
		// Западная и восточная стены.
		...createWallRun("wall-west", 0, 0.5, 4, "z"),
		...createWallRun("wall-east", 17.5, 0.5, 4, "z"),
		// Южная (передняя, низкая) стена: куски от 0 до 8, проём двери 8..10, куски от 10 до 18.
		...createWallRun("wall-south-left", 0, 8.5, 4, "x").map((piece) => ({ ...piece, heightScale: 0.25 })),
		...createWallRun("wall-south-right", 10, 8.5, 4, "x").map((piece) => ({ ...piece, heightScale: 0.25 })),
		{ id: "wall-south-door", model: "wall_doorway", rect: rect(8, 8.5, 2, 0.5), rotationDeg: 0, blocking: false, heightScale: 0.25 },
		// Разделяющая стена кухни и зала: стена, (окно выдачи это станция), проход, стена.
		{ id: "wall-divider-0", model: "wall", rect: rect(7, 0.5, 0.5, 2), rotationDeg: 90, blocking: true },
		{ id: "wall-divider-passage", model: "wall_doorway", rect: rect(7, 4.5, 0.5, 2), rotationDeg: 90, blocking: false },
		{ id: "wall-divider-3", model: "wall", rect: rect(7, 6.5, 0.5, 2), rotationDeg: 90, blocking: true },
	];
}

// Создаёт новый тестовый уровень. params: переопределение части параметров (глубокое слияние), overrides: замена полей уровня.
export function createTestLevel(paramsOverrides: DeepPartial<LevelParams> = {}, overrides: Partial<LevelConfig> = {}): LevelConfig {
	const level: LevelConfig = {
		id: "easy",
		bounds: rect(0, 0, 18, 14),
		view: rect(0, 0, 18, 14),
		floors: [
			{ rect: rect(0.5, 0.5, 6.5, 8), zone: "kitchen" },
			{ rect: rect(7.5, 0.5, 10, 8), zone: "hall" },
			{ rect: rect(0, 9, 18, 5), zone: "street" },
		],
		props: createProps(),
		colliders: [],
		stations: createStations(),
		window: {
			stationId: "window-1",
			dishPoints: [
				{ x: 7.25, z: 2.9 },
				{ x: 7.25, z: 3.5 },
				{ x: 7.25, z: 4.1 },
			],
			pickupPoint: { x: 8, z: 3.5 },
		},
		tables: createTables(),
		door: {
			rect: rect(8, 8.5, 2, 0.5),
			rotationDeg: 0,
			insidePoint: { x: 9, z: 8 },
			outsidePoint: { x: 9, z: 9.5 },
			spawnPoint: { x: 1.5, z: 11 },
			exitPoint: { x: 1, z: 12.5 },
		},
		queue: {
			slots: [
				{ index: 0, position: { x: 11.5, z: 9.9 } },
				{ index: 1, position: { x: 13.7, z: 9.9 } },
				{ index: 2, position: { x: 15.9, z: 9.9 } },
			],
			memberOffsets: [
				{ x: -0.825, z: 0 },
				{ x: -0.275, z: 0 },
				{ x: 0.275, z: 0 },
				{ x: 0.825, z: 0 },
			],
		},
		chefStart: { position: { x: 3.5, z: 2.75 }, facing: 0 },
		waiters: { waitPoints: [{ x: 8.25, z: 2 }] },
		params: createParams({ menu: ["burger", "ham", "veggieBurger", "stew"], ...paramsOverrides }),
		verifiedSeeds: [1, 2, 3],
	};
	return { ...level, ...overrides };
}
