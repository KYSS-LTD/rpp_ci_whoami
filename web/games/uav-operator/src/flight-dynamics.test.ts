import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { create_ChaseCamera } from "./flight-dynamics.js";
import { create_Acro, fpvKit } from "./fpv.js";

describe("камера сопровождения", () => {
	it("сохраняет позицию и ракурс в координатах дрона при крене, повороте и перевороте", () => {
		const world = new Object3D();
		const drone = new Object3D();
		world.add(drone);
		world.rotation.y = .4;
		const camera = new PerspectiveCamera(65, 1.5, .07, 620);
		const center = new Vector3(0, .1, 0);
		const update = create_ChaseCamera(drone, center, 2);
		update(camera);
		const localPosition = () => drone.worldToLocal(camera.position.clone());
		const localRotation = () => drone.getWorldQuaternion(new Quaternion()).invert().multiply(camera.quaternion);
		const initialPosition = localPosition();
		const initialRotation = localRotation();
		for (const [x, y, yaw, pitch, roll] of [[0, 12, 0, 0, 0], [-4, 5, Math.PI / 2, -.7, .9], [2, .2, -1, 1.25, Math.PI]]) {
			drone.position.set(x, y, -2);
			drone.rotation.set(pitch, yaw, roll, "YXZ");
			update(camera);
			camera.updateMatrixWorld();
			const target = drone.localToWorld(center.clone());
			const screen = target.clone().project(camera);
			expect(screen.x).toBeCloseTo(0, 8);
			expect(screen.y).toBeCloseTo(0, 8);
			expect(localPosition().distanceTo(initialPosition)).toBeCloseTo(0, 8);
			expect(localRotation().angleTo(initialRotation)).toBeLessThan(1e-6);
		}
	});
});

describe("касание земли в акрорежиме", () => {
	it("стабилизирует дрон с повреждениями на земле и позволяет взлететь снова", () => {
		const acro = create_Acro(false, fpvKit);
		const axes = { x: 0, y: 0, z: 0, yaw: 0 };
		const groundAt = () => 0;
		const motion = { x: 0, y: 2, z: 0, height: 2, heading: .4, vx: 0, vz: 0 };
		const damage = { rollBias: .4, pitchBias: .2, thrust: .8 };
		acro.reset(motion.heading);
		acro.velocity.y = -4;
		for (let frame = 0; frame < 150; frame++) acro.update(1 / 60, motion, axes, 20, groundAt, damage);
		const grounded = acro.attitude.clone();
		expect(motion.height).toBeCloseTo(.72);
		expect(new Vector3(0, 1, 0).applyQuaternion(grounded).y).toBeCloseTo(1);
		for (let frame = 0; frame < 120; frame++) acro.update(1 / 60, motion, axes, 20, groundAt, damage);
		expect(acro.attitude.angleTo(grounded)).toBeCloseTo(0);
		for (let frame = 0; frame < 30; frame++) acro.update(1 / 60, motion, { ...axes, y: 1 }, 20, groundAt, damage);
		expect(motion.height).toBeGreaterThan(.9);
	});
});
