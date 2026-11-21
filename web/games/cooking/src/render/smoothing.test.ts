// @vitest-environment node
// Тесты сглаживания (задача 6.6): поворот идёт по кратчайшей дуге и плавно, позиция переносится сразу только при скачке.
import { describe, expect, it } from "vitest";
import { approachAngle, approachPosition, shortestAngleDelta, wrapAngle } from "./smoothing";

describe("углы", () => {
	it("wrapAngle приводит угол к диапазону [-PI, PI)", () => {
		expect(wrapAngle(0)).toBeCloseTo(0);
		expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
		expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
	});

	it("кратчайшая дуга выбирается через границу в PI", () => {
		// От 170 до -170 градусов кратчайший путь 20 градусов вперёд, а не 340 назад.
		const delta = shortestAngleDelta((170 * Math.PI) / 180, (-170 * Math.PI) / 180);
		expect(delta).toBeCloseTo((20 * Math.PI) / 180);
	});

	it("поворот на 180 градусов плавный: за короткий кадр угол сдвигается, но не достигает цели", () => {
		// Направление при ровно 180 градусах произвольно (выбирается одно), важно, что шаг ненулевой и меньше полуоборота.
		const target = Math.PI;
		const next = approachAngle(0, target, 1 / 60, 14);
		expect(Math.abs(next)).toBeGreaterThan(0);
		expect(Math.abs(next)).toBeLessThan(target);
	});

	it("угол сходится к цели, не перескакивая её", () => {
		let angle = 0;
		for (let frame = 0; frame < 180; frame += 1) {
			angle = approachAngle(angle, Math.PI * 0.75, 1 / 60, 14);
			expect(angle).toBeLessThanOrEqual(Math.PI * 0.75 + 1e-9);
		}
		expect(angle).toBeCloseTo(Math.PI * 0.75, 3);
	});

	it("результат не зависит от разбиения времени на кадры", () => {
		const oneFrame = approachAngle(0, 2, 0.1, 10);
		let split = 0;
		for (let index = 0; index < 10; index += 1) {
			split = approachAngle(split, 2, 0.01, 10);
		}
		expect(split).toBeCloseTo(oneFrame, 2);
	});
});

describe("позиция", () => {
	it("малое смещение сглаживается", () => {
		const next = approachPosition({ x: 0, z: 0 }, { x: 0.1, z: 0 }, 1 / 60, 30, 1.5);
		expect(next.x).toBeGreaterThan(0);
		expect(next.x).toBeLessThan(0.1);
	});

	it("скачок дальше порога (посадка, появление) переносится сразу", () => {
		expect(approachPosition({ x: 0, z: 0 }, { x: 5, z: 5 }, 1 / 60, 30, 1.5)).toEqual({ x: 5, z: 5 });
	});
});
