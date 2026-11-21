// Навигация эталонного бота по кухне: свой поиск пути A* по мелкой сетке (шаг 0.25) с запасом на радиус повара и расчёт
// рабочих точек у станций (где встать и куда смотреть, чтобы целью стала нужная станция). Нужна боту, потому что повар это
// круг радиуса 0.3, а сетка NPC (шаг 0.5, радиус 0.25) для него грубовата. Владелец: Opus-агент. Только для тестов и калибровки.
import { type Facing8, type LevelConfig, type LevelGeometry, type Rect, type StationId, type Vec2 } from "../contracts";
import { maxPenetration, type CollisionWorld } from "../sim/geometry/collision";
import { pickTarget, probePoint } from "../sim/player/target";

// Шаг сетки бота, мировые единицы.
const GRID_STEP = 0.25;

// Запас от препятствий при построении сетки проходимых клеток сверх радиуса повара.
const GRID_MARGIN = 0.02;

// Запас при проверке линии видимости (меньше сеточного: сглаживание может срезать углы, но не вдавливаться в стены).
const LINE_MARGIN = 0.01;

// Расстояние между проверками точек на отрезке при сглаживании.
const LINE_SAMPLE_STEP = 0.08;

// Зазор между телом повара и станцией на рабочей точке.
const SPOT_GAP = 0.03;

// Сколько клеток вокруг точки перебирать, ища ближайшую проходимую клетку.
const NEAREST_SEARCH_RING = 8;

// Рабочая точка: где встать и куда смотреть.
export interface WorkSpot {
	stationId: StationId;
	position: Vec2;
	facing: Facing8;
}

// Навигатор повара.
export interface ChefNavigator {
	// Путь от from к to: точки без начальной, последняя равна to. null, если пути нет.
	findPath(from: Vec2, to: Vec2): Vec2[] | null;
	// Длина пути или null.
	pathLength(from: Vec2, to: Vec2): number | null;
	// Рабочие точки станции от лучшей к худшей (список не пуст на корректном уровне).
	getWorkSpots(stationId: StationId): WorkSpot[];
	// Проходима ли точка для повара.
	isWalkable(point: Vec2): boolean;
}

// Простая двоичная куча по ключу для открытого списка A*.
class MinHeap {
	private readonly keys: number[] = [];
	private readonly items: number[] = [];

	get size(): number {
		return this.items.length;
	}

	push(item: number, key: number): void {
		this.keys.push(key);
		this.items.push(item);
		let index = this.items.length - 1;
		while (index > 0) {
			const parent = (index - 1) >> 1;
			if (this.keys[parent] <= this.keys[index]) {
				break;
			}
			this.swap(parent, index);
			index = parent;
		}
	}

	pop(): number {
		const top = this.items[0];
		const lastKey = this.keys.pop() as number;
		const lastItem = this.items.pop() as number;
		if (this.items.length > 0) {
			this.keys[0] = lastKey;
			this.items[0] = lastItem;
			let index = 0;
			for (;;) {
				const left = index * 2 + 1;
				const right = left + 1;
				let smallest = index;
				if (left < this.items.length && this.keys[left] < this.keys[smallest]) {
					smallest = left;
				}
				if (right < this.items.length && this.keys[right] < this.keys[smallest]) {
					smallest = right;
				}
				if (smallest === index) {
					break;
				}
				this.swap(smallest, index);
				index = smallest;
			}
		}
		return top;
	}

	private swap(first: number, second: number): void {
		[this.keys[first], this.keys[second]] = [this.keys[second], this.keys[first]];
		[this.items[first], this.items[second]] = [this.items[second], this.items[first]];
	}
}

