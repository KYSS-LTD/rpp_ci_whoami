import { MathUtils, Quaternion, Vector3 } from 'three';

export function create_ChaseCamera(drone, center, distance, obstructed, groundAt = () => -Infinity, collision) {
	const target = new Vector3();
	const boom = new Vector3();
	const sample = new Vector3();
	const attitude = new Quaternion();
	let yaw;
	let viewPitch;
	let clearance = 1;
	return (camera, heading, tilt, delta, immediate = false) => {
		const pitch = MathUtils.degToRad(tilt);
		const blend = yaw === undefined || immediate ? 1 : -Math.expm1(-12 * delta);
		drone.getWorldQuaternion(attitude);
		// Выделяем поворот вокруг мировой вертикали. В верхней точке флипа удерживаем предыдущий курс.
		const course = Math.hypot(attitude.y, attitude.w) > .28 ? 2 * Math.atan2(attitude.y, attitude.w) : yaw ?? heading;
		const turn = MathUtils.euclideanModulo(course - (yaw ?? heading) + Math.PI, 2 * Math.PI) - Math.PI;
		yaw = MathUtils.euclideanModulo((yaw ?? heading) + turn * blend + Math.PI, 2 * Math.PI) - Math.PI;
		viewPitch = MathUtils.lerp(viewPitch ?? pitch, pitch, blend);
		const elevation = .28 - viewPitch * .55;
		// Подвес следует за курсом, сохраняя горизонт при крене и переворотах.
		drone.localToWorld(target.copy(center));
		boom.set(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation)).multiplyScalar(distance);
		// Оставляем зазор для камеры у земли, даже когда игрок поднимает взгляд со стартовой площадки.
		boom.y = Math.max(boom.y, groundAt(target.x + boom.x, target.z + boom.z) + .28 - target.y);
		const meshHit = collision?.sweep(target, sample.copy(target).add(boom), .1);
		let available = meshHit ? Math.max(.001, meshHit.time - .002) : 1;
		for (let step = 1; step <= 12; step++) {
			const fraction = step / 12;
			if (fraction > available) break;
			sample.copy(target).addScaledVector(boom, fraction);
			if (sample.y < groundAt(sample.x, sample.z) + fraction * .13 || obstructed?.(sample.x, sample.y, sample.z)) {
				available = Math.min(available, Math.max(.12, (step - 1) / 12));
				break;
			}
		}
		clearance = Math.min(available, MathUtils.lerp(clearance, available, blend));
		camera.position.copy(target).addScaledVector(boom, clearance);
		camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, camera.position.z) + .16);
		camera.lookAt(target);
		camera.rotateX(.07 + viewPitch * .48);
	};
}

export function create_TouchdownCamera(camera) {
	const duration = .35;
	const position = new Vector3();
	const rotation = new Quaternion();
	let remaining = 0;
	return {
		start() {
			position.copy(camera.position);
			rotation.copy(camera.quaternion);
			remaining = duration;
		},
		settle(delta) {
			remaining -= delta;
			if (remaining <= Number.EPSILON) {
				remaining = 0;
				return true;
			}
			const weight = MathUtils.smoothstep(remaining, 0, duration);
			camera.position.lerp(position, weight);
			camera.quaternion.slerp(rotation, weight);
			return false;
		},
	};
}

export function signal_AtEdge(x, z, bounds) {
	const clearance = Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
	return 1 - MathUtils.smoothstep(clearance, -19, 12);
}

export function create_Damage(mass, propGuards = false) {
	const propellers = [1, 1, 1, 1];
	return {
		propellers, hull: 1,
		get thrust() {
			return (.35 + .65 * this.hull) * propellers.reduce((sum, prop) => sum + prop, 0) / 4;
		},
		get rollBias() {
			return (propellers[0] + propellers[1] - propellers[2] - propellers[3]) * .42;
		},
		get pitchBias() {
			return (propellers[0] + propellers[2] - propellers[1] - propellers[3]) * .42;
		},
		get disabled() {
			return this.hull <= .18 || this.thrust < .39;
		},
		impact(speed, upright, sector) {
			const severity = speed * Math.pow(mass / .249, .22);
			const protectedProp = propGuards ? 1.8 : 0;
			const propDamage = MathUtils.clamp((severity + (1 - upright) * 2.8 - 3.2 - protectedProp) / 12, 0, 1);
			const hullDamage = MathUtils.clamp((severity - 5.8) / 15, 0, .92);
			if (propDamage <= .02 && hullDamage <= .02) return false;
			propellers[sector] = Math.max(0, propellers[sector] - propDamage);
			this.hull = Math.max(0, this.hull - hullDamage);
			return true;
		},
	};
}
