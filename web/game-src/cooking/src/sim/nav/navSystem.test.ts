// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SIM_STEP_SEC, type LevelConfig, type LevelGeometry, type NavAgent, type NavGridView, type NavSystem, type Rect, type Vec2 } from "../../contracts";
import { buildGeometry, buildNavGrid, maxPenetration } from "../geometry";
import { createBlankLevel } from "../geometry/miniLevel";
import { createTestLevel } from "../testing/testLevel";
import { computeSeparationPush } from "./separation";
import { createNavSystem } from "./index";

// Шаг NPC без повара: повар за границей мира и никого не расталкивает.
const FAR_CHEF: Vec2 = { x: -100, z: -100 };

function createWorld(level: LevelConfig): { level: LevelConfig; geometry: LevelGeometry; nav: NavSystem } {
	const geometry = buildGeometry(level);
	return { level, geometry, nav: createNavSystem({ level, geometry }) };
}

// Запускает навигацию на seconds секунд шагами SIM_STEP_SEC. until: остановка, когда вернёт true. Возвращает время работы.
function simulate(nav: NavSystem, seconds: number, chef: Vec2 = FAR_CHEF, until?: () => boolean, onStep?: () => void): number {
	const steps = Math.round(seconds / SIM_STEP_SEC);
	for (let index = 0; index < steps; index += 1) {
		nav.step(SIM_STEP_SEC, chef);
		onStep?.();
		if (until?.()) {
			return (index + 1) * SIM_STEP_SEC;
		}
	}
	return seconds;
}

// Коридор длиной 12 вдоль x: свободная полоса по z от corridorTop до corridorBottom.
function createCorridorLevel(corridorTop: number, corridorBottom: number): LevelConfig {
	return createBlankLevel({
		bounds: { x: 0, z: 0, width: 12, depth: 8 },
		colliders: [
			{ x: 0, z: 0, width: 12, depth: corridorTop },
			{ x: 0, z: corridorBottom, width: 12, depth: 8 - corridorBottom },
		],
	});
}

function addAgent(nav: NavSystem, id: string, position: Vec2, speed = 3, radius = 0.25): NavAgent {
	return nav.createAgent({ id, position, speed, radius });
}

