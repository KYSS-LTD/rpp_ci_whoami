import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

export function create_ChaseCamera(drone, center, distance) {
	const mountPosition = new Vector3(0, .25, 1).setLength(distance).add(center);
	const mountRotation = new Quaternion().setFromRotationMatrix(
		new Matrix4().lookAt(mountPosition, center, new Vector3(0, 1, 0)),
	);
	return (camera) => {
		drone.localToWorld(camera.position.copy(mountPosition));
		drone.getWorldQuaternion(camera.quaternion).multiply(mountRotation);
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
