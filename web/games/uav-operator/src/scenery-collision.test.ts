import { BoxGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, TorusGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { create_SceneryCollision } from "./scenery-collision.js";

describe("столкновения с декорациями", () => {
	it("пропускает дрон через отверстие, ловит касание внутренней кромки", () => {
		const arch = new Mesh(new TorusGeometry(2, .5, 16, 48));
		const group = new Group();
		group.add(arch);
		group.rotation.y = .7;
		group.scale.set(1.5, 2, .75);
		group.position.set(-11, 4, 7);
		const collision = create_SceneryCollision();
		collision.add(group);
		const pass = (x: number, radius: number) => collision.sweep(
			arch.localToWorld(new Vector3(x, 0, -20)),
			arch.localToWorld(new Vector3(x, 0, 20)), radius);
		expect(pass(0, .2)).toBeNull();
		expect(pass(1.35, .1)).toBeNull();
		expect(pass(1.45, .18)).not.toBeNull();
		expect(pass(2, .1)?.time).toBeLessThan(.5);
	});

	it("останавливает пролёт за один шаг в обе стороны через тонкую поверхность", () => {
		const collision = create_SceneryCollision();
		collision.add(new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial({ side: DoubleSide })));
		for (const side of [-1, 1]) {
			const hit = collision.sweep(new Vector3(0, 0, side * 20), new Vector3(0, 0, -side * 20), .25);
			expect(hit?.time).toBeCloseTo(19.75 / 40, 8);
			expect(hit?.normal.z).toBeCloseTo(side, 8);
		}
		const nearVertex = collision.sweep(new Vector3(1.12, 1.12, 20), new Vector3(1.12, 1.12, -20), .2);
		expect(nearVertex?.time).toBeCloseTo((20 - Math.sqrt(.2 ** 2 - 2 * .12 ** 2)) / 40, 7);
		expect(collision.sweep(new Vector3(1.15, 1.15, 20), new Vector3(1.15, 1.15, -20), .2)).toBeNull();
	});

	it("учитывает матрицы экземпляров и возвращает первое столкновение по пути", () => {
		const slabs = new InstancedMesh(new BoxGeometry(4, 4, .1), new MeshBasicMaterial(), 2);
		slabs.position.x = 16;
		slabs.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, -8));
		slabs.setMatrixAt(1, new Matrix4().makeTranslation(0, 0, 8));
		const collision = create_SceneryCollision();
		collision.add(slabs);
		const sweep = (x: number) => collision.sweep(new Vector3(x, 0, 20), new Vector3(x, 0, -20), .25);
		expect(sweep(16)?.time).toBeCloseTo((20 - 8.3) / 40);
		expect(sweep(0)).toBeNull();
	});

	it("позволяет отойти от стены после контакта", () => {
		const collision = create_SceneryCollision();
		collision.add(new Mesh(new PlaneGeometry(4, 4).toNonIndexed()));
		const touching = new Vector3(0, 0, .2);
		expect(collision.sweep(touching, new Vector3(0, 0, -.2), .2)?.time).toBe(0);
		expect(collision.sweep(touching, new Vector3(0, 0, 1), .2)).toBeNull();
	});
});