describe("агент навигации: жизненный цикл", () => {
	it("создаётся в покое, идёт к цели, приходит точно в неё и поворачивается по ходу движения", () => {
		const { nav } = createWorld(createCorridorLevel(3, 4.5));
		const agent = addAgent(nav, "a", { x: 1.25, z: 3.75 });
		expect(agent.status).toBe("idle");
		expect(agent.isMoving).toBe(false);
		expect(agent.moveTo({ x: 10.75, z: 3.75 })).toBe(true);
		expect(agent.status).toBe("moving");
		expect(agent.isMoving).toBe(true);
		const elapsed = simulate(nav, 10, FAR_CHEF, () => agent.status === "arrived");
		expect(agent.status).toBe("arrived");
		expect(agent.isMoving).toBe(false);
		// 9.5 единиц со скоростью 3: около 3.2 секунды.
		expect(elapsed).toBeGreaterThan(3.1);
		expect(elapsed).toBeLessThan(3.6);
		expect(agent.position.x).toBeCloseTo(10.75, 6);
		expect(agent.position.z).toBeCloseTo(3.75, 6);
		expect(agent.heading).toBeCloseTo(Math.PI / 2, 6);
		expect(agent.path).toHaveLength(0);
	});

	it("обходит прилавок на прямой и приходит к цели без вдавливания в препятствия", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 10, depth: 6 }, colliders: [{ x: 4, z: 2, width: 1.5, depth: 2 }] });
		const { nav, geometry } = createWorld(level);
		const agent = addAgent(nav, "a", { x: 1.25, z: 3.25 });
		agent.moveTo({ x: 8.75, z: 3.25 });
		let deepest = 0;
		simulate(nav, 12, FAR_CHEF, () => agent.status === "arrived", () => {
			deepest = Math.max(deepest, maxPenetration(agent.position, 0.25, { obstacles: geometry.obstacles, bounds: level.bounds }));
		});
		expect(agent.status).toBe("arrived");
		expect(deepest).toBeLessThan(1e-6);
		expect(agent.position.x).toBeCloseTo(8.75, 6);
	});

	it("недостижимая цель: moveTo возвращает false, статус unreachable, путь пуст", () => {
		const box: Rect[] = [
			{ x: 4, z: 2, width: 3, depth: 0.5 },
			{ x: 4, z: 4.5, width: 3, depth: 0.5 },
			{ x: 4, z: 2.5, width: 0.5, depth: 2 },
			{ x: 6.5, z: 2.5, width: 0.5, depth: 2 },
		];
		const { nav } = createWorld(createBlankLevel({ bounds: { x: 0, z: 0, width: 10, depth: 8 }, colliders: box }));
		const agent = addAgent(nav, "a", { x: 1, z: 1 });
		expect(agent.moveTo({ x: 5.5, z: 3.5 })).toBe(false);
		expect(agent.status).toBe("unreachable");
		expect(agent.path).toHaveLength(0);
		// Прежний путь отменяется: после неудачного moveTo агент стоит.
		expect(agent.moveTo({ x: 3, z: 1 })).toBe(true);
		agent.moveTo({ x: 5.5, z: 3.5 });
		const before = { ...agent.position };
		simulate(nav, 1);
		expect(agent.position).toEqual(before);
	});

	it("цель в той же точке: приход сразу, true", () => {
		const { nav } = createWorld(createBlankLevel());
		const agent = addAgent(nav, "a", { x: 2, z: 2 });
		expect(agent.moveTo({ x: 2, z: 2 })).toBe(true);
		expect(agent.status).toBe("arrived");
	});

	it("stop, teleport и setHeading: путь отменяется, статус idle, положение и взгляд меняются", () => {
		const { nav } = createWorld(createBlankLevel());
		const agent = addAgent(nav, "a", { x: 2, z: 2 });
		agent.moveTo({ x: 8, z: 8 });
		simulate(nav, 0.5);
		expect(agent.position.x).toBeGreaterThan(2);
		agent.stop();
		expect(agent.status).toBe("idle");
		const stopped = { ...agent.position };
		simulate(nav, 0.5);
		expect(agent.position).toEqual(stopped);
		agent.moveTo({ x: 8, z: 8 });
		agent.teleport({ x: 5, z: 5 }, 1.5);
		expect(agent.status).toBe("idle");
		expect(agent.position).toEqual({ x: 5, z: 5 });
		expect(agent.heading).toBe(1.5);
		expect(agent.path).toHaveLength(0);
		agent.setHeading(-0.5);
		expect(agent.heading).toBe(-0.5);
		agent.teleport({ x: 6, z: 6 });
		expect(agent.heading).toBe(-0.5);
	});

	it("removeAgent убирает агента из списка, повторный идентификатор запрещён, повторное удаление безопасно", () => {
		const { nav } = createWorld(createBlankLevel());
		addAgent(nav, "a", { x: 2, z: 2 });
		addAgent(nav, "b", { x: 3, z: 3 });
		expect(nav.agents.map((agent) => agent.id)).toEqual(["a", "b"]);
		expect(() => addAgent(nav, "a", { x: 4, z: 4 })).toThrow();
		nav.removeAgent("a");
		nav.removeAgent("a");
		expect(nav.agents.map((agent) => agent.id)).toEqual(["b"]);
	});

	it("не заходит за границу мира, даже если цель за границей", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 6, depth: 6 } });
		const { nav } = createWorld(level);
		const agent = addAgent(nav, "a", { x: 3, z: 3 });
		agent.moveTo({ x: 6.4, z: 3 });
		simulate(nav, 5);
		expect(agent.position.x).toBeLessThanOrEqual(6 - 0.25 + 1e-9);
	});

	it("нормальное движение не вызывает перепланирования", () => {
		const { nav } = createWorld(createBlankLevel({ bounds: { x: 0, z: 0, width: 30, depth: 6 } }));
		const spy = vi.spyOn(nav.pathfinder, "findPath");
		const agent = addAgent(nav, "a", { x: 1, z: 3 }, 2);
		agent.moveTo({ x: 28, z: 3 });
		simulate(nav, 8);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(agent.status).toBe("moving");
	});
});

