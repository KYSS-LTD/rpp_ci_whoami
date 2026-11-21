// Сетки уровня: сетка коллизий (без раздувания) и навигационная сетка (препятствия раздуты на радиус агента).
// Обе имеют клетку GRID_STEP и покрывают только LevelConfig.bounds, клетки вне сетки считаются заблокированными.
// Владелец: SONNET-2 (geometry-control-nav). sim/ не импортирует three и DOM.
import { GRID_STEP, type NavGridView, type Rect, type Vec2 } from "../../contracts";
import { distancePointToRect } from "../../common/math";

// Допуск сравнения вещественных чисел при растеризации прямоугольников.
const EPSILON = 1e-9;

// Реализация взгляда на сетку: плоский массив флагов "клетка заблокирована".
class GridView implements NavGridView {
	readonly originX: number;
	readonly originZ: number;
	readonly cellSize: number;
	readonly cols: number;
	readonly rows: number;
	private readonly blocked: Uint8Array;

	constructor(bounds: Rect, cellSize: number) {
		this.originX = bounds.x;
		this.originZ = bounds.z;
		this.cellSize = cellSize;
		this.cols = Math.max(0, Math.ceil(bounds.width / cellSize - EPSILON));
		this.rows = Math.max(0, Math.ceil(bounds.depth / cellSize - EPSILON));
		this.blocked = new Uint8Array(this.cols * this.rows);
	}

	// Помечает клетку заблокированной (только для построения, наружу интерфейс этого не отдаёт).
	markBlocked(col: number, row: number): void {
		if (col >= 0 && row >= 0 && col < this.cols && row < this.rows) {
			this.blocked[row * this.cols + col] = 1;
		}
	}

	isBlocked(col: number, row: number): boolean {
		if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
			return true;
		}
		return this.blocked[row * this.cols + col] === 1;
	}

	worldToCell(point: Vec2): { col: number; row: number } {
		return {
			col: Math.floor((point.x - this.originX) / this.cellSize),
			row: Math.floor((point.z - this.originZ) / this.cellSize),
		};
	}

	cellToWorld(col: number, row: number): Vec2 {
		return {
			x: this.originX + (col + 0.5) * this.cellSize,
			z: this.originZ + (row + 0.5) * this.cellSize,
		};
	}
}

// Диапазон клеток [firstCol..lastCol] x [firstRow..lastRow], которые затрагивает прямоугольник, увеличенный на margin.
function cellRangeOf(grid: GridView, rect: Rect, margin: number): { firstCol: number; lastCol: number; firstRow: number; lastRow: number } {
	const firstCol = Math.floor((rect.x - margin - grid.originX) / grid.cellSize);
	const lastCol = Math.ceil((rect.x + rect.width + margin - grid.originX) / grid.cellSize) - 1;
	const firstRow = Math.floor((rect.z - margin - grid.originZ) / grid.cellSize);
	const lastRow = Math.ceil((rect.z + rect.depth + margin - grid.originZ) / grid.cellSize) - 1;
	return {
		firstCol: Math.max(0, firstCol),
		lastCol: Math.min(grid.cols - 1, lastCol),
		firstRow: Math.max(0, firstRow),
		lastRow: Math.min(grid.rows - 1, lastRow),
	};
}

// Сетка коллизий: клетка заблокирована, если пересекается с препятствием по площади (касание сторонами не считается).
export function buildCollisionGrid(bounds: Rect, obstacles: readonly Rect[]): NavGridView {
	const grid = new GridView(bounds, GRID_STEP);
	for (const obstacle of obstacles) {
		const range = cellRangeOf(grid, obstacle, 0);
		for (let row = range.firstRow; row <= range.lastRow; row += 1) {
			for (let col = range.firstCol; col <= range.lastCol; col += 1) {
				const cellMinX = grid.originX + col * grid.cellSize;
				const cellMinZ = grid.originZ + row * grid.cellSize;
				const overlapX = cellMinX < obstacle.x + obstacle.width - EPSILON && obstacle.x < cellMinX + grid.cellSize - EPSILON;
				const overlapZ = cellMinZ < obstacle.z + obstacle.depth - EPSILON && obstacle.z < cellMinZ + grid.cellSize - EPSILON;
				if (overlapX && overlapZ) {
					grid.markBlocked(col, row);
				}
			}
		}
	}
	return grid;
}

// Навигационная сетка: клетка заблокирована, если расстояние от её центра до препятствия меньше agentRadius
// (или центр лежит строго внутри препятствия). При agentRadius = GRID_STEP / 2 совпадает с сеткой коллизий.
export function buildNavGrid(bounds: Rect, obstacles: readonly Rect[], agentRadius: number): NavGridView {
	const grid = new GridView(bounds, GRID_STEP);
	for (const obstacle of obstacles) {
		const range = cellRangeOf(grid, obstacle, agentRadius);
		for (let row = range.firstRow; row <= range.lastRow; row += 1) {
			for (let col = range.firstCol; col <= range.lastCol; col += 1) {
				const center = grid.cellToWorld(col, row);
				const distance = distancePointToRect(center, obstacle);
				const insideStrictly =
					center.x > obstacle.x + EPSILON &&
					center.x < obstacle.x + obstacle.width - EPSILON &&
					center.z > obstacle.z + EPSILON &&
					center.z < obstacle.z + obstacle.depth - EPSILON;
				if (distance < agentRadius - EPSILON || insideStrictly) {
					grid.markBlocked(col, row);
				}
			}
		}
	}
	return grid;
}
