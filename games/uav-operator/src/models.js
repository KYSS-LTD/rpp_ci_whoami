import * as THREE from 'three';

export const palette = {
	ink: 0x202825, shell: 0xe2e6d8, lime: 0xcaff55, dark: 0x39433c,
	metal: 0x79877f, glass: 0x295379, timber: 0xb98558, white: 0xffedce,
	coral: 0xfc785a, mint: 0x64d5a8, blue: 0x68b2f7,
};

const materials = new Map();
const cubes = new Map();
const cylinders = new Map();

export function material(color) {
	if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .78 }));
	return materials.get(color);
}

function mesh(geometry, color, parent, x, y, z) {
	const object = new THREE.Mesh(geometry, material(color));
	object.position.set(x, y, z);
	object.castShadow = true;
	object.receiveShadow = true;
	parent.add(object);
	return object;
}

export function box(parent, color, width, height, depth, x = 0, y = 0, z = 0) {
	const key = `${width}/${height}/${depth}`;
	if (!cubes.has(key)) cubes.set(key, new THREE.BoxGeometry(width, height, depth));
	return mesh(cubes.get(key), color, parent, x, y, z);
}

export function cylinder(parent, color, top, bottom, height, x, y, z, sides = 12) {
	const key = `${top}/${bottom}/${height}/${sides}`;
	if (!cylinders.has(key)) cylinders.set(key, new THREE.CylinderGeometry(top, bottom, height, sides));
	return mesh(cylinders.get(key), color, parent, x, y, z);
}

export function ring(parent, color, radius, thickness, x, y, z) {
	const object = mesh(new THREE.TorusGeometry(radius, thickness, 6, 48), color, parent, x, y, z);
	object.rotation.x = -Math.PI / 2;
	return object;
}

export function dispose_Scene(scene) {
	const sharedGeometry = new Set([...cubes.values(), ...cylinders.values()]);
	const sharedMaterials = new Set(materials.values());
	scene.traverse(object => {
		if (object.geometry && !sharedGeometry.has(object.geometry)) object.geometry.dispose();
		if (object.material && !sharedMaterials.has(object.material)) {
			object.material.map?.dispose();
			object.material.dispose();
		}
		object.shadow?.dispose();
	});
}

export function group(parent, x = 0, y = 0, z = 0) {
	const object = new THREE.Group();
	object.position.set(x, y, z);
	parent.add(object);
	return object;
}

export function create_Drone(parent) {
	const drone = group(parent);
	const propellers = [];
	box(drone, palette.ink, 1.04, .27, 1.55, 0, .21);
	box(drone, palette.shell, 1.13, .19, 1.07, 0, .41, -.06);
	box(drone, palette.lime, .9, .06, .48, 0, .53, -.36);
	box(drone, palette.dark, .69, .15, .42, 0, .33, .71);
	for (const x of [-1, 1]) {
		box(drone, palette.metal, .09, .1, 1.05, x * .45, -.08);
		box(drone, palette.ink, .08, .25, .08, x * .45, .01, .32);
		box(drone, palette.ink, .08, .25, .08, x * .45, .01, -.32);
		for (const z of [-1, 1]) {
			const arm = box(drone, palette.dark, .22, .15, 1.59, x * .77, .21, z * .59);
			arm.rotation.y = x * z * .88;
			cylinder(drone, palette.ink, .19, .25, .27, x * 1.32, .31, z * 1.13);
			cylinder(drone, palette.metal, .15, .16, .08, x * 1.32, .48, z * 1.13);
			const propeller = group(drone, x * 1.32, .54, z * 1.13);
			const blade = box(propeller, palette.ink, 1.43, .04, .12);
			blade.rotation.y = x * z * .21;
			for (const end of [-.58, .58]) {
				box(propeller, z < 0 ? palette.lime : palette.coral, .14, .043, .115, end);
			}
			cylinder(propeller, palette.shell, .085, .1, .06, 0, .045, 0);
			propellers.push(propeller);
			box(drone, z < 0 ? palette.mint : palette.coral, .15, .09, .09, x * 1.34, .21, z * 1.31);
		}
	}
	const gimbal = group(drone, 0, .12, -.86);
	box(gimbal, palette.dark, .38, .26, .25);
	const lens = cylinder(gimbal, palette.ink, .108, .118, .09, 0, 0, -.145);
	lens.rotation.x = Math.PI / 2;
	const lensGlass = cylinder(gimbal, palette.glass, .072, .072, .025, 0, 0, -.195);
	lensGlass.rotation.x = Math.PI / 2;
	return { drone, propellers };
}

export function create_Component(parent, type) {
	const part = group(parent);
	switch (type) {
		case 'camera': {
			box(part, palette.blue, .83, .33, .65);
			box(part, palette.ink, .65, .24, .66, 0, .07, -.04);
			const lens = cylinder(part, palette.glass, .19, .21, .12, 0, .04, .33);
			lens.rotation.x = Math.PI / 2;
			break;
		}
		case 'gps':
			box(part, palette.mint, .87, .10, .76);
			box(part, palette.shell, .63, .12, .58, 0, .1);
			cylinder(part, palette.metal, .13, .13, .025, 0, .17, 0);
			break;
		case 'speed':
			box(part, palette.coral, .82, .1, .66);
			for (let index = -1; index <= 1; index++) box(part, palette.ink, .16, .09, .54, index * .23, .08);
			break;
		case 'battery':
			box(part, palette.dark, .96, .33, .68);
			box(part, palette.lime, .45, .34, .683, -.03);
			box(part, palette.coral, .19, .12, .18, .55, .04);
			break;
	}
	return part;
}