describe("расталкивание", () => {
	it("сила растёт от нуля на радиусе до strength при совпадении центров и направлена от соседа", () => {
		const params = { radius: 0.6, strength: 1.5 };
		expect(computeSeparationPush({ x: 0, z: 0 }, null, [{ x: 0.6, z: 0 }], params)).toEqual({ x: 0, z: 0 });
		const half = computeSeparationPush({ x: 0, z: 0 }, null, [{ x: 0.3, z: 0 }], params);
		expect(half.x).toBeCloseTo(-0.75, 9);
		expect(half.z).toBeCloseTo(0, 9);
		const same = computeSeparationPush({ x: 1, z: 1 }, { x: 1, z: 0 }, [{ x: 1, z: 1 }], params);
		expect(Math.hypot(same.x, same.z)).toBeCloseTo(1.5, 9);
	});

	it("сосед строго впереди: обход вправо по ходу; сосед смещён вправо: обход влево; суммарная скорость ограничена", () => {
		const params = { radius: 0.6, strength: 1.5 };
		const heading = { x: 1, z: 0 };
		// Вправо по ходу при взгляде в +x это +z (экранный низ).
		const ahead = computeSeparationPush({ x: 0, z: 0 }, heading, [{ x: 0.3, z: 0 }], params);
		expect(ahead.x).toBeLessThan(0);
		expect(ahead.z).toBeGreaterThan(0);
		const neighborOnRight = computeSeparationPush({ x: 0, z: 0 }, heading, [{ x: 0.3, z: 0.2 }], params);
		expect(neighborOnRight.z).toBeLessThan(0);
		const crowd = computeSeparationPush({ x: 0, z: 0 }, heading, [{ x: 0.1, z: 0 }, { x: 0.1, z: 0.05 }, { x: 0.1, z: -0.05 }], params);
		expect(Math.hypot(crowd.x, crowd.z)).toBeLessThanOrEqual(1.5 + 1e-9);
	});

	it("Игрок в проходе: повар стоит в коридоре шириной 1.5, официант проходит и не ждёт бесконечно", () => {
		const { nav } = createWorld(createCorridorLevel(3, 4.5));
		const waiter = addAgent(nav, "waiter-1", { x: 1.25, z: 3.75 });
		waiter.moveTo({ x: 10.75, z: 3.75 });
		const chef = { x: 6, z: 3.75 };
		const elapsed = simulate(nav, 15, chef, () => waiter.status === "arrived");
		expect(waiter.status).toBe("arrived");
		expect(waiter.position.x).toBeCloseTo(10.75, 6);
		expect(elapsed).toBeLessThan(8);
	});

	it("Игрок в проходе: даже в проходе шириной 1.0 повар в центре не останавливает официанта навсегда", () => {
		const { nav } = createWorld(createCorridorLevel(3.5, 4.5));
		const waiter = addAgent(nav, "waiter-1", { x: 1.25, z: 3.75 });
		waiter.moveTo({ x: 10.75, z: 3.75 });
		const chef = { x: 6, z: 4 };
		const elapsed = simulate(nav, 20, chef, () => waiter.status === "arrived");
		expect(waiter.status).toBe("arrived");
		expect(elapsed).toBeLessThan(12);
	});

	it("Встречные клиенты: в коридоре шириной 1.5 расходятся и доходят до своих целей", () => {
		const { nav } = createWorld(createCorridorLevel(3, 4.5));
		const left = addAgent(nav, "c-1", { x: 1.25, z: 3.75 }, 2.4);
		const right = addAgent(nav, "c-2", { x: 10.75, z: 3.75 }, 2.4);
		left.moveTo({ x: 10.75, z: 3.75 });
		right.moveTo({ x: 1.25, z: 3.75 });
		const elapsed = simulate(nav, 20, FAR_CHEF, () => left.status === "arrived" && right.status === "arrived");
		expect(left.status).toBe("arrived");
		expect(right.status).toBe("arrived");
		expect(elapsed).toBeLessThan(10);
		expect(left.position.x).toBeCloseTo(10.75, 6);
		expect(right.position.x).toBeCloseTo(1.25, 6);
	});

	it("Встречные клиенты: в проходе шириной 1.0 тоже доходят (мягкое расталкивание не клинит)", () => {
		const { nav } = createWorld(createCorridorLevel(3.5, 4.5));
		const left = addAgent(nav, "c-1", { x: 1.25, z: 3.75 }, 2.4);
		const right = addAgent(nav, "c-2", { x: 10.75, z: 3.75 }, 2.4);
		left.moveTo({ x: 10.75, z: 3.75 });
		right.moveTo({ x: 1.25, z: 3.75 });
		simulate(nav, 25, FAR_CHEF, () => left.status === "arrived" && right.status === "arrived");
		expect(left.status).toBe("arrived");
		expect(right.status).toBe("arrived");
	});

	it("Встречные клиенты на открытом месте: расходятся в стороны и не сближаются плотнее половины радиуса расталкивания надолго", () => {
		const { nav } = createWorld(createBlankLevel({ bounds: { x: 0, z: 0, width: 14, depth: 8 } }));
		const left = addAgent(nav, "c-1", { x: 1.25, z: 4.25 }, 2.4);
		const right = addAgent(nav, "c-2", { x: 12.75, z: 4.25 }, 2.4);
		left.moveTo({ x: 12.75, z: 4.25 });
		right.moveTo({ x: 1.25, z: 4.25 });
		let closest = Infinity;
		let widest = 0;
		simulate(nav, 15, FAR_CHEF, () => left.status === "arrived" && right.status === "arrived", () => {
			closest = Math.min(closest, Math.hypot(left.position.x - right.position.x, left.position.z - right.position.z));
			widest = Math.max(widest, Math.abs(left.position.z - right.position.z));
		});
		expect(left.status).toBe("arrived");
		expect(right.status).toBe("arrived");
		// Разошлись боковым обходом: поперечное расхождение заметно, сближение не доходит до совпадения центров.
		expect(widest).toBeGreaterThan(0.2);
		expect(closest).toBeGreaterThan(0.15);
	});

	it("стоящий агент расталкиванием не сдвигается, идущий его обходит и приходит", () => {
		const { nav } = createWorld(createBlankLevel({ bounds: { x: 0, z: 0, width: 14, depth: 8 } }));
		const standing = addAgent(nav, "queue-1", { x: 7, z: 4 }, 2.4);
		const mover = addAgent(nav, "c-1", { x: 1.25, z: 4 }, 2.4);
		mover.moveTo({ x: 12.75, z: 4 });
		let widest = 0;
		simulate(nav, 12, FAR_CHEF, () => mover.status === "arrived", () => {
			widest = Math.max(widest, Math.abs(mover.position.z - 4));
		});
		expect(mover.status).toBe("arrived");
		expect(standing.position).toEqual({ x: 7, z: 4 });
		expect(standing.status).toBe("idle");
		expect(widest).toBeGreaterThan(0.05);
	});

	it("идущего агента расталкивает и повар: агент обходит стоящего на пути повара", () => {
		const { nav } = createWorld(createBlankLevel({ bounds: { x: 0, z: 0, width: 14, depth: 8 } }));
		const mover = addAgent(nav, "waiter-1", { x: 1.25, z: 4 }, 3);
		mover.moveTo({ x: 12.75, z: 4 });
		let widest = 0;
		simulate(nav, 12, { x: 7, z: 4 }, () => mover.status === "arrived", () => {
			widest = Math.max(widest, Math.abs(mover.position.z - 4));
		});
		expect(mover.status).toBe("arrived");
		expect(widest).toBeGreaterThan(0.05);
	});

	it("несколько агентов на тестовом уровне: все доходят от улицы к столам через дверь и не вдавливаются в мебель", () => {
		const level = createTestLevel();
		const { nav, geometry } = createWorld(level);
		const world = { obstacles: geometry.obstacles, bounds: level.bounds };
		const agents: NavAgent[] = [];
		const targets: Vec2[] = [level.tables[0].seats[0].approachPoint, level.tables[0].seats[1].approachPoint, level.tables[1].seats[0].approachPoint, level.tables[1].seats[3].approachPoint, level.tables[2].seats[0].approachPoint, level.window.pickupPoint];
		targets.forEach((target, index) => {
			const agent = addAgent(nav, `c-${index}`, { x: level.door.spawnPoint.x + index * 0.3, z: level.door.spawnPoint.z }, 2.4);
			expect(agent.moveTo(target)).toBe(true);
			agents.push(agent);
		});
		let deepest = 0;
		simulate(nav, 40, level.chefStart.position, () => agents.every((agent) => agent.status === "arrived"), () => {
			for (const agent of agents) {
				deepest = Math.max(deepest, maxPenetration(agent.position, 0.25, world));
			}
		});
		agents.forEach((agent, index) => {
			expect(agent.status, `агент ${index}`).toBe("arrived");
			expect(Math.hypot(agent.position.x - targets[index].x, agent.position.z - targets[index].z)).toBeLessThan(0.16);
		});
		expect(deepest).toBeLessThan(1e-6);
	});
});

