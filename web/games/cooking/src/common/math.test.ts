// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FACING_VECTORS } from "../contracts";
import {
	clamp,
	distancePointToRect,
	facingToYaw,
	isOnGrid,
	normalizeFacing,
	rectCenter,
	rectContainsPoint,
	rectInside,
	rectsOverlap,
	vectorToNearestFacing,
	vectorToYaw,
} from "./math";

describe("общая математика", () => {
	it("центр и вхождение точки в прямоугольник", () => {
		const rect = { x: 1, z: 2, width: 2, depth: 1 };
		expect(rectCenter(rect)).toEqual({ x: 2, z: 2.5 });
		expect(rectContainsPoint(rect, { x: 2, z: 2.5 })).toBe(true);
		expect(rectContainsPoint(rect, { x: 3.5, z: 2.5 })).toBe(false);
	});

	it("касание сторонами не считается пересечением", () => {
		const first = { x: 0, z: 0, width: 1, depth: 1 };
		expect(rectsOverlap(first, { x: 1, z: 0, width: 1, depth: 1 })).toBe(false);
		expect(rectsOverlap(first, { x: 0.5, z: 0.5, width: 1, depth: 1 })).toBe(true);
		expect(rectInside(first, { x: 0, z: 0, width: 2, depth: 2 })).toBe(true);
	});

	it("расстояние от точки до прямоугольника", () => {
		const rect = { x: 0, z: 0, width: 1, depth: 1 };
		expect(distancePointToRect({ x: 0.5, z: 0.5 }, rect)).toBe(0);
		expect(distancePointToRect({ x: 2, z: 0.5 }, rect)).toBe(1);
		expect(distancePointToRect({ x: 2, z: 2 }, rect)).toBeCloseTo(Math.SQRT2);
	});

	it("кратность шагу сетки и ограничение числа", () => {
		expect(isOnGrid(3.5)).toBe(true);
		expect(isOnGrid(3.25)).toBe(false);
		expect(clamp(5, 0, 1)).toBe(1);
	});

	it("направления взгляда: индексы, векторы и углы согласованы", () => {
		expect(normalizeFacing(8)).toBe(0);
		expect(normalizeFacing(-1)).toBe(7);
		for (let index = 0; index < FACING_VECTORS.length; index += 1) {
			expect(vectorToNearestFacing(FACING_VECTORS[index])).toBe(index);
			expect(facingToYaw(normalizeFacing(index))).toBeCloseTo(vectorToYaw(FACING_VECTORS[index]));
		}
		// Вверх по экрану (-z) это yaw=PI, вправо (+x) это yaw=PI/2, вниз (+z) это yaw=0.
		expect(facingToYaw(0)).toBeCloseTo(Math.PI);
		expect(facingToYaw(2)).toBeCloseTo(Math.PI / 2);
		expect(facingToYaw(4)).toBeCloseTo(0);
	});
});
