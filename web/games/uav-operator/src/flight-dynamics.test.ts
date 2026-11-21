import { Object3D, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { create_ChaseCamera } from "./flight-dynamics.js";
import { create_Acro, fpvKit } from "./fpv.js";

describe("камера сопровождения", () => {
	it("поворачивается за носом и держит дрон в центре при снижении и боковом движении", () => {
		const drone = new Object3D();
		const camera = new PerspectiveCamera(65, 1.5, .07, 620);
		const center = new Vector3(0, .1, 0);
		const update = create_ChaseCamera(drone, center, 2);
		for (const [x, y, yaw, pitch] of [[0, 12, 0, 0], [-4, 5, Math.PI / 2, -.36], [2, 1, -1, .22]]) {
			drone.position.set(x, y, -2);
			drone.rotation.set(pitch, yaw, .18, "YXZ");
			update(camera, yaw, false, () => 0);
			camera.updateMatrixWorld();
			const target = drone.localToWorld(center.clone());
			const screen = target.clone().project(camera);
			const offset = camera.position.clone().sub(target);
			expect(screen.x).toBeCloseTo(0, 8);
			expect(screen.y).toBeCloseTo(0, 8);
			expect(offset.dot(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)))).toBeGreaterThan(0);
			expect(offset.length()).toBeCloseTo(2);
		}
	});

	it("удерживает один ракурс на земле при изменении наклона модели", () => {
		const drone = new Object3D();
		const camera = new PerspectiveCamera();
		const update = create_ChaseCamera(drone, new Vector3(), 1.5);
		update(camera, .4, true, () => 0);
		const landed = camera.quaternion.clone();
		drone.rotation.x = -1;
		update(camera, .4, true, () => 0);
		expect(camera.quaternion.angleTo(landed)).toBeCloseTo(0);
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