// Геометрия с изменяемыми препятствиями для проверки перепланирования: block добавляет препятствие и пересчитывает сетку.
function createMutableGeometry(level: LevelConfig): { geometry: LevelGeometry; block: (rect: Rect) => void } {
	const base = buildGeometry(level);
	let current = base.navGrid;
	const grid: NavGridView = {
		get originX(): number {
			return current.originX;
		},
		get originZ(): number {
			return current.originZ;
		},
		get cellSize(): number {
			return current.cellSize;
		},
		get cols(): number {
			return current.cols;
		},
		get rows(): number {
			return current.rows;
		},
		isBlocked: (col, row) => current.isBlocked(col, row),
		worldToCell: (point) => current.worldToCell(point),
		cellToWorld: (col, row) => current.cellToWorld(col, row),
	};
	const obstacles = base.obstacles as Rect[];
	return {
		geometry: { ...base, navGrid: grid },
		block(rect: Rect): void {
			obstacles.push(rect);
			current = buildNavGrid(level.bounds, obstacles, level.params.nav.agentRadius);
		},
	};
}

describe("перепланирование пути", () => {
	it("Застрял: препятствие появилось на пути, агент не двигается дольше порога, путь перестраивается и он доходит", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 10, depth: 6 } });
		const { geometry, block } = createMutableGeometry(level);
		const nav = createNavSystem({ level, geometry });
		const spy = vi.spyOn(nav.pathfinder, "findPath");
		const agent = addAgent(nav, "c-1", { x: 1, z: 3 }, 3);
		agent.moveTo({ x: 9, z: 3 });
		simulate(nav, 0.5);
		// Стена поперёк пути (x 4..5, z 1..5) с проходами сверху и снизу шириной 1.0.
		block({ x: 4, z: 1, width: 1, depth: 4 });
		simulate(nav, 1.2);
		// Агент упёрся в стену и стоит: порог ещё не истёк, путь прежний.
		expect(agent.status).toBe("moving");
		expect(agent.position.x).toBeCloseTo(3.75, 3);
		expect(spy).toHaveBeenCalledTimes(1);
		simulate(nav, 20, FAR_CHEF, () => agent.status === "arrived");
		expect(agent.status).toBe("arrived");
		expect(agent.position.x).toBeCloseTo(9, 6);
		expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("без перепланирования (порог больше времени теста) агент остаётся у стены: проверка, что без него не дойти", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 10, depth: 6 }, paramsOverrides: { nav: { stuckTimeoutSec: 1000 } } });
		const { geometry, block } = createMutableGeometry(level);
		const nav = createNavSystem({ level, geometry });
		const agent = addAgent(nav, "c-1", { x: 1, z: 3 }, 3);
		agent.moveTo({ x: 9, z: 3 });
		simulate(nav, 0.5);
		block({ x: 4, z: 1, width: 1, depth: 4 });
		simulate(nav, 15);
		expect(agent.status).toBe("moving");
		expect(agent.position.x).toBeLessThan(4);
	});

	it("после перепланирования цель оказалась недостижимой: статус unreachable", () => {
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 10, depth: 6 } });
		const { geometry, block } = createMutableGeometry(level);
		const nav = createNavSystem({ level, geometry });
		const agent = addAgent(nav, "c-1", { x: 1, z: 3 }, 3);
		agent.moveTo({ x: 9, z: 3 });
		simulate(nav, 0.5);
		// Сплошная стена во всю высоту мира.
		block({ x: 4, z: 0, width: 1, depth: 6 });
		simulate(nav, 10, FAR_CHEF, () => agent.status === "unreachable");
		expect(agent.status).toBe("unreachable");
		expect(agent.path).toHaveLength(0);
	});

	it("агент, не дошедший вплотную до цели из-за столкновения, но рядом с ней, считается пришедшим", () => {
		// Цель в 0.1 от стены: круг радиуса 0.25 встаёт в 0.25 от стены, до цели остаётся 0.15, это в пределах допуска прихода.
		const level = createBlankLevel({ bounds: { x: 0, z: 0, width: 10, depth: 6 }, colliders: [{ x: 6, z: 0, width: 1, depth: 6 }] });
		const { nav } = createWorld(level);
		const agent = addAgent(nav, "c-1", { x: 1, z: 3 }, 3);
		agent.moveTo({ x: 5.9, z: 3 });
		simulate(nav, 8, FAR_CHEF, () => agent.status === "arrived");
		expect(agent.status).toBe("arrived");
	});
});
