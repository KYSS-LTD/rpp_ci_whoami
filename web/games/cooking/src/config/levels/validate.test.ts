// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTestLevel } from "../../sim/testing/testLevel";
import { findUnreachableTargets } from "./reachability";
import { validateLevelConfig } from "./validate";

describe("проверка данных уровня", () => {
	it("тестовая фикстура проходит структурную проверку", () => {
		expect(validateLevelConfig(createTestLevel())).toEqual([]);
	});

	it("находит пересечение объектов и точку внутри препятствия", () => {
		const level = createTestLevel();
		level.stations[0] = { ...level.stations[0], rect: { x: 1.5, z: 0.5, width: 1, depth: 1 } };
		level.chefStart = { position: { x: 3.5, z: 4.5 }, facing: 0 };
		const problems = validateLevelConfig(level);
		expect(problems.some((problem) => problem.includes("пересечение"))).toBe(true);
		expect(problems.some((problem) => problem.includes("chefStart"))).toBe(true);
	});

	it("находит координаты вне сетки", () => {
		const level = createTestLevel();
		level.stations[1] = { ...level.stations[1], rect: { x: 2.25, z: 0.5, width: 1, depth: 1 } };
		expect(validateLevelConfig(level).some((problem) => problem.includes("кратны"))).toBe(true);
	});

	it("из начальной точки повара и из точки ожидания официанта достижимы все цели фикстуры", () => {
		const level = createTestLevel();
		expect(findUnreachableTargets(level, level.chefStart.position)).toEqual([]);
		expect(findUnreachableTargets(level, level.waiters.waitPoints[0])).toEqual([]);
	});

	it("находит недостижимую цель, если проход закрыт", () => {
		const level = createTestLevel();
		// Закрываем проход между кухней и залом: из кухни зал недостижим.
		level.props = level.props.map((prop) => (prop.id === "wall-divider-passage" ? { ...prop, blocking: true } : prop));
		expect(findUnreachableTargets(level, level.chefStart.position).length).toBeGreaterThan(0);
	});
});
