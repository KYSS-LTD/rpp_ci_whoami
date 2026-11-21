// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LevelConfig, NavGridView, Rect, Vec2 } from "../../contracts";
import { buildCollisionGrid, buildGeometry, buildNavGrid } from "../geometry";
import { createBlankLevel } from "../geometry/miniLevel";
import { createTestLevel } from "../testing/testLevel";
import { cellPathCost, findCellPath, octileDistance, type Cell } from "./astar";
import { createPathfinder, findNearestFreeCell, hasLineOfSight } from "./pathfinder";

// Детерминированный генератор для случайных сеток (линейный конгруэнтный).
function createLcg(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

// Сетка из текстовой карты (# - заблокировано), клетка 0.5.
function gridFromMap(map: string[]): NavGridView {
	const obstacles: Rect[] = [];
	map.forEach((line, row) => {
		[...line].forEach((symbol, col) => {
			if (symbol === "#") {
				obstacles.push({ x: col * 0.5, z: row * 0.5, width: 0.5, depth: 0.5 });
			}
		});
	});
	return buildCollisionGrid({ x: 0, z: 0, width: map[0].length * 0.5, depth: map.length * 0.5 }, obstacles);
}

// Эталон: стоимость кратчайшего пути по Дейкстре (те же правила: восемь соседей, без срезания углов).
function dijkstraCost(grid: NavGridView, start: Cell, goal: Cell): number | null {
	const cost = new Map<string, number>();
	const key = (col: number, row: number): string => `${col},${row}`;
	cost.set(key(start.col, start.row), 0);
	const visited = new Set<string>();
	for (;;) {
		let bestKey: string | null = null;
		let bestCost = Infinity;
		for (const [candidate, value] of cost) {
			if (!visited.has(candidate) && value < bestCost) {
				bestKey = candidate;
				bestCost = value;
			}
		}
		if (bestKey === null) {
			return null;
		}
		visited.add(bestKey);
		const [col, row] = bestKey.split(",").map(Number);
		if (col === goal.col && row === goal.row) {
			return bestCost;
		}
		for (let dc = -1; dc <= 1; dc += 1) {
			for (let dr = -1; dr <= 1; dr += 1) {
				if ((dc === 0 && dr === 0) || grid.isBlocked(col + dc, row + dr)) {
					continue;
				}
				const diagonal = dc !== 0 && dr !== 0;
				if (diagonal && (grid.isBlocked(col + dc, row) || grid.isBlocked(col, row + dr))) {
					continue;
				}
				const next = key(col + dc, row + dr);
				const nextCost = bestCost + (diagonal ? Math.SQRT2 : 1);
				if (nextCost < (cost.get(next) ?? Infinity)) {
					cost.set(next, nextCost);
				}
			}
		}
	}
}

// Длина ломаной от from через точки.
function polylineLength(from: Vec2, points: readonly Vec2[]): number {
	let length = 0;
	let previous = from;
	for (const point of points) {
		length += Math.hypot(point.x - previous.x, point.z - previous.z);
		previous = point;
	}
	return length;
}

// Независимая проверка пути: плотная выборка точек по отрезкам, ни одна не попадает в заблокированную клетку.
function expectPathAvoidsBlockedCells(grid: NavGridView, from: Vec2, points: readonly Vec2[]): void {
	let previous = from;
	for (const point of points) {
		const length = Math.hypot(point.x - previous.x, point.z - previous.z);
		const samples = Math.max(2, Math.ceil(length / 0.02));
		for (let index = 0; index <= samples; index += 1) {
			const ratio = index / samples;
			const sample = { x: previous.x + (point.x - previous.x) * ratio, z: previous.z + (point.z - previous.z) * ratio };
			const cell = grid.worldToCell(sample);
			expect(grid.isBlocked(cell.col, cell.row), `точка ${sample.x.toFixed(2)},${sample.z.toFixed(2)} в заблокированной клетке`).toBe(false);
		}
		previous = point;
	}
}

describe("A*: стоимость и форма пути", () => {
	it("эвристика octile равна точной стоимости на пустой сетке", () => {
		expect(octileDistance(3, 3)).toBeCloseTo(3 * Math.SQRT2, 9);
		expect(octileDistance(5, 2)).toBeCloseTo(3 + 2 * Math.SQRT2, 9);
		expect(octileDistance(-4, 0)).toBe(4);
	});

	it("на пустой сетке путь идёт по диагонали и прямой, стоимость совпадает с octile", () => {
		const grid = gridFromMap(["........", "........", "........", "........", "........", "........"]);
		const path = findCellPath(grid, { col: 0, row: 0 }, { col: 5, row: 2 });
		expect(path).not.toBeNull();
		expect(cellPathCost(path ?? [])).toBeCloseTo(octileDistance(5, 2), 9);
		expect(path?.[0]).toEqual({ col: 0, row: 0 });
		expect(path?.[path.length - 1]).toEqual({ col: 5, row: 2 });
	});

	it("стартовая клетка равна целевой: путь из одной клетки", () => {
		const grid = gridFromMap(["...", "...", "..."]);
		expect(findCellPath(grid, { col: 1, row: 1 }, { col: 1, row: 1 })).toEqual([{ col: 1, row: 1 }]);
	});

	it("заблокированные старт и цель дают null", () => {
		const grid = gridFromMap(["...", ".#.", "..."]);
		expect(findCellPath(grid, { col: 1, row: 1 }, { col: 2, row: 2 })).toBeNull();
		expect(findCellPath(grid, { col: 0, row: 0 }, { col: 1, row: 1 })).toBeNull();
	});

	it("не срезает углы: диагональ между двумя диагонально стоящими препятствиями запрещена", () => {
		const grid = gridFromMap([".....", "..#..", ".#...", ".....", "....."]);
		// Клетки (1,1)... препятствия в (2,1) и (1,2): ход (1,1) -> (2,2) срезал бы их общий угол.
		const path = findCellPath(grid, { col: 1, row: 1 }, { col: 2, row: 2 }) ?? [];
		expect(path.length).toBeGreaterThan(2);
		expect(cellPathCost(path)).toBeGreaterThan(Math.SQRT2 + 1e-9);
		expect(cellPathCost(path)).toBeCloseTo(dijkstraCost(grid, { col: 1, row: 1 }, { col: 2, row: 2 }) ?? -1, 9);
		expect(hasLineOfSight(grid, grid.cellToWorld(1, 1), grid.cellToWorld(2, 2))).toBe(false);
	});

	it("стена с проёмом: стоимость совпадает с Дейкстрой", () => {
		const grid = gridFromMap(["....#....", "....#....", "....#....", ".........", "....#....", "....#...."]);
		const start = { col: 1, row: 0 };
		const goal = { col: 7, row: 1 };
		const path = findCellPath(grid, start, goal) ?? [];
		expect(cellPathCost(path)).toBeCloseTo(dijkstraCost(grid, start, goal) ?? -1, 9);
		// Путь обязан пройти через проём в строке 3.
		expect(path.some((cell) => cell.col === 4 && cell.row === 3)).toBe(true);
	});

	it("кратчайшесть на случайных сетках: стоимость A* равна Дейкстре, недостижимость совпадает", () => {
		const random = createLcg(12345);
		let checked = 0;
		let unreachable = 0;
		for (let gridIndex = 0; gridIndex < 12; gridIndex += 1) {
			const map: string[] = [];
			for (let row = 0; row < 10; row += 1) {
				let line = "";
				for (let col = 0; col < 12; col += 1) {
					line += random() < 0.28 ? "#" : ".";
				}
				map.push(line);
			}
			const grid = gridFromMap(map);
			for (let pair = 0; pair < 25; pair += 1) {
				const start = { col: Math.floor(random() * 12), row: Math.floor(random() * 10) };
				const goal = { col: Math.floor(random() * 12), row: Math.floor(random() * 10) };
				if (grid.isBlocked(start.col, start.row) || grid.isBlocked(goal.col, goal.row)) {
					continue;
				}
				const path = findCellPath(grid, start, goal);
				const expected = dijkstraCost(grid, start, goal);
				if (expected === null) {
					expect(path).toBeNull();
					unreachable += 1;
				} else {
					expect(path).not.toBeNull();
					expect(cellPathCost(path ?? [])).toBeCloseTo(expected, 9);
				}
				checked += 1;
			}
		}
		expect(checked).toBeGreaterThan(100);
		expect(unreachable).toBeGreaterThan(0);
	});
});

describe("линия видимости и сглаживание", () => {
	it("отрезок по свободным клеткам виден, через заблокированную нет", () => {
		const grid = gridFromMap(["........", "........", "...##...", "........", "........"]);
		expect(hasLineOfSight(grid, grid.cellToWorld(0, 0), grid.cellToWorld(7, 0))).toBe(true);
		expect(hasLineOfSight(grid, grid.cellToWorld(0, 2), grid.cellToWorld(7, 2))).toBe(false);
		expect(hasLineOfSight(grid, grid.cellToWorld(0, 0), grid.cellToWorld(7, 4))).toBe(false);
		expect(hasLineOfSight(grid, grid.cellToWorld(1, 0), grid.cellToWorld(1, 4))).toBe(true);
	});

	it("отрезок вдоль границы клеток считает обе соседние клетки", () => {
		const grid = gridFromMap(["....", "..#.", "....", "...."]);
		// Отрезок по линии z = 1.0 (граница строк 1 и 2) касается клетки (2,1): виден быть не должен.
		expect(hasLineOfSight(grid, { x: 0.25, z: 1 }, { x: 1.75, z: 1 })).toBe(false);
		expect(hasLineOfSight(grid, { x: 0.25, z: 1.25 }, { x: 1.75, z: 1.25 })).toBe(true);
	});

	it("случайные сетки: сглаженный путь не заходит в заблокированные клетки, не длиннее клеточного, заканчивается в цели", () => {
		const random = createLcg(777);
		let paths = 0;
		for (let gridIndex = 0; gridIndex < 10; gridIndex += 1) {
			const map: string[] = [];
			for (let row = 0; row < 12; row += 1) {
				let line = "";
				for (let col = 0; col < 14; col += 1) {
					line += random() < 0.25 ? "#" : ".";
				}
				map.push(line);
			}
			const grid = gridFromMap(map);
			const pathfinder = createPathfinder(grid);
			for (let pair = 0; pair < 20; pair += 1) {
				const start = { col: Math.floor(random() * 14), row: Math.floor(random() * 12) };
				const goal = { col: Math.floor(random() * 14), row: Math.floor(random() * 12) };
				if (grid.isBlocked(start.col, start.row) || grid.isBlocked(goal.col, goal.row)) {
					continue;
				}
				// Точные точки внутри клеток, не центры.
				const from = { x: (start.col + 0.2 + random() * 0.6) * 0.5, z: (start.row + 0.2 + random() * 0.6) * 0.5 };
				const to = { x: (goal.col + 0.2 + random() * 0.6) * 0.5, z: (goal.row + 0.2 + random() * 0.6) * 0.5 };
				const path = pathfinder.findPath(from, to);
				const cells = findCellPath(grid, start, goal);
				if (cells === null) {
					expect(path).toBeNull();
					expect(pathfinder.pathLength(from, to)).toBeNull();
					continue;
				}
				expect(path).not.toBeNull();
				const points = path ?? [];
				expect(points[points.length - 1]).toEqual(to);
				expectPathAvoidsBlockedCells(grid, from, points);
				const smoothed = polylineLength(from, points);
				// Не короче прямой и не длиннее пути по центрам клеток (плюс по половине клетки на подход к точкам внутри клеток).
				expect(smoothed).toBeGreaterThanOrEqual(Math.hypot(to.x - from.x, to.z - from.z) - 1e-9);
				expect(smoothed).toBeLessThanOrEqual(cellPathCost(cells) * 0.5 + 0.5 * Math.SQRT2 + 1e-9);
				expect(pathfinder.pathLength(from, to)).toBeCloseTo(smoothed, 9);
				paths += 1;
			}
		}
		expect(paths).toBeGreaterThan(80);
	});
});

describe("поисковик пути на уровне", () => {
	it("Препятствие на прямой: путь обходит прилавок и доходит до цели", () => {
		// Прилавок 1 x 1 в центре, цель за ним на одной горизонтали.
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 8, depth: 6 }, colliders: [{ x: 3.5, z: 2.5, width: 1, depth: 1 }] });
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		const from = { x: 1.25, z: 3 };
		const to = { x: 6.25, z: 3 };
		const path = pathfinder.findPath(from, to) ?? [];
		expect(path.length).toBeGreaterThanOrEqual(2);
		expect(path[path.length - 1]).toEqual(to);
		expect(polylineLength(from, path)).toBeGreaterThan(5);
		expectPathAvoidsBlockedCells(geometry.navGrid, from, path);
		// Ни одна точка пути не лежит внутри самого прилавка.
		for (let index = 0; index < path.length; index += 1) {
			const inside = path[index].x > 3.5 && path[index].x < 4.5 && path[index].z > 2.5 && path[index].z < 3.5;
			expect(inside).toBe(false);
		}
	});

	it("свободная прямая: путь это одна точка цели", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 8, depth: 6 } });
		const pathfinder = createPathfinder(buildGeometry(level).navGrid);
		expect(pathfinder.findPath({ x: 1.25, z: 1.25 }, { x: 6.75, z: 4.75 })).toEqual([{ x: 6.75, z: 4.75 }]);
		expect(pathfinder.pathLength({ x: 1.25, z: 1.25 }, { x: 6.75, z: 4.75 })).toBeCloseTo(Math.hypot(5.5, 3.5), 9);
	});

	it("начало уже у цели: пустой путь и нулевая длина; та же клетка: одна точка", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 4, depth: 4 } });
		const pathfinder = createPathfinder(buildGeometry(level).navGrid);
		expect(pathfinder.findPath({ x: 1.3, z: 1.3 }, { x: 1.3, z: 1.3 })).toEqual([]);
		expect(pathfinder.pathLength({ x: 1.3, z: 1.3 }, { x: 1.3, z: 1.3 })).toBe(0);
		expect(pathfinder.findPath({ x: 1.1, z: 1.1 }, { x: 1.4, z: 1.2 })).toEqual([{ x: 1.4, z: 1.2 }]);
	});

	it("Недостижимая цель: замкнутая комната даёт null и для пути, и для длины", () => {
		// Замкнутая коробка 2 x 2 клетки внутри свободного мира.
		const box: Rect[] = [
			{ x: 4, z: 2, width: 3, depth: 0.5 },
			{ x: 4, z: 4.5, width: 3, depth: 0.5 },
			{ x: 4, z: 2.5, width: 0.5, depth: 2 },
			{ x: 6.5, z: 2.5, width: 0.5, depth: 2 },
		];
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 10, depth: 8 }, colliders: box });
		const pathfinder = createPathfinder(buildGeometry(level).navGrid);
		expect(pathfinder.findPath({ x: 1, z: 1 }, { x: 5.5, z: 3.5 })).toBeNull();
		expect(pathfinder.pathLength({ x: 1, z: 1 }, { x: 5.5, z: 3.5 })).toBeNull();
		expect(pathfinder.findPath({ x: 5.5, z: 3.5 }, { x: 1, z: 1 })).toBeNull();
	});

	it("цель в заблокированной клетке смещается к ближайшей свободной", () => {
		const counter: Rect = { x: 4, z: 3, width: 1, depth: 1 };
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 8, depth: 6 }, colliders: [counter] });
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		const path = pathfinder.findPath({ x: 1, z: 1 }, { x: 4.4, z: 3.4 }) ?? [];
		expect(path.length).toBeGreaterThan(0);
		const end = path[path.length - 1];
		const endCell = geometry.navGrid.worldToCell(end);
		expect(geometry.navGrid.isBlocked(endCell.col, endCell.row)).toBe(false);
		// Это центр ближайшей к цели свободной клетки: рядом с прилавком.
		expect(Math.hypot(end.x - 4.4, end.z - 3.4)).toBeLessThan(0.8);
	});

	it("начало внутри заблокированной клетки: путь начинается с центра ближайшей свободной клетки", () => {
		const counter: Rect = { x: 4, z: 3, width: 1, depth: 1 };
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 8, depth: 6 }, colliders: [counter] });
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		const from = { x: 4.2, z: 3.2 };
		const path = pathfinder.findPath(from, { x: 1, z: 1 }) ?? [];
		expect(path.length).toBeGreaterThan(1);
		const startCell = geometry.navGrid.worldToCell(path[0]);
		expect(geometry.navGrid.isBlocked(startCell.col, startCell.row)).toBe(false);
		expect(path[path.length - 1]).toEqual({ x: 1, z: 1 });
		expect(pathfinder.pathLength(from, { x: 1, z: 1 }) ?? 0).toBeGreaterThan(Math.hypot(3.2, 2.2) - 1e-9);
	});

	it("точка вне границ мира смещается в ближайшую свободную клетку внутри, а совсем далёкая недостижима", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 4, depth: 4 } });
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		expect(pathfinder.findPath({ x: 1, z: 1 }, { x: 4.3, z: 2 })).not.toBeNull();
		expect(pathfinder.findPath({ x: 1, z: 1 }, { x: 40, z: 2 })).toBeNull();
		expect(findNearestFreeCell(geometry.navGrid, { x: -0.2, z: 2.2 })).toEqual({ col: 0, row: 4 });
	});

	it("путь читает сетку в момент запроса: заблокированная позже клетка обходится", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 6, depth: 3 } });
		const geometry = buildGeometry(level);
		const extra = new Set<string>();
		const grid: NavGridView = {
			originX: geometry.navGrid.originX,
			originZ: geometry.navGrid.originZ,
			cellSize: geometry.navGrid.cellSize,
			cols: geometry.navGrid.cols,
			rows: geometry.navGrid.rows,
			isBlocked: (col, row) => extra.has(`${col},${row}`) || geometry.navGrid.isBlocked(col, row),
			worldToCell: (point) => geometry.navGrid.worldToCell(point),
			cellToWorld: (col, row) => geometry.navGrid.cellToWorld(col, row),
		};
		const pathfinder = createPathfinder(grid);
		expect(pathfinder.findPath({ x: 0.75, z: 1.25 }, { x: 5.25, z: 1.25 })).toEqual([{ x: 5.25, z: 1.25 }]);
		for (let row = 0; row < 5; row += 1) {
			extra.add(`6,${row}`);
		}
		// Стена из пяти клеток по высоте 6 клеток: остался проход внизу.
		const detour = pathfinder.findPath({ x: 0.75, z: 1.25 }, { x: 5.25, z: 1.25 }) ?? [];
		expect(detour.length).toBeGreaterThan(1);
	});
});

