// Проверка достижимости целей уровня поиском в ширину по сетке 0.5 без раздувания (независима от модуля навигации).
// Нужна тестам уровней и фикстур. Полную проверку по навигационной сетке и A* (задача 8.5) строим на buildGeometry SONNET-2.
// Владелец: Opus-агент.
import type { LevelConfig, Vec2 } from "../../contracts";
import { GRID_STEP } from "../../contracts";
import { buildGeometry } from "../../sim/geometry";
import { createPathfinder } from "../../sim/nav/pathfinder";
import { collectObstacles } from "./validate";

// Цель уровня с подписью для сообщений тестов.
export interface LevelTarget {
	label: string;
	point: Vec2;
}

// Ключ клетки сетки по её номерам.
function cellKey(col: number, row: number): string {
	return `${col},${row}`;
}

// Возвращает ключи клеток, достижимых из точки start (четыре соседа; клетка занята, если её центр внутри препятствия).
export function findReachableCells(level: LevelConfig, start: Vec2): Set<string> {
	const cols = Math.round(level.bounds.width / GRID_STEP);
	const rows = Math.round(level.bounds.depth / GRID_STEP);
	const obstacles = collectObstacles(level).map((obstacle) => obstacle.rect);
	const isBlocked = (col: number, row: number): boolean => {
		const centerX = level.bounds.x + (col + 0.5) * GRID_STEP;
		const centerZ = level.bounds.z + (row + 0.5) * GRID_STEP;
		return obstacles.some((area) => centerX > area.x && centerX < area.x + area.width && centerZ > area.z && centerZ < area.z + area.depth);
	};
	const startCol = Math.floor((start.x - level.bounds.x) / GRID_STEP);
	const startRow = Math.floor((start.z - level.bounds.z) / GRID_STEP);
	const visited = new Set<string>([cellKey(startCol, startRow)]);
	const queue = [{ col: startCol, row: startRow }];
	const steps = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	];
	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const [deltaCol, deltaRow] of steps) {
			const col = current.col + deltaCol;
			const row = current.row + deltaRow;
			const key = cellKey(col, row);
			if (col < 0 || row < 0 || col >= cols || row >= rows || visited.has(key) || isBlocked(col, row)) {
				continue;
			}
			visited.add(key);
			queue.push({ col, row });
		}
	}
	return visited;
}

// Достижима ли точка (клетка, в которую она попадает) среди достижимых клеток.
export function isPointReachable(level: LevelConfig, reached: Set<string>, target: Vec2): boolean {
	return reached.has(cellKey(Math.floor((target.x - level.bounds.x) / GRID_STEP), Math.floor((target.z - level.bounds.z) / GRID_STEP)));
}

// Клетки-подходы к станции: полоса клеток вплотную к её прямоугольнику со всех сторон.
function listStationApproachPoints(rect: { x: number; z: number; width: number; depth: number }): Vec2[] {
	const around: Vec2[] = [];
	for (let along = 0; along < rect.width / GRID_STEP; along += 1) {
		around.push({ x: rect.x + GRID_STEP / 2 + along * GRID_STEP, z: rect.z - GRID_STEP / 2 });
		around.push({ x: rect.x + GRID_STEP / 2 + along * GRID_STEP, z: rect.z + rect.depth + GRID_STEP / 2 });
	}
	for (let along = 0; along < rect.depth / GRID_STEP; along += 1) {
		around.push({ x: rect.x - GRID_STEP / 2, z: rect.z + GRID_STEP / 2 + along * GRID_STEP });
		around.push({ x: rect.x + rect.width + GRID_STEP / 2, z: rect.z + GRID_STEP / 2 + along * GRID_STEP });
	}
	return around;
}

// Все цели уровня: дверь, слоты очереди (с членами группы), места за столами (подход и подача), окно, подходы к станциям.
export function listLevelTargets(level: LevelConfig): LevelTarget[] {
	const targets: LevelTarget[] = [
		{ label: "дверь, точка внутри", point: level.door.insidePoint },
		{ label: "дверь, точка снаружи", point: level.door.outsidePoint },
		{ label: "место появления клиентов", point: level.door.spawnPoint },
		{ label: "место ухода клиентов", point: level.door.exitPoint },
		{ label: "окно выдачи, точка забора", point: level.window.pickupPoint },
	];
	level.queue.slots.forEach((slot) => {
		level.queue.memberOffsets.forEach((offset, memberIndex) => {
			targets.push({ label: `слот очереди ${slot.index}, член группы ${memberIndex}`, point: { x: slot.position.x + offset.x, z: slot.position.z + offset.z } });
		});
	});
	level.tables.forEach((table) => {
		table.seats.forEach((seat, seatIndex) => {
			targets.push({ label: `${table.id} место ${seatIndex}, подход`, point: seat.approachPoint });
			targets.push({ label: `${table.id} место ${seatIndex}, подача`, point: seat.servePoint });
		});
	});
	level.waiters.waitPoints.forEach((waitPoint, index) => targets.push({ label: `точка ожидания официанта ${index}`, point: waitPoint }));
	return targets;
}

// Возвращает подписи недостижимых из origin целей уровня (пустой список: всё достижимо). К станции можно подойти, если
// достижима хотя бы одна клетка вплотную к её прямоугольнику.
export function findUnreachableTargets(level: LevelConfig, origin: Vec2): string[] {
	const reached = findReachableCells(level, origin);
	const unreachable: string[] = [];
	listLevelTargets(level).forEach((target) => {
		if (!isPointReachable(level, reached, target.point)) {
			unreachable.push(target.label);
		}
	});
	level.stations.forEach((station) => {
		const canApproach = listStationApproachPoints(station.rect).some((approach) => isPointReachable(level, reached, approach));
		if (!canApproach) {
			unreachable.push(`станция ${station.id}`);
		}
	});
	return unreachable;
}

// То же по настоящей навигации: сетка buildGeometry (с раздутием на радиус NPC) и поиск пути A* из sim/nav. Цель недостижима,
// если её клетка заблокирована или пути до неё нет. Станции проверяются подходом на соседнюю свободную клетку.
export function findUnreachableTargetsOnNavGrid(level: LevelConfig, origin: Vec2): string[] {
	const geometry = buildGeometry(level);
	const pathfinder = createPathfinder(geometry.navGrid);
	const grid = geometry.navGrid;
	const isFree = (point: Vec2): boolean => {
		const cell = grid.worldToCell(point);
		return !grid.isBlocked(cell.col, cell.row);
	};
	const isReachableOnGrid = (point: Vec2): boolean => isFree(point) && pathfinder.findPath(origin, point) !== null;
	const unreachable: string[] = [];
	listLevelTargets(level).forEach((target) => {
		if (!isReachableOnGrid(target.point)) {
			unreachable.push(target.label);
		}
	});
	level.stations.forEach((station) => {
		if (!listStationApproachPoints(station.rect).some((approach) => isReachableOnGrid(approach))) {
			unreachable.push(`станция ${station.id}`);
		}
	});
	return unreachable;
}
