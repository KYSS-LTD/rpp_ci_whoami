import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { create_ChaseCamera, create_TouchdownCamera } from "./flight-dynamics.js";
import { create_Acro, fpvKit } from "./fpv.js";

describe("камера сопровождения", () => {
	it("удерживает горизонт и курс при флипе и крене", () => {
		const drone = new Object3D();
		const camera = new PerspectiveCamera();
		const update = create_ChaseCamera(drone, new Vector3(), 2, () => false);
		const heading = .37;
		drone.rotation.set(0, heading, 0, "YXZ");
		update(camera, heading, 0, 0);
		const initialOffset = camera.position.clone();
		const initialRotation = camera.quaternion.clone();
		for (const [pitch, roll] of [[.65, 0], [Math.PI / 2, 0], [Math.PI, 0], [Math.PI * 1.5, 0], [0, Math.PI]]) {
			drone.position.add(new Vector3(1, 2, -3));
			drone.rotation.set(pitch, heading, roll, "YXZ");
			update(camera, heading, 0, 1 / 60);
			expect(camera.position.clone().sub(drone.position).distanceTo(initialOffset)).toBeLessThan(1e-6);
			expect(camera.quaternion.angleTo(initialRotation)).toBeLessThan(1e-6);
		}
	});

	it("поднимает взгляд без изменения дистанции и сокращает подвес у препятствия", () => {
		const drone = new Object3D();
		const camera = new PerspectiveCamera(60);
		let blocked = false;
		const update = create_ChaseCamera(drone, new Vector3(), 2, (_x: number, _y: number, z: number) => blocked && z > .95);
		update(camera, 0, -25, 0, true);
		const down = camera.getWorldDirection(new Vector3()).y;
		update(camera, 0, 25, 0, true);
		expect(camera.getWorldDirection(new Vector3()).y).toBeGreaterThan(down);
		expect(camera.position.length()).toBeCloseTo(2);
		expect(camera.fov).toBe(60);
		blocked = true;
		update(camera, 0, 25, 1 / 60);
		expect(camera.position.z).toBeLessThanOrEqual(.95);
		const before = camera.position.length();
		blocked = false;
		update(camera, 0, 25, 1 / 60);
		expect(camera.position.length()).toBeGreaterThan(before);
		expect(camera.position.length()).toBeLessThan(2);
	});
});

describe("камера при посадке", () => {
	it.each([30, 60])("плавно меняет позицию и наклон при %i кадрах в секунду", (fps) => {
		const camera = new PerspectiveCamera();
		camera.position.set(0, 2, 1);
		camera.rotateZ(.7);
		const beforeLanding = camera.quaternion.clone();
		const touchdown = create_TouchdownCamera(camera);
		const restingPosition = new Vector3(0, 1, 2);
		const restingRotation = new Quaternion();
		const frame = (delta: number) => {
			camera.position.copy(restingPosition);
			camera.quaternion.copy(restingRotation);
			return touchdown.settle(delta);
		};
		touchdown.start();
		expect(frame(0)).toBe(false);
		expect(camera.position.toArray()).toEqual([0, 2, 1]);
		expect(camera.quaternion.angleTo(beforeLanding)).toBeCloseTo(0);
		for (let index = 0; index < Math.ceil(.35 * fps) - 1; index++) {
			const distance = camera.position.distanceTo(restingPosition);
			const angle = camera.quaternion.angleTo(restingRotation);
			expect(frame(1 / fps)).toBe(false);
			expect(camera.position.distanceTo(restingPosition)).toBeLessThan(distance);
			expect(camera.quaternion.angleTo(restingRotation)).toBeLessThan(angle);
		}
		expect(frame(1 / fps)).toBe(true);
		expect(camera.position.toArray()).toEqual(restingPosition.toArray());
		expect(camera.quaternion.angleTo(restingRotation)).toBeCloseTo(0);
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
