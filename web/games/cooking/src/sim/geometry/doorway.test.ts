// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EMPTY_INPUT, SIM_STEP_SEC, type LevelConfig, type PropConfig, type Rect } from "../../contracts";
import { createPlayer } from "../player";
import { createPathfinder } from "../nav/pathfinder";
import { createTestLevel } from "../testing/testLevel";
import { buildGeometry } from "./index";
import { collectDoorwayJambs, DOORWAY_OPENING_WIDTH } from "./doorway";
import { createBlankLevel, createMiniLevel } from "./miniLevel";

// Прямоугольник по четырём числам.
function rect(x: number, z: number, width: number, depth: number): Rect {
	return { x, z, width, depth };
}

// Уровень с одним куском проёма и без другой обстановки.
function levelWithProps(props: PropConfig[]): LevelConfig {
	return { ...createBlankLevel({ bounds: rect(0, 0, 10, 10) }), props };
}

describe("стойки проёма wall_doorway", () => {
	it("кусок вдоль x: проём шириной 1 по центру, стойки по 0.5 по бокам", () => {
		const level = levelWithProps([{ id: "door", model: "wall_doorway", rect: rect(10, 8.5, 2, 0.5), rotationDeg: 0, blocking: false }]);
		expect(DOORWAY_OPENING_WIDTH).toBe(1);
		expect(collectDoorwayJambs(level)).toEqual([rect(10, 8.5, 0.5, 0.5), rect(11.5, 8.5, 0.5, 0.5)]);
	});

	it("кусок вдоль z (разделяющая стена): стойки сверху и снизу", () => {
		const level = levelWithProps([{ id: "passage", model: "wall_doorway", rect: rect(7, 4.5, 0.5, 2), rotationDeg: 90, blocking: false }]);
		expect(collectDoorwayJambs(level)).toEqual([rect(7, 4.5, 0.5, 0.5), rect(7, 6, 0.5, 0.5)]);
	});

	it("блокирующий кусок, другие модели и кусок не длиннее проёма стоек не получают", () => {
		const level = levelWithProps([
			{ id: "wall", model: "wall_doorway", rect: rect(0, 0, 2, 0.5), rotationDeg: 0, blocking: true },
			{ id: "decor", model: "table_round_A", rect: rect(4, 4, 2, 0.5), rotationDeg: 0, blocking: false },
			{ id: "hidden", model: null, rect: rect(6, 6, 2, 0.5), rotationDeg: 0, blocking: false },
			{ id: "narrow", model: "wall_doorway", rect: rect(8, 8, 1, 0.5), rotationDeg: 0, blocking: false },
		]);
		expect(collectDoorwayJambs(level)).toEqual([]);
	});

	it("геометрия мини-уровня: стойки заблокированы, проём в две клетки свободен и в сетке коллизий, и в навигационной", () => {
		const geometry = buildGeometry(createMiniLevel());
		for (const grid of [geometry.collisionGrid, geometry.navGrid]) {
			expect(grid.isBlocked(4, 9)).toBe(true);
			expect(grid.isBlocked(5, 9)).toBe(false);
			expect(grid.isBlocked(6, 9)).toBe(false);
			expect(grid.isBlocked(7, 9)).toBe(true);
		}
		// Проём двери (door.rect) не пересекается ни с одним препятствием.
		const opening = geometry.level.door.rect;
		expect(geometry.obstacles.some((obstacle) => obstacle.x < opening.x + opening.width && opening.x < obstacle.x + obstacle.width && obstacle.z < opening.z + opening.depth && opening.z < obstacle.z + obstacle.depth)).toBe(false);
	});

	it("повар не заходит в стойку, но проходит в проём", () => {
		const level = createMiniLevel();
		const geometry = buildGeometry(level);
		// Против стойки (x 2..2.5): упирается в неё.
		const blocked = createPlayer({ level: { ...level, chefStart: { position: { x: 2.25, z: 4 }, facing: 4 } }, geometry });
		for (let step = 0; step < 120; step += 1) {
			blocked.step({ ...EMPTY_INPUT, moveVector: { x: 0, z: 1 } }, SIM_STEP_SEC);
		}
		expect(blocked.state.position.z).toBeCloseTo(4.5 - level.params.player.radius, 6);
		// По оси проёма (x 3): проходит до границы мира.
		const passing = createPlayer({ level: { ...level, chefStart: { position: { x: 3, z: 4 }, facing: 4 } }, geometry });
		for (let step = 0; step < 120; step += 1) {
			passing.step({ ...EMPTY_INPUT, moveVector: { x: 0, z: 1 } }, SIM_STEP_SEC);
		}
		expect(passing.state.position.z).toBeCloseTo(5 - level.params.player.radius, 6);
	});

	it("путь с улицы в зал на тестовом уровне проходит только через проём: в полосе стены x лежит между стойками", () => {
		const level = createTestLevel();
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		const door = level.props.find((prop) => prop.id === "wall-south-door");
		expect(door).toBeDefined();
		const band = door?.rect ?? rect(0, 0, 0, 0);
		const openingMin = band.x + (band.width - DOORWAY_OPENING_WIDTH) / 2;
		const openingMax = openingMin + DOORWAY_OPENING_WIDTH;
		const from = level.door.spawnPoint;
		for (const seat of level.tables.flatMap((table) => table.seats)) {
			const path = pathfinder.findPath(from, seat.approachPoint) ?? [];
			expect(path.length).toBeGreaterThan(0);
			let previous = from;
			for (const point of path) {
				const samples = Math.max(2, Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / 0.02));
				for (let index = 0; index <= samples; index += 1) {
					const sample = { x: previous.x + ((point.x - previous.x) * index) / samples, z: previous.z + ((point.z - previous.z) * index) / samples };
					if (sample.z > band.z && sample.z < band.z + band.depth) {
						expect(sample.x).toBeGreaterThanOrEqual(openingMin - 1e-9);
						expect(sample.x).toBeLessThanOrEqual(openingMax + 1e-9);
					}
				}
				previous = point;
			}
		}
	});
});
