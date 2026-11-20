import * as THREE from 'three';

export const fpvKit = {
	name: 'AeroLab F5', mass: .64, cells: 6, capacity: 1100, maxThrust: 28, cameraTilt: 14,
};

const gravity = 9.81;
const hover = Math.sqrt(gravity * fpvKit.mass / fpvKit.maxThrust);
const step = 1 / 120;

export function create_Acro() {
	const attitude = new THREE.Quaternion();
	const rates = new THREE.Vector3();
	const filtered = new THREE.Vector3();
	const inputs = new THREE.Vector3();
	const localRotation = new THREE.Euler(0, 0, 0, 'YXZ');
	const increment = new THREE.Quaternion();
	const acceleration = new THREE.Vector3();
	const velocity = new THREE.Vector3();
	const forward = new THREE.Vector3();
	let motor = 0;
	let remaining = 0;
	let charge = fpvKit.capacity;
	const shape = value => .72 * value + .28 * value ** 3;
	return {
		attitude, velocity, throttle: 0, voltage: fpvKit.cells * 4.2, used: 0,
		reset(heading) {
			attitude.setFromEuler(localRotation.set(0, heading, 0));
			velocity.set(0, 0, 0);
			rates.set(0, 0, 0);
			filtered.set(0, 0, 0);
			remaining = motor = this.throttle = 0;
		},
		update(delta, motion, axes, filter, groundAt, limits) {
			const targetThrottle = THREE.MathUtils.clamp(hover + axes.y * (axes.y > 0 ? .235 : .32), 0, 1);
			inputs.set(shape(axes.z) * 2.05, -shape(axes.yaw) * 1.65, -shape(axes.x) * 2.35);
			let hit = 0;
			remaining += delta;
			while (remaining >= step) {
				remaining -= step;
				filtered.lerp(inputs, 1 - Math.exp(-2 * Math.PI * filter * step));
				rates.lerp(filtered, 1 - Math.exp(-step / .045));
				attitude.multiply(increment.setFromEuler(localRotation.set(rates.x * step, rates.y * step, rates.z * step))).normalize();
				motor = THREE.MathUtils.damp(motor, targetThrottle, 14, step);
				const thrust = fpvKit.maxThrust * motor ** 2 / fpvKit.mass;
				acceleration.set(0, thrust, 0).applyQuaternion(attitude);
				acceleration.y -= gravity;
				acceleration.addScaledVector(velocity, -.17 - .026 * velocity.length());
				velocity.addScaledVector(acceleration, step);
				const x = THREE.MathUtils.clamp(motion.x + velocity.x * step, limits.minX, limits.maxX);
				const z = THREE.MathUtils.clamp(motion.z + velocity.z * step, limits.minZ, limits.maxZ);
				const floor = groundAt(x, z) + .72;
				let y = motion.y + velocity.y * step;
				if (y > floor + 64) {
					y = floor + 64;
					velocity.y = Math.min(0, velocity.y);
				}
				const onGround = y <= floor;
				if (onGround && motion.height > .7201) hit = Math.max(hit, velocity.length());
				if (onGround || (x === limits.minX && velocity.x < 0) || (x === limits.maxX && velocity.x > 0)) velocity.x = onGround ? velocity.x * .78 : 0;
				if (onGround || (z === limits.minZ && velocity.z < 0) || (z === limits.maxZ && velocity.z > 0)) velocity.z = onGround ? velocity.z * .78 : 0;
				motion.x = x;
				motion.z = z;
				motion.y = Math.max(floor, y);
				motion.height = motion.y - floor + .72;
				if (onGround && velocity.y < 0) velocity.y = 0;
			}
			forward.set(0, 0, -1).applyQuaternion(attitude);
			motion.heading = Math.atan2(-forward.x, -forward.z);
			motion.vx = velocity.x;
			motion.vz = velocity.z;
			this.throttle = motor;
			return hit;
		},
		power(delta, throttle) {
			const current = .48 + 39 * throttle ** 2.6;
			charge = Math.max(0, charge - current * delta * 1000 / 3600);
			const state = charge / fpvKit.capacity;
			this.voltage = fpvKit.cells * (3.29 + .91 * state ** .67) - current * .047;
			this.used = fpvKit.capacity - charge;
			return state * 100;
		},
	};
}
