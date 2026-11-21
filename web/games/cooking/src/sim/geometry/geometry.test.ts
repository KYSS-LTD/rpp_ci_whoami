// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LevelConfig, NavGridView, Rect } from "../../contracts";
import { rectsOverlap } from "../../common/math";
import { createTestLevel } from "../testing/testLevel";
import { buildGeometry } from "./index";
import { buildCollisionGrid, buildNavGrid } from "./grid";
import { createBlankLevel, createMiniLevel } from "./miniLevel";

// Ожидаемая карта мини-уровня (# - препятствие), строка - ряд клеток сверху вниз.
const MINI_LEVEL_MAP = [
	"############",
	"#..........#",
	"#.##.......#",
	"#.##.......#",
	"#..........#",
	"#.....####.#",
	"#.....####.#",
	"#..........#",
	"#..........#",
	"#####..#####",
];

// Рисует сетку так же, как MINI_LEVEL_MAP.
function drawGrid(grid: NavGridView): string[] {
	const lines: string[] = [];
	for (let row = 0; row < grid.rows; row += 1) {
		let line = "";
		for (let col = 0; col < grid.cols; col += 1) {
			line += grid.isBlocked(col, row) ? "#" : ".";
		}
		lines.push(line);
	}
	return lines;
}

// Независимая проверка по определению: клетка заблокирована, если пересекается с препятствием по площади.
function bruteForceBlocked(grid: NavGridView, obstacles: readonly Rect[], col: number, row: number): boolean {
	const cell: Rect = { x: grid.originX + col * grid.cellSize, z: grid.originZ + row * grid.cellSize, width: grid.cellSize, depth: grid.cellSize };
	return obstacles.some((obstacle) => rectsOverlap(cell, obstacle));
}

describe("геометрия уровня: сетки", () => {
	it("клетки под мебелью заблокированы, остальные свободны (мини-уровень)", () => {
		const geometry = buildGeometry(createMiniLevel());
		expect(geometry.collisionGrid.cols).toBe(12);
		expect(geometry.collisionGrid.rows).toBe(10);
		expect(drawGrid(geometry.collisionGrid)).toEqual(MINI_LEVEL_MAP);
	});

	it("каждая клетка сетки коллизий совпадает с определением пересечения (мини-уровень и тестовый уровень)", () => {
		const levels: LevelConfig[] = [createMiniLevel(), createTestLevel()];
		for (const level of levels) {
			const geometry = buildGeometry(level);
			for (let row = 0; row < geometry.collisionGrid.rows; row += 1) {
				for (let col = 0; col < geometry.collisionGrid.cols; col += 1) {
					expect(geometry.collisionGrid.isBlocked(col, row), `клетка ${col},${row}`).toBe(bruteForceBlocked(geometry.collisionGrid, geometry.obstacles, col, row));
				}
			}
		}
	});

	it("при радиусе агента 0.25 навигационная сетка совпадает с сеткой коллизий", () => {
		const geometry = buildGeometry(createMiniLevel());
		expect(geometry.level.params.nav.agentRadius).toBe(0.25);
		expect(drawGrid(geometry.navGrid)).toEqual(drawGrid(geometry.collisionGrid));
		const testGeometry = buildGeometry(createTestLevel());
		expect(drawGrid(testGeometry.navGrid)).toEqual(drawGrid(testGeometry.collisionGrid));
	});

	it("препятствия: блокирующие props, станции, столы, стулья и стойки проёма; сам проём двери не входит", () => {
		const level = createMiniLevel();
		const geometry = buildGeometry(level);
		const doorWay = level.door.rect;
		expect(geometry.obstacles).toContainEqual(level.stations[0].rect);
		expect(geometry.obstacles).toContainEqual(level.tables[0].rect);
		expect(geometry.obstacles).toContainEqual(level.tables[0].seats[0].chairRect);
		expect(geometry.obstacles).toContainEqual(level.tables[0].seats[1].chairRect);
		expect(geometry.obstacles.some((obstacle) => rectsOverlap(obstacle, doorWay))).toBe(false);
		// Блокирующих props 5, станция 1, стол 1, стульев 2, стойки проёма 2.
		expect(geometry.obstacles).toHaveLength(11);
	});

	it("коллайдеры без модели блокируют так же, как мебель", () => {
		const collider: Rect = { x: 2, z: 2, width: 1, depth: 0.5 };
		const geometry = buildGeometry(createBlankLevel({ bounds: { x: 0, z: 0, width: 5, depth: 5 }, colliders: [collider] }));
		expect(geometry.obstacles).toEqual([collider]);
		expect(geometry.collisionGrid.isBlocked(4, 4)).toBe(true);
		expect(geometry.collisionGrid.isBlocked(5, 4)).toBe(true);
		expect(geometry.collisionGrid.isBlocked(6, 4)).toBe(false);
		expect(geometry.collisionGrid.isBlocked(4, 5)).toBe(false);
	});

	it("клетки вне сетки и вне границы мира считаются заблокированными", () => {
		const grid = buildGeometry(createMiniLevel()).navGrid;
		expect(grid.isBlocked(-1, 3)).toBe(true);
		expect(grid.isBlocked(3, -1)).toBe(true);
		expect(grid.isBlocked(grid.cols, 3)).toBe(true);
		expect(grid.isBlocked(3, grid.rows)).toBe(true);
		expect(grid.isBlocked(1.5, 3)).toBe(true);
		expect(grid.isBlocked(1, 1)).toBe(false);
	});

	it("worldToCell и cellToWorld взаимно обратны, сетка привязана к углу bounds", () => {
		const level = createBlankLevel({ bounds: { x: -2, z: 1, width: 4, depth: 3 } });
		const grid = buildGeometry(level).collisionGrid;
		expect(grid.originX).toBe(-2);
		expect(grid.originZ).toBe(1);
		expect(grid.cellSize).toBe(0.5);
		expect(grid.cols).toBe(8);
		expect(grid.rows).toBe(6);
		expect(grid.worldToCell({ x: -2, z: 1 })).toEqual({ col: 0, row: 0 });
		expect(grid.worldToCell({ x: 1.99, z: 3.99 })).toEqual({ col: 7, row: 5 });
		expect(grid.worldToCell({ x: -2.01, z: 0.5 })).toEqual({ col: -1, row: -1 });
		expect(grid.cellToWorld(0, 0)).toEqual({ x: -1.75, z: 1.25 });
		for (let col = 0; col < grid.cols; col += 1) {
			for (let row = 0; row < grid.rows; row += 1) {
				expect(grid.worldToCell(grid.cellToWorld(col, row))).toEqual({ col, row });
			}
		}
	});
});

