// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EMPTY_INPUT, FACING_VECTORS, SIM_STEP_SEC, type Facing8, type InputState, type LevelConfig, type Rect, type StationConfig, type Vec2 } from "../../contracts";
import { buildGeometry } from "../geometry";
import { createBlankLevel } from "../geometry/miniLevel";
import { createPlayer, pickTarget, resolveFacing } from "./index";

// Ввод с заданным вектором движения.
function move(x: number, z: number): InputState {
	return { ...EMPTY_INPUT, moveVector: { x, z } };
}

// Прилавок 1 x 1.
function counter(id: string, x: number, z: number, width = 1, depth = 1): StationConfig {
	return { id, kind: "counter", rect: { x, z, width, depth }, rotationDeg: 0 };
}

// Создаёт повара на уровне с заданными станциями и препятствиями; старт в позиции at, взгляд facing.
function makePlayer(options: { stations?: StationConfig[]; colliders?: Rect[]; at?: Vec2; facing?: Facing8 }): ReturnType<typeof createPlayer> {
	const level: LevelConfig = createBlankLevel({ stations: options.stations, colliders: options.colliders });
	const placed: LevelConfig = { ...level, chefStart: { position: options.at ?? { x: 2, z: 2 }, facing: options.facing ?? 0 } };
	return createPlayer({ level: placed, geometry: buildGeometry(placed) });
}

// Выполняет несколько шагов симуляции с одним вводом.
function run(player: ReturnType<typeof createPlayer>, input: InputState, steps: number): void {
	for (let index = 0; index < steps; index += 1) {
		player.step(input, SIM_STEP_SEC);
	}
}

// Единичный вектор ввода для угла в градусах от "вверх" по часовой стрелке.
function vectorAtAngle(angleDeg: number, length = 1): Vec2 {
	const radians = (angleDeg * Math.PI) / 180;
	return { x: Math.sin(radians) * length, z: -Math.cos(radians) * length };
}

describe("повар: движение и коллизии", () => {
	it("стартует в chefStart с заданным взглядом", () => {
		const player = makePlayer({ at: { x: 3, z: 4 }, facing: 6 });
		expect(player.state.position).toEqual({ x: 3, z: 4 });
		expect(player.state.facing).toBe(6);
		expect(player.state.moving).toBe(false);
	});

	it("Упёрся в прилавок: позиция не заходит внутрь прилавка", () => {
		const player = makePlayer({ stations: [counter("counter-1", 5, 4)], at: { x: 2, z: 4.5 }, facing: 2 });
		run(player, move(1, 0), 120);
		// Радиус повара 0.3, левая грань прилавка x = 5.
		expect(player.state.position.x).toBeCloseTo(4.7, 6);
		expect(player.state.position.z).toBeCloseTo(4.5, 6);
		expect(player.state.moving).toBe(false);
	});

	it("Скольжение вдоль стены: диагональ к стене продолжается вдоль неё", () => {
		// Стена вдоль z = 8..8.5, повар идёт вниз-вправо.
		const player = makePlayer({ colliders: [{ x: 0, z: 8, width: 10, depth: 0.5 }], at: { x: 2, z: 6 }, facing: 3 });
		const diagonal = Math.SQRT1_2;
		run(player, move(diagonal, diagonal), 120);
		expect(player.state.position.z).toBeCloseTo(7.7, 6);
		expect(player.state.position.x).toBeGreaterThan(2 + 3.6 * diagonal * 1);
		expect(player.state.moving).toBe(true);
		const xBefore = player.state.position.x;
		run(player, move(diagonal, diagonal), 30);
		// За полсекунды вдоль стены: скорость 3.6 умножить на компоненту вдоль стены.
		expect(player.state.position.x - xBefore).toBeCloseTo(3.6 * diagonal * 0.5, 4);
	});

	it("Диагональ: скорость по диагонали равна скорости по прямой", () => {
		const straight = makePlayer({ at: { x: 3, z: 5 } });
		const diagonal = makePlayer({ at: { x: 3, z: 5 } });
		run(straight, move(1, 0), 60);
		run(diagonal, move(Math.SQRT1_2, -Math.SQRT1_2), 60);
		const straightDistance = Math.hypot(straight.state.position.x - 3, straight.state.position.z - 5);
		const diagonalDistance = Math.hypot(diagonal.state.position.x - 3, diagonal.state.position.z - 5);
		expect(straightDistance).toBeCloseTo(3.6, 3);
		expect(diagonalDistance).toBeCloseTo(straightDistance, 6);
	});

	it("ненормированный ввод длиннее единицы не ускоряет повара", () => {
		const player = makePlayer({ at: { x: 3, z: 5 } });
		run(player, move(1, 1), 60);
		expect(Math.hypot(player.state.position.x - 3, player.state.position.z - 5)).toBeCloseTo(3.6, 3);
	});

	it("половинный ввод даёт половинную скорость", () => {
		const player = makePlayer({ at: { x: 3, z: 5 } });
		run(player, move(0.5, 0), 60);
		expect(player.state.position.x - 3).toBeCloseTo(1.8, 3);
	});

	it("повар не выходит за границу мира", () => {
		const player = makePlayer({ at: { x: 1, z: 1 } });
		run(player, move(-1, -1), 120);
		expect(player.state.position.x).toBeCloseTo(0.3, 6);
		expect(player.state.position.z).toBeCloseTo(0.3, 6);
	});

	it("стол и стулья из уровня непроходимы", () => {
		const level = createBlankLevel({ colliders: [{ x: 5, z: 0, width: 0.5, depth: 6 }] });
		const player = createPlayer({ level, geometry: buildGeometry(level) });
		run(player, move(1, 0), 300);
		expect(player.state.position.x).toBeLessThan(5);
	});
});

