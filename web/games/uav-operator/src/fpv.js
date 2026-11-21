import * as THREE from 'three';

export const fpvKit = {
	name: 'AeroLab F5', mass: .64, cells: 6, capacity: 1100, maxThrust: 28, cameraTilt: 14,
};

const gravity = 9.81;
const step = 1 / 120;

export function create_Acro(angleMode = false, kit = fpvKit) {
	const hover = Math.sqrt(gravity * kit.mass / kit.maxThrust);
	const attitude = new THREE.Quaternion();
	const rates = new THREE.Vector3();
	const filtered = new THREE.Vector3();
	const inputs = new THREE.Vector3();
	const localRotation = new THREE.Euler(0, 0, 0, 'YXZ');
	const tilt = new THREE.Euler(0, 0, 0, 'YXZ');
	const increment = new THREE.Quaternion();
	const acceleration = new THREE.Vector3();
	const velocity = new THREE.Vector3();
	const forward = new THREE.Vector3();
	let motor = 0;
	let remaining = 0;
	let charge = kit.capacity;
	const shape = value => .72 * value + .28 * value ** 3;
	function update_Heading(motion) {
		forward.set(0, 0, -1).applyQuaternion(attitude);
		if (Math.hypot(forward.x, forward.z) > .05) motion.heading = Math.atan2(-forward.x, -forward.z);
	}
	return {
		attitude, velocity, throttle: 0, voltage: kit.cells * 4.2, used: 0, impactUpright: 1,
		reset(heading) {
			attitude.setFromEuler(localRotation.set(0, heading, 0));
			velocity.set(0, 0, 0);
			rates.set(0, 0, 0);
			filtered.set(0, 0, 0);
			remaining = motor = this.throttle = 0;
		},
		update(delta, motion, axes, filter, groundAt, damage, powered = true) {
			const agility = kit.agility ?? 1;
			const baseThrottle = THREE.MathUtils.clamp(hover + axes.y * (axes.y > 0 ? .235 : .32), 0, 1);
			inputs.set(shape(axes.z) * 2.05 * agility, -shape(axes.yaw) * 1.65 * agility, -shape(axes.x) * 2.35 * agility);
			let hit = 0;
			this.impactUpright = 1;
			remaining += delta;
			while (remaining >= step) {
				remaining -= step;
				const grounded = motion.height <= .7201;
				if (grounded) {
					motor = THREE.MathUtils.damp(motor, powered ? baseThrottle : 0, kit.motorResponse ?? 14, step);
					const lift = kit.maxThrust * motor ** 2 * damage.thrust / kit.mass - gravity;
					if (axes.y > 0 && lift > 0) {
						velocity.y = lift * step;
						motion.y += velocity.y * step;
						motion.height += velocity.y * step;
					}
					continue;
				}
				let targetThrottle = baseThrottle;
				if (angleMode) {
					tilt.setFromQuaternion(attitude);
					// На обычном уровне стик задаёт наклон до 32 градусов; тяга частично компенсирует крен.
					inputs.x = (axes.z * .56 - tilt.x) * 3.2;
					inputs.z = (-axes.x * .56 - tilt.z) * 3.2;
					const vertical = Math.max(.55, Math.cos(tilt.x) * Math.cos(tilt.z));
					targetThrottle = Math.min(1, baseThrottle / vertical ** .32);
				}
				inputs.x += damage.pitchBias;
				inputs.z += damage.rollBias;
				filtered.lerp(inputs, 1 - Math.exp(-2 * Math.PI * filter * step));
				if (!angleMode) {
					inputs.x -= damage.pitchBias;
					inputs.z -= damage.rollBias;
				}
				rates.lerp(filtered, 1 - Math.exp(-step / .045));
				attitude.multiply(increment.setFromEuler(localRotation.set(rates.x * step, rates.y * step, rates.z * step))).normalize();
				motor = THREE.MathUtils.damp(motor, powered ? targetThrottle : 0, kit.motorResponse ?? 14, step);
				const thrust = kit.maxThrust * motor ** 2 * damage.thrust / kit.mass;
				acceleration.set(0, thrust, 0).applyQuaternion(attitude);
				acceleration.y -= gravity;
				acceleration.addScaledVector(velocity, -.17 - (kit.drag ?? .026) * velocity.length());
				velocity.addScaledVector(acceleration, step);
				const speed = Math.hypot(velocity.x, velocity.z);
				const cap = kit.maxSpeed ?? Infinity;
				if (speed > cap) {
					velocity.x *= cap / speed;
					velocity.z *= cap / speed;
				}
				const x = motion.x + velocity.x * step;
				const z = motion.z + velocity.z * step;
				const floor = groundAt(x, z) + .72;
				let y = motion.y + velocity.y * step;
				if (y > floor + 64) {
					y = floor + 64;
					velocity.y = Math.min(0, velocity.y);
				}
				const onGround = y <= floor;
				motion.x = x;
				motion.z = z;
				motion.y = Math.max(floor, y);
				motion.height = motion.y - floor + .72;
				if (onGround) {
					const impact = Math.hypot(velocity.y, velocity.x * .5, velocity.z * .5);
					if (impact > hit) {
						hit = impact;
						this.impactUpright = 1 - 2 * (attitude.x ** 2 + attitude.z ** 2);
					}
					update_Heading(motion);
					attitude.setFromEuler(localRotation.set(0, motion.heading, 0));
					rates.set(0, 0, 0);
					filtered.set(0, 0, 0);
					velocity.set(0, 0, 0);
				}
			}
			update_Heading(motion);
			motion.vx = velocity.x;
			motion.vz = velocity.z;
			this.throttle = motor;
			return hit;
		},
		power(delta, throttle) {
			const current = .04 + (kit.peakCurrent ?? 39) * throttle ** 2.6;
			charge = Math.max(0, charge - current * delta * 1000 / 3600);
			const state = charge / kit.capacity;
			this.voltage = kit.cells * (3.29 + .91 * state ** .67) - current * .047;
			this.used = kit.capacity - charge;
			return state * 100;
		},
	};
}
