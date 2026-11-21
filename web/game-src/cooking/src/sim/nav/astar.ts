// A* по сетке (задача 4.2): восемь соседей без срезания углов, эвристика octile. Работает с NavGridView и ничего не
// кэширует: состояние клеток читается в момент запроса. Владелец: SONNET-2 (geometry-control-nav). sim/ не импортирует DOM и three.
import type { NavGridView } from "../../contracts";

// Клетка сетки.
export interface Cell {
	col: number;
	row: number;
}

// Стоимость хода по диагонали в клетках (по прямой 1).
const DIAGONAL_COST = Math.SQRT2;

// Соседи: сначала прямые, затем диагонали (диагональ разрешена, только если обе соседние по прямой клетки свободны).
const NEIGHBORS: ReadonlyArray<{ dc: number; dr: number }> = [
	{ dc: 1, dr: 0 },
	{ dc: -1, dr: 0 },
	{ dc: 0, dr: 1 },
	{ dc: 0, dr: -1 },
	{ dc: 1, dr: 1 },
	{ dc: 1, dr: -1 },
	{ dc: -1, dr: 1 },
	{ dc: -1, dr: -1 },
];

// Эвристика octile: точная стоимость пути без препятствий на сетке с ходами 1 и корень из 2.
export function octileDistance(dc: number, dr: number): number {
	const absCols = Math.abs(dc);
	const absRows = Math.abs(dr);
	return Math.max(absCols, absRows) + (DIAGONAL_COST - 1) * Math.min(absCols, absRows);
}

// Элемент очереди с приоритетом.
interface HeapItem {
	index: number;
	f: number;
	g: number;
}

// Двоичная куча по возрастанию f; при равных f раньше идёт больший g (ближе к цели, меньше раскрытий).
class MinHeap {
	private readonly items: HeapItem[] = [];

	get size(): number {
		return this.items.length;
	}

	private isBefore(first: HeapItem, second: HeapItem): boolean {
		return first.f < second.f || (first.f === second.f && first.g > second.g);
	}

	push(item: HeapItem): void {
		const items = this.items;
		items.push(item);
		let position = items.length - 1;
		while (position > 0) {
			const parent = (position - 1) >> 1;
			if (!this.isBefore(items[position], items[parent])) {
				break;
			}
			[items[position], items[parent]] = [items[parent], items[position]];
			position = parent;
		}
	}

	pop(): HeapItem | undefined {
		const items = this.items;
		const top = items[0];
		const last = items.pop();
		if (items.length > 0 && last) {
			items[0] = last;
			let position = 0;
			for (;;) {
				const left = position * 2 + 1;
				const right = left + 1;
				let best = position;
				if (left < items.length && this.isBefore(items[left], items[best])) {
					best = left;
				}
				if (right < items.length && this.isBefore(items[right], items[best])) {
					best = right;
				}
				if (best === position) {
					break;
				}
				[items[position], items[best]] = [items[best], items[position]];
				position = best;
			}
		}
		return top;
	}
}

// Кратчайший путь по клеткам от start до goal (включая обе клетки) или null, если цель недостижима.
// Обе клетки должны быть свободны. Диагональный ход не срезает углы: обе боковые клетки должны быть свободны.
export function findCellPath(grid: NavGridView, start: Cell, goal: Cell): Cell[] | null {
	if (grid.isBlocked(start.col, start.row) || grid.isBlocked(goal.col, goal.row)) {
		return null;
	}
	if (start.col === goal.col && start.row === goal.row) {
		return [{ col: start.col, row: start.row }];
	}
	const cols = grid.cols;
	const total = cols * grid.rows;
	const bestCost = new Float64Array(total).fill(Infinity);
	const parent = new Int32Array(total).fill(-1);
	const closed = new Uint8Array(total);
	const startIndex = start.row * cols + start.col;
	const goalIndex = goal.row * cols + goal.col;
	bestCost[startIndex] = 0;
	const open = new MinHeap();
	open.push({ index: startIndex, g: 0, f: octileDistance(goal.col - start.col, goal.row - start.row) });

	while (open.size > 0) {
		const current = open.pop();
		if (!current || closed[current.index]) {
			continue;
		}
		if (current.index === goalIndex) {
			break;
		}
		closed[current.index] = 1;
		const col = current.index % cols;
		const row = (current.index - col) / cols;
		for (const { dc, dr } of NEIGHBORS) {
			const nextCol = col + dc;
			const nextRow = row + dr;
			if (grid.isBlocked(nextCol, nextRow)) {
				continue;
			}
			const isDiagonal = dc !== 0 && dr !== 0;
			if (isDiagonal && (grid.isBlocked(col + dc, row) || grid.isBlocked(col, row + dr))) {
				continue;
			}
			const nextIndex = nextRow * cols + nextCol;
			if (closed[nextIndex]) {
				continue;
			}
			const cost = current.g + (isDiagonal ? DIAGONAL_COST : 1);
			if (cost < bestCost[nextIndex]) {
				bestCost[nextIndex] = cost;
				parent[nextIndex] = current.index;
				open.push({ index: nextIndex, g: cost, f: cost + octileDistance(goal.col - nextCol, goal.row - nextRow) });
			}
		}
	}

	if (parent[goalIndex] < 0) {
		return null;
	}
	const path: Cell[] = [];
	for (let index = goalIndex; index >= 0; index = parent[index]) {
		path.push({ col: index % cols, row: Math.floor(index / cols) });
		if (index === startIndex) {
			break;
		}
	}
	return path.reverse();
}

// Стоимость пути по клеткам в клетках (прямой ход 1, диагональный корень из 2).
export function cellPathCost(path: readonly Cell[]): number {
	let cost = 0;
	for (let index = 1; index < path.length; index += 1) {
		const isDiagonal = path[index].col !== path[index - 1].col && path[index].row !== path[index - 1].row;
		cost += isDiagonal ? DIAGONAL_COST : 1;
	}
	return cost;
}