describe("геометрия уровня: раздувание навигационной сетки", () => {
	const bounds: Rect = { x: 0, z: 0, width: 4, depth: 4 };
	// Одна клетка препятствия в центре (клетка 4,4 при 8 x 8 клеток).
	const obstacle: Rect = { x: 2, z: 2, width: 0.5, depth: 0.5 };

	it("радиус 0.5 блокирует кольцо из восьми соседей препятствия", () => {
		const grid = buildNavGrid(bounds, [obstacle], 0.5);
		const blocked: string[] = [];
		for (let row = 0; row < grid.rows; row += 1) {
			for (let col = 0; col < grid.cols; col += 1) {
				if (grid.isBlocked(col, row)) {
					blocked.push(`${col},${row}`);
				}
			}
		}
		expect(blocked.sort()).toEqual(["3,3", "3,4", "3,5", "4,3", "4,4", "4,5", "5,3", "5,4", "5,5"].sort());
	});

	it("радиус 0.8 раздувает скруглённо: два соседа по прямой, без углов 5 x 5", () => {
		const grid = buildNavGrid(bounds, [obstacle], 0.8);
		// Прямо: две клетки с каждой стороны, диагональ (2,1) заблокирована, дальний угол (2,2) свободен.
		expect(grid.isBlocked(2, 4)).toBe(true);
		expect(grid.isBlocked(6, 4)).toBe(true);
		expect(grid.isBlocked(6, 5)).toBe(true);
		expect(grid.isBlocked(6, 6)).toBe(false);
		expect(grid.isBlocked(2, 2)).toBe(false);
		expect(grid.isBlocked(1, 4)).toBe(false);
	});

	it("сетка коллизий не раздувается, раздувание есть только у навигационной сетки", () => {
		const collision = buildCollisionGrid(bounds, [obstacle]);
		expect(collision.isBlocked(4, 4)).toBe(true);
		expect(collision.isBlocked(3, 4)).toBe(false);
		expect(collision.isBlocked(5, 5)).toBe(false);
	});

	it("радиус из параметров уровня определяет раздувание в buildGeometry", () => {
		const level = createBlankLevel({ bounds, colliders: [obstacle], paramsOverrides: { nav: { agentRadius: 0.5 } } });
		const geometry = buildGeometry(level);
		expect(geometry.collisionGrid.isBlocked(3, 3)).toBe(false);
		expect(geometry.navGrid.isBlocked(3, 3)).toBe(true);
	});

	it("препятствие у края мира и за краем не ломает сетку", () => {
		const grid = buildNavGrid(bounds, [{ x: 3.5, z: 0, width: 0.5, depth: 0.5 }], 0.5);
		expect(grid.isBlocked(7, 0)).toBe(true);
		expect(grid.isBlocked(6, 1)).toBe(true);
		expect(grid.isBlocked(5, 0)).toBe(false);
	});
});
