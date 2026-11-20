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

export function create_Propeller(parent, x, y, z, radius, reverse) {
	const propeller = group(parent, x, y, z);
	const blade = new THREE.Shape();
	blade.moveTo(.04, -.035);
	blade.quadraticCurveTo(.34, -.14, .54, -.07);
	blade.quadraticCurveTo(.67, -.034, .60, .029);
	blade.quadraticCurveTo(.40, .10, .08, .045);
	blade.closePath();
	const geometry = new THREE.ExtrudeGeometry(blade, { depth: .018, bevelEnabled: false, curveSegments: 5 });
	const turn = reverse ? -1 : 1;
	propeller.scale.set(radius / .62, 1, turn * radius / .62);
	for (let index = 0; index < 3; index++) {
		const arm = group(propeller);
		arm.rotation.y = index * Math.PI * 2 / 3;
		mesh(geometry, 0x30373b, arm, 0, 0, 0).rotation.x = -Math.PI / 2;
	}
	cylinder(propeller, 0x9b9e99, .079, .11, .062, 0, .03, 0, 6);
	return propeller;
}

export function create_Drone(parent) {
	const drone = group(parent);
	const propellers = [];
	box(drone, palette.ink, 1.04, .27, 1.55, 0, .21);
	box(drone, 0x383b38, 1.13, .10, 1.26, 0, .41, -.06);
	box(drone, 0x64675f, .68, .23, .96, 0, .58, -.12);
	for (const z of [-.42, .19]) box(drone, palette.ink, .72, .25, .132, 0, .58, z);
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
			const propeller = create_Propeller(drone, x * 1.32, .54, z * 1.13, .72, x * z > 0);
			propellers.push(propeller);
			box(drone, z < 0 ? palette.mint : palette.coral, .15, .09, .09, x * 1.34, .21, z * 1.31);
		}
	}
	const camera = group(drone, 0, .24, -.82);
	camera.rotation.x = .244;
	box(camera, palette.dark, .38, .26, .25);
	const lens = cylinder(camera, palette.ink, .108, .118, .09, 0, 0, -.145);
	lens.rotation.x = Math.PI / 2;
	const lensGlass = cylinder(camera, palette.glass, .072, .072, .025, 0, 0, -.195);
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
			box(part, 0x243e35, .82, .10, .66);
			for (let index = -1; index <= 1; index++) box(part, 0x20242a, .16, .09, .45, index * .23, .084);
			for (const side of [-1, 1]) for (let index = -2; index <= 2; index++) box(part, 0xc7a465, .065, .02, .085, index * .132, .06, side * .281);
			break;
		case 'receiver': {
			box(part, 0x254348, .67, .10, .42);
			box(part, 0x171c22, .28, .09, .26, -.07, .08);
			box(part, 0xb9af9b, .14, .065, .12, .22, .08);
			box(part, 0x292e34, .31, .035, .035, 0, .04, -.32).rotation.y = .84;
			box(part, 0x292e34, .43, .032, .032, .21, .04, -.42);
			break;
		}
		case 'transmitter':
			box(part, 0x263733, .78, .095, .56);
			for (let index = -3; index <= 3; index++) box(part, 0x343b40, .047, .12, .39, index * .085, .095);
			cylinder(part, 0xb69e72, .068, .068, .12, .29, .08, .19);
			box(part, palette.dark, .5, .05, .05, .53, .07, .19);
			break;
		case 'battery':
			box(part, palette.dark, .96, .33, .68);
			box(part, 0x797f74, .53, .34, .683, -.03);
			box(part, palette.coral, .19, .12, .18, .55, .04);
			break;
	}
	return part;
}
