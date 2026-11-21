// Мини-уровни для тестов геометрии, игрока, навигации и официантов. Не уровни игры (они лежат в config/levels).
// Владелец: SONNET-2 (geometry-control-nav). Общая полная фикстура всех областей: sim/testing/testLevel.ts (Opus-агент).
//
// createMiniLevel: маленький уровень 6 x 5 (прилавок, стол на два места, дверь). Данные для геометрии и движения верны;
// окно выдачи и очередь условные, validateLevelConfig мини-уровень не гарантирует.
// Схема клеток 0.5 (12 столбцов x 10 строк, # - препятствие, . - свободно), её проверяет тест геометрии:
//   ############   строка 0: северная стена
//   #..........#
//   #.##.......#   прилавок counter-1 (1, 1, 1, 1)
//   #.##.......#
//   #..........#
//   #.....####.#   стул, стол (3.5, 2.5, 1, 1), стул
//   #.....####.#
//   #..........#
//   #..........#
//   #####..#####   южная стена: кусок проёма wall_doorway (x 2..4) со стойками по бокам и проёмом 1 по центру (x 2.5..3.5)
//
// createBlankLevel: пустой уровень с заданными препятствиями (colliders) и станциями: для тестов, где нужна своя топология.
import type { LevelConfig, LevelParams, Rect, StationConfig, Vec2 } from "../../contracts";
import { createParams, type DeepPartial } from "../../config/levels/defaults";

// Прямоугольник по четырём числам.
function rect(x: number, z: number, width: number, depth: number): Rect {
	return { x, z, width, depth };
}

// Мини-уровень 6 x 5 с прилавком, столом на два места и дверью. paramsOverrides: переопределение параметров.
export function createMiniLevel(paramsOverrides: DeepPartial<LevelParams> = {}): LevelConfig {
	return {
		id: "easy",
		bounds: rect(0, 0, 6, 5),
		view: rect(0, 0, 6, 5),
		floors: [{ rect: rect(0.5, 0.5, 5, 4), zone: "hall" }],
		props: [
			{ id: "wall-north", model: "wall", rect: rect(0, 0, 6, 0.5), rotationDeg: 0, blocking: true },
			{ id: "wall-west", model: "wall", rect: rect(0, 0.5, 0.5, 4), rotationDeg: 90, blocking: true },
			{ id: "wall-east", model: "wall", rect: rect(5.5, 0.5, 0.5, 4), rotationDeg: 90, blocking: true },
			{ id: "wall-south-left", model: "wall", rect: rect(0, 4.5, 2, 0.5), rotationDeg: 0, blocking: true },
			{ id: "wall-south-right", model: "wall", rect: rect(4, 4.5, 2, 0.5), rotationDeg: 0, blocking: true },
			{ id: "wall-south-door", model: "wall_doorway", rect: rect(2, 4.5, 2, 0.5), rotationDeg: 0, blocking: false },
		],
		colliders: [],
		stations: [
			{ id: "counter-1", kind: "counter", rect: rect(1, 1, 1, 1), rotationDeg: 0 },
		],
		window: { stationId: "counter-1", dishPoints: [{ x: 1.5, z: 1.5 }], pickupPoint: { x: 1.5, z: 2.75 } },
		tables: [
			{
				id: "table-1",
				number: 1,
				rect: rect(3.5, 2.5, 1, 1),
				model: "table_round_A_small",
				rotationDeg: 0,
				seats: [
					{
						chairRect: rect(3, 2.5, 0.5, 1),
						chairModel: "chair_A",
						rotationDeg: 90,
						approachPoint: { x: 2.5, z: 3 },
						sitPoint: { x: 3.25, z: 3 },
						dishPoint: { x: 3.7, z: 3 },
						servePoint: { x: 2.5, z: 3 },
					},
					{
						chairRect: rect(4.5, 2.5, 0.5, 1),
						chairModel: "chair_A",
						rotationDeg: 270,
						approachPoint: { x: 5.25, z: 3 },
						sitPoint: { x: 4.75, z: 3 },
						dishPoint: { x: 4.3, z: 3 },
						servePoint: { x: 5.25, z: 3 },
					},
				],
			},
		],
		door: {
			// Проём: середина куска wall_doorway (стойки по бокам, их даёт геометрия).
			rect: rect(2.5, 4.5, 1, 0.5),
			rotationDeg: 0,
			insidePoint: { x: 3, z: 4 },
			outsidePoint: { x: 3, z: 4.75 },
			spawnPoint: { x: 3, z: 4.75 },
			exitPoint: { x: 3, z: 4.75 },
		},
		// Очереди нет (улицы в мини-уровне нет), смещения оставлены для полноты данных.
		queue: {
			slots: [],
			memberOffsets: [
				{ x: -0.825, z: 0 },
				{ x: -0.275, z: 0 },
				{ x: 0.275, z: 0 },
				{ x: 0.825, z: 0 },
			],
		},
		chefStart: { position: { x: 3, z: 1.5 }, facing: 4 },
		waiters: { waitPoints: [{ x: 1.5, z: 2.75 }] },
		params: createParams({ menu: ["burger", "ham"], ...paramsOverrides }),
		verifiedSeeds: [1],
	};
}

// Параметры пустого уровня.
export interface BlankLevelOptions {
	// Граница мира (по умолчанию 10 x 10 с углом в нуле).
	bounds?: Rect;
	// Препятствия без модели (невидимые, блокируют движение и навигацию).
	colliders?: Rect[];
	// Станции (тоже препятствия).
	stations?: StationConfig[];
	// Стартовая точка повара.
	chefStart?: Vec2;
	paramsOverrides?: DeepPartial<LevelParams>;
}

// Пустой уровень для тестов с собственной топологией: только граница мира, препятствия и станции. Остальное (окно, дверь,
// столы, очередь) минимально и не проверяется validateLevelConfig.
export function createBlankLevel(options: BlankLevelOptions = {}): LevelConfig {
	const bounds = options.bounds ?? rect(0, 0, 10, 10);
	const start = options.chefStart ?? { x: bounds.x + 1, z: bounds.z + 1 };
	return {
		id: "easy",
		bounds,
		view: bounds,
		floors: [],
		props: [],
		colliders: options.colliders ?? [],
		stations: options.stations ?? [],
		window: { stationId: "none", dishPoints: [start], pickupPoint: start },
		tables: [],
		door: { rect: rect(bounds.x, bounds.z, 0.5, 0.5), rotationDeg: 0, insidePoint: start, outsidePoint: start, spawnPoint: start, exitPoint: start },
		queue: { slots: [], memberOffsets: [] },
		chefStart: { position: start, facing: 0 },
		waiters: { waitPoints: [start] },
		params: createParams({ menu: ["burger", "ham"], ...(options.paramsOverrides ?? {}) }),
		verifiedSeeds: [1],
	};
}
