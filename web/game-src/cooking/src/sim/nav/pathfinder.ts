// Поиск пути (задачи 4.1, 4.2): привязка точек к свободным клеткам, A* по клеткам, сглаживание по линии видимости.
// Реализует Pathfinder из contracts.ts. Владелец: SONNET-2 (geometry-control-nav).
import type { NavGridView, Pathfinder, Vec2 } from "../../contracts";
import { findCellPath, type Cell } from "./astar";

// Допуск линии видимости: отрезок, касающийся границы клетки, считается задевающим и соседнюю клетку (запас в пользу безопасности).
const LINE_EPSILON = 1e-6;

// Расстояние между точками меньше этого значения считается совпадением.
const SAME_POINT_DISTANCE = 1e-9;

// На сколько клеток от точки ищется свободная клетка, если сама точка в заблокированной.
const MAX_SNAP_RING = 8;

function distanceBetween(first: Vec2, second: Vec2): number {
	return Math.hypot(first.x - second.x, first.z - second.z);
}

// Проходит ли отрезок только по свободным клеткам: проверяются все клетки, которых он касается (и по границам тоже).
export function hasLineOfSight(grid: NavGridView, from: Vec2, to: Vec2): boolean {
	const cellSize = grid.cellSize;
	const fromU = (from.x - grid.originX) / cellSize;
	const fromV = (from.z - grid.originZ) / cellSize;
	const toU = (to.x - grid.originX) / cellSize;
	const toV = (to.z - grid.originZ) / cellSize;
	const minU = Math.min(fromU, toU);
	const maxU = Math.max(fromU, toU);
	const deltaU = toU - fromU;
	const deltaV = toV - fromV;
	const firstCol = Math.floor(minU - LINE_EPSILON);
	const lastCol = Math.floor(maxU + LINE_EPSILON);
	for (let col = firstCol; col <= lastCol; col += 1) {
		// Часть отрезка внутри полосы столбца col: диапазон по v.
		const stripStart = Math.max(minU, col);
		const stripEnd = Math.min(maxU, col + 1);
		let startV = fromV;
		let endV = toV;
		if (Math.abs(deltaU) > 1e-12) {
			startV = fromV + (deltaV * (stripStart - fromU)) / deltaU;
			endV = fromV + (deltaV * (stripEnd - fromU)) / deltaU;
		}
		const firstRow = Math.floor(Math.min(startV, endV) - LINE_EPSILON);
		const lastRow = Math.floor(Math.max(startV, endV) + LINE_EPSILON);
		for (let row = firstRow; row <= lastRow; row += 1) {
			if (grid.isBlocked(col, row)) {
				return false;
			}
		}
	}
	return true;
}

// Ближайшая к точке свободная клетка (по расстоянию до центра клетки) в пределах MAX_SNAP_RING колец или null.
export function findNearestFreeCell(grid: NavGridView, point: Vec2): Cell | null {
	const origin = grid.worldToCell(point);
	let best: Cell | null = null;
	let bestDistance = Infinity;
	let foundRing = -1;
	for (let ring = 0; ring <= MAX_SNAP_RING; ring += 1) {
		// Кольцо ring+1 ещё может содержать клетку ближе найденной на кольце ring (расстояние до центра не равно номеру кольца).
		if (foundRing >= 0 && ring > foundRing + 1) {
			break;
		}
		for (let row = origin.row - ring; row <= origin.row + ring; row += 1) {
			for (let col = origin.col - ring; col <= origin.col + ring; col += 1) {
				const onRing = Math.max(Math.abs(col - origin.col), Math.abs(row - origin.row)) === ring;
				if (!onRing || grid.isBlocked(col, row)) {
					continue;
				}
				const distance = distanceBetween(point, grid.cellToWorld(col, row));
				if (distance < bestDistance) {
					bestDistance = distance;
					best = { col, row };
					if (foundRing < 0) {
						foundRing = ring;
					}
				}
			}
		}
	}
	return best;
}

// Маршрут: точки от начала (включительно) до цели; startSnapped: начало пришлось сдвинуть в свободную клетку (тогда первая
// точка это центр этой клетки, и в путь она входит), startOffset: на сколько начало сдвинуто.
interface Route {
	points: Vec2[];
	startSnapped: boolean;
	startOffset: number;
}

// Сглаживание: жадно соединяет самые дальние точки, между которыми есть линия видимости.
function smoothPoints(grid: NavGridView, points: readonly Vec2[]): Vec2[] {
	if (points.length <= 2) {
		return [...points];
	}
	const result: Vec2[] = [points[0]];
	let anchor = 0;
	while (anchor < points.length - 1) {
		let next = points.length - 1;
		while (next > anchor + 1 && !hasLineOfSight(grid, points[anchor], points[next])) {
			next -= 1;
		}
		result.push(points[next]);
		anchor = next;
	}
	return result;
}

// Создаёт поисковик пути по навигационной сетке. Сетка читается при каждом запросе (изменения клеток видны сразу).
export function createPathfinder(grid: NavGridView): Pathfinder {
	function planRoute(from: Vec2, to: Vec2): Route | null {
		const fromCell = grid.worldToCell(from);
		const toCell = grid.worldToCell(to);
		const fromBlocked = grid.isBlocked(fromCell.col, fromCell.row);
		const toBlocked = grid.isBlocked(toCell.col, toCell.row);
		const startCell = fromBlocked ? findNearestFreeCell(grid, from) : fromCell;
		const goalCell = toBlocked ? findNearestFreeCell(grid, to) : toCell;
		if (!startCell || !goalCell) {
			return null;
		}
		// Начало и цель в заблокированной клетке смещаются к центру ближайшей свободной, иначе остаются точными.
		const startPoint = fromBlocked ? grid.cellToWorld(startCell.col, startCell.row) : from;
		const goalPoint = toBlocked ? grid.cellToWorld(goalCell.col, goalCell.row) : to;
		const cells = findCellPath(grid, startCell, goalCell);
		if (!cells) {
			return null;
		}
		// Ломаная: точное начало, центры промежуточных клеток, точная цель. Первый и последний шаги лежат внутри
		// клеток, не срезающих углы, поэтому ломаная всегда проходит по свободным клеткам.
		const points: Vec2[] = [startPoint];
		for (let index = 1; index < cells.length - 1; index += 1) {
			points.push(grid.cellToWorld(cells[index].col, cells[index].row));
		}
		points.push(goalPoint);
		return { points: smoothPoints(grid, points), startSnapped: fromBlocked, startOffset: fromBlocked ? distanceBetween(from, startPoint) : 0 };
	}

	return {
		findPath(from: Vec2, to: Vec2): Vec2[] | null {
			if (distanceBetween(from, to) < SAME_POINT_DISTANCE) {
				return [];
			}
			const route = planRoute(from, to);
			if (!route) {
				return null;
			}
			// Начало, смещённое в свободную клетку, остаётся первой точкой пути: туда агенту надо вернуться из препятствия.
			return route.points.slice(route.startSnapped ? 0 : 1).map((point) => ({ x: point.x, z: point.z }));
		},
		pathLength(from: Vec2, to: Vec2): number | null {
			if (distanceBetween(from, to) < SAME_POINT_DISTANCE) {
				return 0;
			}
			const route = planRoute(from, to);
			if (!route) {
				return null;
			}
			let length = route.startOffset;
			for (let index = 1; index < route.points.length; index += 1) {
				length += distanceBetween(route.points[index - 1], route.points[index]);
			}
			return length;
		},
	};
}
