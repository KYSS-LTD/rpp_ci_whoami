// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Rect } from "../../contracts";
import { maxPenetration, moveCircle, resolveCircle, type CollisionWorld } from "./collision";

const bounds: Rect = { x: 0, z: 0, width: 10, depth: 10 };

// Мир с одним прилавком 1 x 1 в точке (4, 4).
const counterWorld: CollisionWorld = { bounds, obstacles: [{ x: 4, z: 4, width: 1, depth: 1 }] };

describe("столкновения круга", () => {
	it("круг, идущий в грань, останавливается вплотную и не заходит внутрь", () => {
		let position = { x: 2, z: 4.5 };
		for (let step = 0; step < 200; step += 1) {
			position = moveCircle(position, { x: 0.06, z: 0 }, 0.3, counterWorld);
		}
		expect(position.x).toBeCloseTo(3.7, 6);
		expect(position.z).toBeCloseTo(4.5, 6);
		expect(maxPenetration(position, 0.3, counterWorld)).toBeLessThan(1e-6);
	});

	it("движение под углом скользит вдоль грани", () => {
		let position = { x: 2, z: 3 };
		// Вниз-вправо: упираемся в левую грань прилавка (x = 4) и скользим вниз вдоль неё (50 шагов, до низа грани z = 5).
		for (let step = 0; step < 50; step += 1) {
			position = moveCircle(position, { x: 0.04, z: 0.04 }, 0.3, counterWorld);
		}
		expect(position.x).toBeCloseTo(3.7, 6);
		expect(position.z).toBeCloseTo(5, 6);
	});

	it("круг огибает выпуклый угол плавно, без остановки", () => {
		let position = { x: 3.5, z: 3 };
		for (let step = 0; step < 200; step += 1) {
			position = moveCircle(position, { x: 0.03, z: 0.03 }, 0.3, counterWorld);
		}
		// Прошёл мимо угла вправо-вниз за прилавок.
		expect(position.x).toBeGreaterThan(5.5);
		expect(position.z).toBeGreaterThan(5.5);
	});

	it("граница мира не выпускает круг", () => {
		let position = { x: 1, z: 1 };
		for (let step = 0; step < 100; step += 1) {
			position = moveCircle(position, { x: -0.1, z: -0.1 }, 0.3, counterWorld);
		}
		expect(position.x).toBeCloseTo(0.3, 6);
		expect(position.z).toBeCloseTo(0.3, 6);
	});

	it("большой шаг не пропускает тонкую стену", () => {
		const thinWorld: CollisionWorld = { bounds, obstacles: [{ x: 5, z: 0, width: 0.5, depth: 10 }] };
		const position = moveCircle({ x: 4.5, z: 5 }, { x: 2, z: 0 }, 0.3, thinWorld);
		expect(position.x).toBeCloseTo(4.7, 6);
	});

	it("зажатый между двумя препятствиями круг не выходит за них", () => {
		const gapWorld: CollisionWorld = {
			bounds,
			obstacles: [
				{ x: 4, z: 3, width: 2, depth: 1 },
				{ x: 4, z: 4.5, width: 2, depth: 1 },
			],
		};
		// Зазор 0.5 уже диаметра 0.6: круг в него не пройдёт.
		let position = { x: 3, z: 4.25 };
		for (let step = 0; step < 100; step += 1) {
			position = moveCircle(position, { x: 0.05, z: 0 }, 0.3, gapWorld);
			expect(maxPenetration(position, 0.3, gapWorld)).toBeLessThan(1e-6);
		}
		expect(position.x).toBeLessThan(4);
	});

	it("resolveCircle выталкивает круг с центром внутри прямоугольника наружу через ближайшую грань", () => {
		const pushed = resolveCircle({ x: 4.2, z: 4.5 }, 0.3, counterWorld);
		expect(pushed.x).toBeCloseTo(3.7, 6);
		expect(pushed.z).toBeCloseTo(4.5, 6);
		expect(maxPenetration(pushed, 0.3, counterWorld)).toBeLessThan(1e-6);
	});
});