describe("раздувание и тестовый уровень (задача 4.1)", () => {
	it("путь не проходит через раздутую мебель: ни одной точки в заблокированных клетках раздутой сетки", () => {
		// Радиус агента 0.5 раздувает стол и стены на клетку: путь около стола держит дистанцию.
		const level: LevelConfig = createTestLevel({ nav: { agentRadius: 0.5 } });
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		const from = level.door.spawnPoint;
		const targets = [level.tables[0].seats[0].approachPoint, level.tables[1].seats[3].approachPoint, level.window.pickupPoint, level.chefStart.position];
		for (const to of targets) {
			const path = pathfinder.findPath(from, to);
			expect(path, `цель ${to.x},${to.z}`).not.toBeNull();
			expectPathAvoidsBlockedCells(geometry.navGrid, from, path ?? []);
			// Расстояние от любой точки пути до любой мебели не меньше 0.14 (свободная клетка раздутой сетки: центр не ближе 0.5).
			const points = path ?? [];
			let previous = from;
			for (const point of points) {
				const samples = Math.max(2, Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / 0.05));
				for (let index = 0; index <= samples; index += 1) {
					const ratio = index / samples;
					const sample = { x: previous.x + (point.x - previous.x) * ratio, z: previous.z + (point.z - previous.z) * ratio };
					for (const obstacle of geometry.obstacles) {
						const dx = Math.max(obstacle.x - sample.x, 0, sample.x - (obstacle.x + obstacle.width));
						const dz = Math.max(obstacle.z - sample.z, 0, sample.z - (obstacle.z + obstacle.depth));
						expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(0.14);
					}
				}
				previous = point;
			}
		}
	});

	it("раздутая сетка уже обычной: при радиусе 0.5 заблокировано больше клеток, чем при 0.25", () => {
		const level = createTestLevel();
		const obstacles = buildGeometry(level).obstacles;
		const normal = buildNavGrid(level.bounds, obstacles, 0.25);
		const inflated = buildNavGrid(level.bounds, obstacles, 0.5);
		let normalBlocked = 0;
		let inflatedBlocked = 0;
		for (let row = 0; row < normal.rows; row += 1) {
			for (let col = 0; col < normal.cols; col += 1) {
				normalBlocked += normal.isBlocked(col, row) ? 1 : 0;
				inflatedBlocked += inflated.isBlocked(col, row) ? 1 : 0;
				if (normal.isBlocked(col, row)) {
					expect(inflated.isBlocked(col, row)).toBe(true);
				}
			}
		}
		expect(inflatedBlocked).toBeGreaterThan(normalBlocked);
	});

	it("чужие стулья непроходимы: путь к столу идёт мимо стульев, а не через них", () => {
		const level = createTestLevel();
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		// От подхода к одному месту стола 2 к подходу к соседнему месту: прямая пересекает стол и стулья.
		const from = level.tables[1].seats[0].approachPoint;
		const to = level.tables[1].seats[2].approachPoint;
		const path = pathfinder.findPath(from, to) ?? [];
		expect(path.length).toBeGreaterThan(1);
		expectPathAvoidsBlockedCells(geometry.navGrid, from, path);
		expect(polylineLength(from, path)).toBeGreaterThan(Math.hypot(to.x - from.x, to.z - from.z) + 0.5);
	});

	it("все цели тестового уровня достижимы с улицы, от повара и от официанта (через дверь и проход окна)", () => {
		const level = createTestLevel();
		const geometry = buildGeometry(level);
		const pathfinder = createPathfinder(geometry.navGrid);
		const targets: Array<[string, Vec2]> = [];
		level.tables.forEach((table) =>
			table.seats.forEach((seat, index) => {
				targets.push([`${table.id}#${index} approach`, seat.approachPoint]);
				targets.push([`${table.id}#${index} serve`, seat.servePoint]);
			}),
		);
		level.queue.slots.forEach((slot) => targets.push([`queue ${slot.index}`, slot.position]));
		targets.push(["pickup", level.window.pickupPoint], ["inside", level.door.insidePoint], ["outside", level.door.outsidePoint], ["exit", level.door.exitPoint]);
		level.waiters.waitPoints.forEach((point, index) => targets.push([`wait ${index}`, point]));
		const sources: Array<[string, Vec2]> = [
			["spawn", level.door.spawnPoint],
			["chef", level.chefStart.position],
			["wait", level.waiters.waitPoints[0]],
		];
		for (const [sourceName, source] of sources) {
			for (const [targetName, target] of targets) {
				expect(pathfinder.findPath(source, target), `${sourceName} -> ${targetName}`).not.toBeNull();
			}
		}
	});
});
