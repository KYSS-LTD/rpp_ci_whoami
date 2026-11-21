import { MathUtils, Vector3 } from 'three';

export function create_ChaseCamera(drone, center, distance) {
	const target = new Vector3();
	const nose = new Vector3();
	const horizon = new Vector3(0, 1, 0);
	const elevation = Math.atan(.25);
	const minPitch = -.42;
	const maxPitch = .42;
	return (camera, heading, grounded, groundAt) => {
		drone.localToWorld(target.copy(center));
		nose.set(0, 0, -1).applyQuaternion(drone.quaternion);
		const pitch = grounded ? 0 : Math.asin(MathUtils.clamp(nose.y, -1, 1));
		// Камера остаётся за носом даже при пикировании, горизонт не вращается вместе с дроном.
		const angle = MathUtils.clamp(pitch - elevation, minPitch - elevation, maxPitch - elevation);
		const horizontal = distance * Math.cos(angle);
		camera.up.copy(horizon);
		camera.position.set(target.x + Math.sin(heading) * horizontal,
			target.y - Math.sin(angle) * distance, target.z + Math.cos(heading) * horizontal);
		camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, camera.position.z) + .12);
		camera.lookAt(target);
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