describe("повар: взгляд в восемь направлений", () => {
	it("точные векторы восьми направлений дают свои индексы", () => {
		for (let facing = 0; facing < 8; facing += 1) {
			const vector = FACING_VECTORS[facing];
			for (let current = 0; current < 8; current += 1) {
				expect(resolveFacing(current as Facing8, vector, 8)).toBe(facing);
			}
		}
	});

	it("Поворот к столу без движения: повар у прилавка смотрит на него, хотя не сдвигается", () => {
		// Повар вплотную к прилавку слева, смотрит вверх.
		const player = makePlayer({ stations: [counter("counter-1", 5, 4)], at: { x: 4.7, z: 4.5 }, facing: 0 });
		expect(player.getTarget()).toBeNull();
		run(player, move(1, 0), 10);
		expect(player.state.facing).toBe(2);
		expect(player.state.position.x).toBeCloseTo(4.7, 6);
		expect(player.state.moving).toBe(false);
		expect(player.getTarget()?.stationId).toBe("counter-1");
	});

	it("Взгляд сохраняется: после отпускания клавиш повар смотрит туда же", () => {
		const player = makePlayer({ at: { x: 5, z: 5 } });
		run(player, move(-1, 0), 5);
		expect(player.state.facing).toBe(6);
		run(player, EMPTY_INPUT, 120);
		expect(player.state.facing).toBe(6);
		expect(player.state.moving).toBe(false);
	});

	it("мёртвая зона: слабый ввод взгляд не меняет, но двигает", () => {
		const player = makePlayer({ at: { x: 5, z: 5 }, facing: 0 });
		run(player, move(0.1, 0), 10);
		expect(player.state.facing).toBe(0);
		expect(player.state.position.x).toBeGreaterThan(5);
	});

	it("Стик не дрожит на границе: колебания около границы секторов взгляд не переключают", () => {
		const player = makePlayer({ at: { x: 5, z: 5 }, facing: 0 });
		// Граница секторов 0 и 1 лежит на 22.5 градуса; колебания 18..27 градусов в пределах гистерезиса 8 (до 30.5).
		for (let index = 0; index < 40; index += 1) {
			player.step({ ...EMPTY_INPUT, moveVector: vectorAtAngle(index % 2 === 0 ? 18 : 27) }, SIM_STEP_SEC);
			expect(player.state.facing).toBe(0);
		}
		// Зашли за границу больше чем на гистерезис: переключились на соседний сектор.
		player.step({ ...EMPTY_INPUT, moveVector: vectorAtAngle(31) }, SIM_STEP_SEC);
		expect(player.state.facing).toBe(1);
		// Теперь колебания у той же границы с другой стороны тоже не возвращают взгляд.
		for (let index = 0; index < 40; index += 1) {
			player.step({ ...EMPTY_INPUT, moveVector: vectorAtAngle(index % 2 === 0 ? 20 : 27) }, SIM_STEP_SEC);
			expect(player.state.facing).toBe(1);
		}
		// Уход в другую сторону дальше гистерезиса возвращает взгляд.
		player.step({ ...EMPTY_INPUT, moveVector: vectorAtAngle(10) }, SIM_STEP_SEC);
		expect(player.state.facing).toBe(0);
	});

	it("резкий поворот на 180 градусов выбирает противоположное направление сразу", () => {
		const player = makePlayer({ at: { x: 5, z: 5 }, facing: 0 });
		run(player, move(0, 1), 1);
		expect(player.state.facing).toBe(4);
	});

	it("поворот работает по кругу через границу 359 и 0 градусов", () => {
		const player = makePlayer({ at: { x: 5, z: 5 }, facing: 7 });
		for (let index = 0; index < 20; index += 1) {
			player.step({ ...EMPTY_INPUT, moveVector: vectorAtAngle(index % 2 === 0 ? 350 : 5) }, SIM_STEP_SEC);
		}
		// 350 градусов это граница секторов 7 (315) и 0 (0, он же 360) около 337.5; 350 и 5 лежат в секторе 0.
		expect(player.state.facing).toBe(0);
	});
});

