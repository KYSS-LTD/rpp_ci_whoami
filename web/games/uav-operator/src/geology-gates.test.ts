import { DoubleSide, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { add_RockGates } from './geology-gates.js';
import { create_SceneryCollision } from './scenery-collision.js';
import { gate_Crossing } from './training-field.js';

describe('природные ворота', () => {
	it.each(['canyon', 'alpine'])('засчитывает всё видимое сечение арок карты %s', (id) => {
		const scene = new Scene();
		const collision = create_SceneryCollision();
		const gates = add_RockGates(
			scene,
			collision,
			() => 3,
			new MeshBasicMaterial({ side: DoubleSide }),
			id,
		);
		expect(gates).toHaveLength(3);
		for (const [index, gate] of gates.entries()) {
			const rock = scene.children[index];
			const toWorld = (x: number, y: number, z: number) =>
				rock.localToWorld(new Vector3(x, y, z));
			const scores = (x: number, y: number) =>
				gate_Crossing(gate, toWorld(x, y, 1), toWorld(x, y, -1));
			const pilotY = gate.height * 0.39;
			expect(scores(0, pilotY)).toBe(true);
			expect(
				collision.sweep(toWorld(0, pilotY, 10), toWorld(0, pilotY, -10), 0.22),
			).toBeNull();
			for (const side of [-1, 1]) {
				const center = toWorld(0, pilotY, 0);
				const direction = toWorld(side, pilotY, 0).sub(center).normalize();
				const [rim] = new Raycaster(center, direction).intersectObject(rock);
				expect(rim).toBeDefined();
				expect(scores(side * (rim.distance - 0.025), pilotY)).toBe(true);
				expect(scores(side * (rim.distance + 0.025), pilotY)).toBe(false);
				expect(scores(side * gate.width * 2, pilotY)).toBe(false);
			}
			expect(scores(0, gate.height + 12)).toBe(false);
			expect(gate_Crossing(gate, toWorld(0, pilotY, -1), toWorld(0, pilotY, 1))).toBe(false);
		}
	});
});
