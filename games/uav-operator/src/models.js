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

// Точки разъёма на каждом модуле (в локальных координатах модели). От них идут кабели к полётному контроллеру.
export const componentPlugs = {
	camera: [0, .14, .23], gps: [.27, .06, 0], speed: [-.29, .06, 0],
	receiver: [.24, .06, 0], transmitter: [-.27, .06, 0], battery: [0, .12, -.34],
};

// Модули строятся основанием на y = 0, лицевая сторона смотрит в -z (к носу дрона).
// Размеры подобраны так, чтобы каждый модуль помещался в свой отсек корпуса под крышкой.
export function create_Component(parent, type) {
	const part = group(parent);
	switch (type) {
		case 'camera': {
			// Камера в рамке с боковыми пластинами, объектив смотрит в окно носовой стенки.
			box(part, palette.blue, .42, .38, .36, 0, .21, .02);
			box(part, palette.ink, .36, .3, .04, 0, .22, -.17);
			for (const side of [-1, 1]) box(part, palette.dark, .04, .3, .4, side * .25, .15, .02);
			box(part, palette.dark, .54, .04, .4, 0, .02, .02);
			const lens = cylinder(part, palette.ink, .12, .135, .14, 0, .22, -.24);
			lens.rotation.x = Math.PI / 2;
			const glass = cylinder(part, palette.glass, .085, .085, .02, 0, .22, -.315);
			glass.rotation.x = Math.PI / 2;
			box(part, 0xe8e2c8, .1, .06, .05, 0, .14, .21);
			break;
		}
		case 'gps':
			// Модуль GPS с керамической антенной на верхней стороне.
			box(part, palette.mint, .5, .09, .5, 0, .045);
			box(part, 0x1d2a26, .46, .02, .46, 0, .1);
			box(part, palette.shell, .3, .05, .3, 0, .135);
			cylinder(part, palette.metal, .05, .05, .03, 0, .175, 0);
			box(part, 0xe8e2c8, .06, .05, .1, .23, .06, 0);
			break;
		case 'speed':
			// Регулятор 4-в-1: силовые ключи, конденсатор и контакты моторов.
			box(part, 0x243e35, .54, .05, .54, 0, .025);
			for (let row = -1; row <= 1; row += 2) for (let column = -1; column <= 1; column++) box(part, 0x20242a, .1, .05, .08, column * .14, .075, row * .12);
			for (const x of [-.24, .24]) for (const z of [-.24, .24]) box(part, 0xc7a465, .06, .015, .06, x, .055, z);
			const capacitor = cylinder(part, 0x2b3f6a, .06, .06, .26, .02, .11, .2);
			capacitor.rotation.z = Math.PI / 2;
			box(part, 0xe8e2c8, .05, .05, .1, -.25, .06, 0);
			break;
		case 'receiver': {
			// Приёмник с двумя антеннами, которые выводятся к боковой стенке корпуса.
			box(part, 0x254348, .42, .05, .3, 0, .025);
			box(part, 0x171c22, .16, .05, .14, -.06, .07);
			box(part, 0xb9af9b, .08, .04, .08, .1, .065, .06);
			box(part, 0x292e34, .26, .02, .02, -.31, .04, -.06).rotation.y = .3;
			box(part, 0x292e34, .26, .02, .02, -.31, .04, .07).rotation.y = -.3;
			box(part, 0xe8e2c8, .05, .05, .09, .21, .06, 0);
			break;
		}
		case 'transmitter':
			// Видеопередатчик с радиатором и разъёмом антенны у правой стенки.
			box(part, 0x263733, .48, .05, .4, 0, .025);
			for (let index = -3; index <= 3; index++) box(part, 0x343b40, .035, .1, .3, index * .06, .1);
			const connector = cylinder(part, 0xb69e72, .045, .045, .14, .3, .06, .1);
			connector.rotation.z = Math.PI / 2;
			box(part, 0xe8e2c8, .05, .05, .09, -.23, .06, 0);
			break;
		case 'battery':
			// Аккумулятор 6S в плёнке с ремешком и силовым разъёмом XT60.
			box(part, palette.dark, 1.24, .34, .58, 0, .17);
			box(part, 0x797f74, .62, .345, .585, -.08, .17);
			box(part, palette.lime, .1, .35, .6, .42, .17);
			box(part, palette.coral, .16, .1, .1, 0, .12, -.33);
			break;
	}
	return part;
}

// Отвёртка: жало в начале координат, рукоятка вдоль +y. Материалы свои, чтобы подсветка не задевала другие детали.
export function create_Screwdriver(parent) {
	const tool = group(parent);
	const handle = new THREE.MeshStandardMaterial({ color: palette.coral, roughness: .55 });
	const grip = new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: .9 });
	const steel = new THREE.MeshStandardMaterial({ color: 0xb7bfbd, roughness: .3, metalness: .7 });
	const add = (geometry, surface, y) => {
		const piece = new THREE.Mesh(geometry, surface);
		piece.position.y = y;
		piece.castShadow = true;
		tool.add(piece);
		return piece;
	};
	add(new THREE.CylinderGeometry(.012, .028, .06, 8), steel, .03);
	add(new THREE.CylinderGeometry(.028, .028, .86, 10), steel, .49);
	add(new THREE.CylinderGeometry(.06, .045, .1, 12), steel, .95);
	add(new THREE.CylinderGeometry(.1, .085, .72, 10), handle, 1.36);
	for (let index = 0; index < 3; index++) add(new THREE.CylinderGeometry(.104, .104, .07, 10), grip, 1.14 + index * .18);
	add(new THREE.SphereGeometry(.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), handle, 1.72);
	return { tool, surfaces: [handle, grip] };
}

// Винт крышки: основание шляпки в начале координат, стержень уходит вниз.
export function create_Screw(parent) {
	const screw = group(parent);
	const head = new THREE.MeshStandardMaterial({ color: 0xc5ccc8, roughness: .35, metalness: .65 });
	const add = (geometry, surface, y) => {
		const piece = new THREE.Mesh(geometry, surface);
		piece.position.y = y;
		piece.castShadow = true;
		screw.add(piece);
		return piece;
	};
	add(new THREE.CylinderGeometry(.085, .085, .05, 14), head, .025);
	add(new THREE.CylinderGeometry(.032, .028, .34, 8), head, -.17);
	const slot = material(palette.ink);
	for (const angle of [0, Math.PI / 2]) {
		const cross = new THREE.Mesh(new THREE.BoxGeometry(.12, .012, .024), slot);
		cross.position.y = .052;
		cross.rotation.y = angle;
		screw.add(cross);
	}
	return { screw, surfaces: [head] };
}