describe("повар: цель взаимодействия", () => {
	it("точка выбора лежит перед поваром на reach по направлению взгляда", () => {
		const player = makePlayer({ at: { x: 5, z: 5 }, facing: 2 });
		const probe = player.getProbePoint();
		expect(probe.x).toBeCloseTo(5.9, 9);
		expect(probe.z).toBeCloseTo(5, 9);
	});

	it("Нет цели: в пустое место цели нет", () => {
		const player = makePlayer({ stations: [counter("counter-1", 8, 8)], at: { x: 3, z: 3 }, facing: 0 });
		run(player, EMPTY_INPUT, 3);
		expect(player.getTarget()).toBeNull();
	});

	it("целью становится станция перед поваром, а не за спиной", () => {
		const player = makePlayer({
			stations: [counter("counter-up", 4.5, 3), counter("counter-down", 4.5, 6)],
			at: { x: 5, z: 5 },
			facing: 0,
		});
		expect(player.getTarget()?.stationId).toBe("counter-up");
		run(player, move(0, 1), 1);
		expect(player.getTarget()?.stationId).toBe("counter-down");
	});

	it("Угол двух прилавков: целью становится ближайший из них", () => {
		// Г-образный угол: A (x 3..5, z 3..4) и B (x 4..5, z 4..5). Повар слева снизу смотрит вверх-вправо в угол.
		const player = makePlayer({
			stations: [counter("counter-a", 3, 3, 2, 1), counter("counter-b", 4, 4)],
			at: { x: 3.2, z: 4.6 },
			facing: 1,
		});
		// Точка выбора (3.836, 3.964) лежит внутри A, до B 0.168.
		expect(player.getTarget()?.stationId).toBe("counter-a");
		expect(player.getTarget()?.distance).toBeCloseTo(0, 9);
	});

	it("Угол двух прилавков: при равных расстояниях выигрывает ближайший к телу", () => {
		const stations = [counter("counter-a", 2, 2), counter("counter-b", 3, 3)];
		const probe = { x: 3, z: 3 };
		const body = { x: 3.2, z: 2.7 };
		expect(pickTarget(stations, body, probe, 0.45)?.stationId).toBe("counter-a");
		expect(pickTarget([...stations].reverse(), body, probe, 0.45)?.stationId).toBe("counter-a");
	});

	it("допуск: станция дальше targetTolerance от точки выбора целью не является", () => {
		const stations = [counter("counter-1", 5, 5)];
		expect(pickTarget(stations, { x: 3, z: 5.5 }, { x: 4.6, z: 5.5 }, 0.45)?.stationId).toBe("counter-1");
		expect(pickTarget(stations, { x: 3, z: 5.5 }, { x: 4.5, z: 5.5 }, 0.45)).toBeNull();
	});

	it("Действие во время поворота: цель в новом направлении известна на том же шаге", () => {
		const player = makePlayer({
			stations: [counter("counter-left", 3.5, 4.5), counter("counter-right", 5.5, 4.5)],
			at: { x: 5, z: 5 },
			facing: 2,
		});
		expect(player.getTarget()?.stationId).toBe("counter-right");
		// Один шаг с вводом влево: взгляд и цель сменились сразу, без ожидания анимации.
		player.step(move(-1, 0), SIM_STEP_SEC);
		expect(player.state.facing).toBe(6);
		expect(player.getTarget()?.stationId).toBe("counter-left");
	});

	it("getTarget возвращает копию: изменение результата не портит состояние", () => {
		const player = makePlayer({ stations: [counter("counter-1", 4.5, 3)], at: { x: 5, z: 4.4 }, facing: 0 });
		const target = player.getTarget();
		expect(target).not.toBeNull();
		if (target) {
			target.stationId = "other";
		}
		expect(player.getTarget()?.stationId).toBe("counter-1");
	});
});