// Создаёт навигатор по данным уровня и геометрии.
export function createChefNavigator(level: LevelConfig, geometry: LevelGeometry): ChefNavigator {
	const bounds = level.bounds;
	const radius = level.params.player.radius;
	const world: CollisionWorld = { obstacles: geometry.obstacles, bounds };
	const cols = Math.round(bounds.width / GRID_STEP);
	const rows = Math.round(bounds.depth / GRID_STEP);

	// Проходима ли точка кругом радиуса radius + margin.
	function isWalkableWith(point: Vec2, margin: number): boolean {
		const clearance = radius + margin;
		if (point.x < bounds.x + clearance || point.z < bounds.z + clearance || point.x > bounds.x + bounds.width - clearance || point.z > bounds.z + bounds.depth - clearance) {
			return false;
		}
		return maxPenetration(point, clearance, world) <= 1e-6;
	}

	const cellCenter = (col: number, row: number): Vec2 => ({ x: bounds.x + (col + 0.5) * GRID_STEP, z: bounds.z + (row + 0.5) * GRID_STEP });
	const walkable = new Uint8Array(cols * rows);
	for (let row = 0; row < rows; row += 1) {
		for (let col = 0; col < cols; col += 1) {
			walkable[row * cols + col] = isWalkableWith(cellCenter(col, row), GRID_MARGIN) ? 1 : 0;
		}
	}

	// Ближайшая проходимая клетка к точке (кольцами) или -1.
	function findNearestWalkableCell(point: Vec2): number {
		const baseCol = Math.floor((point.x - bounds.x) / GRID_STEP);
		const baseRow = Math.floor((point.z - bounds.z) / GRID_STEP);
		let best = -1;
		let bestDistance = Infinity;
		for (let ring = 0; ring <= NEAREST_SEARCH_RING; ring += 1) {
			for (let row = baseRow - ring; row <= baseRow + ring; row += 1) {
				for (let col = baseCol - ring; col <= baseCol + ring; col += 1) {
					if (Math.max(Math.abs(row - baseRow), Math.abs(col - baseCol)) !== ring || col < 0 || row < 0 || col >= cols || row >= rows) {
						continue;
					}
					if (walkable[row * cols + col] === 0) {
						continue;
					}
					const center = cellCenter(col, row);
					const distance = Math.hypot(center.x - point.x, center.z - point.z);
					if (distance < bestDistance) {
						bestDistance = distance;
						best = row * cols + col;
					}
				}
			}
			if (best >= 0) {
				break;
			}
		}
		return best;
	}

	// Видны ли две точки друг из друга для круга повара (проверка точек вдоль отрезка).
	function hasLineOfSight(from: Vec2, to: Vec2): boolean {
		const length = Math.hypot(to.x - from.x, to.z - from.z);
		const samples = Math.max(1, Math.ceil(length / LINE_SAMPLE_STEP));
		for (let index = 1; index <= samples; index += 1) {
			const ratio = index / samples;
			if (!isWalkableWith({ x: from.x + (to.x - from.x) * ratio, z: from.z + (to.z - from.z) * ratio }, LINE_MARGIN)) {
				return false;
			}
		}
		return true;
	}

	// A* по клеткам: восемь соседей без срезания углов. Возвращает индексы клеток от старта до цели или null.
	function findCellPath(startCell: number, goalCell: number): number[] | null {
		if (startCell === goalCell) {
			return [startCell];
		}
		const total = cols * rows;
		const cost = new Float64Array(total).fill(Infinity);
		const parent = new Int32Array(total).fill(-1);
		const closed = new Uint8Array(total);
		const goalCol = goalCell % cols;
		const goalRow = Math.floor(goalCell / cols);
		const heuristic = (cell: number): number => {
			const dx = Math.abs((cell % cols) - goalCol);
			const dz = Math.abs(Math.floor(cell / cols) - goalRow);
			return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * GRID_STEP;
		};
		const open = new MinHeap();
		cost[startCell] = 0;
		open.push(startCell, heuristic(startCell));
		while (open.size > 0) {
			const current = open.pop();
			if (closed[current] === 1) {
				continue;
			}
			closed[current] = 1;
			if (current === goalCell) {
				const path: number[] = [];
				for (let cell = goalCell; cell !== -1; cell = parent[cell]) {
					path.push(cell);
				}
				return path.reverse();
			}
			const col = current % cols;
			const row = Math.floor(current / cols);
			for (let deltaRow = -1; deltaRow <= 1; deltaRow += 1) {
				for (let deltaCol = -1; deltaCol <= 1; deltaCol += 1) {
					if (deltaCol === 0 && deltaRow === 0) {
						continue;
					}
					const nextCol = col + deltaCol;
					const nextRow = row + deltaRow;
					if (nextCol < 0 || nextRow < 0 || nextCol >= cols || nextRow >= rows || walkable[nextRow * cols + nextCol] === 0) {
						continue;
					}
					// Без срезания углов: при диагонали обе боковые клетки должны быть проходимы.
					if (deltaCol !== 0 && deltaRow !== 0 && (walkable[row * cols + nextCol] === 0 || walkable[nextRow * cols + col] === 0)) {
						continue;
					}
					const next = nextRow * cols + nextCol;
					const stepCost = (deltaCol !== 0 && deltaRow !== 0 ? Math.SQRT2 : 1) * GRID_STEP;
					const nextCost = cost[current] + stepCost;
					if (nextCost < cost[next]) {
						cost[next] = nextCost;
						parent[next] = current;
						open.push(next, nextCost + heuristic(next));
					}
				}
			}
		}
		return null;
	}

	function findPath(from: Vec2, to: Vec2): Vec2[] | null {
		const startCell = findNearestWalkableCell(from);
		const goalCell = findNearestWalkableCell(to);
		if (startCell < 0 || goalCell < 0) {
			return null;
		}
		const cells = findCellPath(startCell, goalCell);
		if (!cells) {
			return null;
		}
		const points: Vec2[] = [from, ...cells.map((cell) => cellCenter(cell % cols, Math.floor(cell / cols))), to];
		// Сглаживание по линии видимости: от каждой точки к самой дальней видимой.
		const smoothed: Vec2[] = [];
		let anchor = 0;
		while (anchor < points.length - 1) {
			let farthest = points.length - 1;
			while (farthest > anchor + 1 && !hasLineOfSight(points[anchor], points[farthest])) {
				farthest -= 1;
			}
			smoothed.push(points[farthest]);
			anchor = farthest;
		}
		return smoothed;
	}

	function pathLength(from: Vec2, to: Vec2): number | null {
		const path = findPath(from, to);
		if (!path) {
			return null;
		}
		let length = 0;
		let previous = from;
		for (const point of path) {
			length += Math.hypot(point.x - previous.x, point.z - previous.z);
			previous = point;
		}
		return length;
	}

	// Рабочие точки станций считаются один раз.
	const spotsByStation = new Map<StationId, WorkSpot[]>();
	const params = level.params.player;
	for (const station of level.stations) {
		const spots = computeWorkSpots(station.id, station.rect);
		if (spots.length === 0) {
			throw new Error(`у станции ${station.id} нет рабочей точки для повара: к ней нельзя подойти и встать лицом`);
		}
		spotsByStation.set(station.id, spots);
	}

	function computeWorkSpots(stationId: StationId, rect: Rect): WorkSpot[] {
		const spots: WorkSpot[] = [];
		const gap = radius + SPOT_GAP;
		const centerX = rect.x + rect.width / 2;
		const centerZ = rect.z + rect.depth / 2;
		// Смещения вдоль стороны от центра, по возрастанию модуля: лучшая точка напротив центра станции.
		const lateralOffsets = (length: number): number[] => {
			const offsets = [0];
			for (let shift = 0.1; shift <= length / 2 - 0.04; shift += 0.1) {
				offsets.push(-shift, shift);
			}
			return offsets;
		};
		const sides: Array<{ facing: Facing8; position: (lateral: number) => Vec2; length: number }> = [
			{ facing: 4, position: (lateral) => ({ x: centerX + lateral, z: rect.z - gap }), length: rect.width },
			{ facing: 0, position: (lateral) => ({ x: centerX + lateral, z: rect.z + rect.depth + gap }), length: rect.width },
			{ facing: 2, position: (lateral) => ({ x: rect.x - gap, z: centerZ + lateral }), length: rect.depth },
			{ facing: 6, position: (lateral) => ({ x: rect.x + rect.width + gap, z: centerZ + lateral }), length: rect.depth },
		];
		for (const side of sides) {
			for (const lateral of lateralOffsets(side.length)) {
				const position = side.position(lateral);
				if (!isWalkableWith(position, 0.005)) {
					continue;
				}
				const target = pickTarget(level.stations, position, probePoint(position, side.facing, params.reach), params.targetTolerance);
				if (target?.stationId === stationId) {
					spots.push({ stationId, position, facing: side.facing });
				}
			}
		}
		return spots;
	}

	return {
		findPath,
		pathLength,
		getWorkSpots: (stationId: StationId) => spotsByStation.get(stationId) ?? [],
		isWalkable: (point: Vec2) => isWalkableWith(point, 0.005),
	};
}
