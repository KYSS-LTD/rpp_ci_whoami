import * as THREE from 'three';
import { beach_Texture, create_Lighting, seeded_Random } from './coast.js';
import { box, cylinder, group, palette, ring } from './models.js';

export const photoSize = { width: 28, height: 17.5 };

// Раскладки учебных снимков. targets - мусор, который нужно отметить; kind 'tire' показывается
// только на уровнях с четырьмя категориями. decoys - похожие на мусор предметы для сложного уровня.
const layouts = {
	bay: {
		seed: 219, textureOffset: [0, 0],
		targets: [
			{ kind: 'bottle', x: -8.1, z: -3.5, angle: -.67 }, { kind: 'bag', x: .7, z: 3.45, angle: .53 },
			{ kind: 'can', x: 7.3, z: -2.85, angle: -.22 }, { kind: 'bottle', x: 9.6, z: 4.75, angle: 1.09 },
			{ kind: 'tire', x: -4.6, z: 1.9, angle: 0 },
		],
		decoys: [
			{ kind: 'stone', x: 3.6, z: -1, angle: .4 }, { kind: 'jelly', x: -10.6, z: 2.6, angle: 0 },
			{ kind: 'crab', x: 10.8, z: -4.4, angle: .7 }, { kind: 'firepit', x: 4.8, z: 5.9, angle: 0 },
			{ kind: 'stick', x: -6.4, z: -6.6, angle: -.25 },
		],
		logs: [[-8.6, 4.8, .31], [4, -5.5, -.53], [13.1, -.21, .43], [-2.8, -2.6, 1.05]],
		parasols: [[-12, -6.1, 0xda775b], [-3.9, 6.7, 0x569791], [11.7, -7.1, 0x9b834d]],
		towels: [], boardwalk: false,
	},
	pier: {
		seed: 731, textureOffset: [.37, .21],
		targets: [
			{ kind: 'can', x: -9.4, z: -1.8, angle: .9 }, { kind: 'bottle', x: -2.2, z: 4.6, angle: -.3 },
			{ kind: 'bag', x: 5.4, z: -2.6, angle: -.4 }, { kind: 'tire', x: 10.2, z: 3.4, angle: 0 },
			{ kind: 'can', x: 1.6, z: -.4, angle: 1.4 },
		],
		decoys: [
			{ kind: 'jelly', x: -5.6, z: -4.6, angle: 0 }, { kind: 'crab', x: -11.4, z: 4.2, angle: -.5 },
			{ kind: 'stone', x: 8.4, z: -5.2, angle: 1.2 }, { kind: 'firepit', x: -4.6, z: 1.2, angle: 0 },
			{ kind: 'stick', x: 3.4, z: 5.9, angle: .3 },
		],
		logs: [[-7.4, 6.6, .7], [12.6, -1.6, -.3]],
		parasols: [[7.6, 6.6, 0x569791], [-12.4, -5.2, 0xda775b]],
		towels: [[5.6, 3.9, .25, 0xd8574a], [-8.2, 1.9, -.15, 0x4c86b8]], boardwalk: true,
	},
};

export function count_Targets(layoutId, kinds) {
	return layouts[layoutId].targets.filter(item => kinds.includes(item.kind)).length;
}

function create_Litter(holder, kind) {
	if (kind === 'bottle') {
		const body = cylinder(holder, 0x509b9d, .28, .30, 1.02, 0, .285, 0);
		body.rotation.x = Math.PI / 2;
		cylinder(holder, 0xf0eed4, .292, .299, .34, 0, .285, -.17).rotation.x = Math.PI / 2;
		cylinder(holder, 0x5badaa, .13, .28, .23, 0, .285, .6).rotation.x = Math.PI / 2;
		cylinder(holder, 0x345b93, .133, .133, .22, 0, .285, .78).rotation.x = Math.PI / 2;
	} else if (kind === 'bag') {
		box(holder, 0xe2e6c1, 1.18, .09, 1.17, 0, .05);
		for (const x of [-.35, .35]) {
			const handle = ring(holder, 0xe2e6c1, .20, .035, x, .055, -.69);
			handle.scale.y = 1.29;
			box(holder, 0xc6c9a9, .04, .021, .95, x, .10, .06).rotation.y = x * .19;
		}
	} else if (kind === 'can') {
		cylinder(holder, 0xe46853, .39, .39, .79, 0, .39, 0).rotation.x = Math.PI / 2;
		for (const end of [-.41, .41]) cylinder(holder, 0xbcc2bc, .41, .41, .055, 0, .39, end).rotation.x = Math.PI / 2;
	} else {
		// Покрышка: тёмный тор с протектором и песком внутри.
		const tire = new THREE.Mesh(new THREE.TorusGeometry(.56, .22, 10, 30), new THREE.MeshStandardMaterial({ color: 0x1e2121, roughness: .95 }));
		tire.rotation.x = -Math.PI / 2;
		tire.position.y = .2;
		tire.castShadow = tire.receiveShadow = true;
		holder.add(tire);
		for (let index = 0; index < 18; index++) {
			const angle = index / 18 * Math.PI * 2;
			box(holder, 0x2e3333, .1, .04, .16, Math.cos(angle) * .64, .4, Math.sin(angle) * .64).rotation.y = -angle;
		}
		cylinder(holder, 0x3a3d3b, .36, .36, .02, 0, .32, 0, 20);
	}
}

// Предметы-обманки похожи на мусор цветом или силуэтом, но мусором не являются.
function create_Decoy(holder, kind) {
	if (kind === 'stone') {
		// Обкатанный зелёный камень размером с бутылку, но без горлышка и крышки.
		const stone = new THREE.Mesh(new THREE.SphereGeometry(.5, 14, 10), new THREE.MeshStandardMaterial({ color: 0x5a9a96, roughness: .55 }));
		stone.scale.set(.62, .42, 1.42);
		stone.position.y = .2;
		stone.castShadow = true;
		holder.add(stone);
	} else if (kind === 'jelly') {
		// Медуза: полупрозрачный белый купол с четырьмя кольцами, похож на пакет только цветом.
		const dome = new THREE.Mesh(new THREE.SphereGeometry(.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
			new THREE.MeshStandardMaterial({ color: 0xe6eef0, transparent: true, opacity: .82, roughness: .2 }));
		dome.scale.y = .28;
		dome.castShadow = true;
		holder.add(dome);
		for (let index = 0; index < 4; index++) {
			const angle = index * Math.PI / 2 + .4;
			ring(holder, 0xd9a5c6, .1, .025, Math.cos(angle) * .2, .17, Math.sin(angle) * .2);
		}
	} else if (kind === 'crab') {
		// Краб: красный панцирь размером с банку, но с ногами и клешнями.
		const shell = new THREE.Mesh(new THREE.SphereGeometry(.4, 14, 8), new THREE.MeshStandardMaterial({ color: 0xd2563c, roughness: .6 }));
		shell.scale.set(1.05, .38, .78);
		shell.position.y = .16;
		shell.castShadow = true;
		holder.add(shell);
		for (const side of [-1, 1]) {
			for (let index = 0; index < 3; index++) box(holder, 0xb8452f, .42, .05, .05, side * .5, .08, -.18 + index * .18).rotation.y = side * (.35 - index * .35);
			box(holder, 0xc9503a, .26, .09, .14, side * .26, .1, -.48).rotation.y = side * .5;
		}
	} else if (kind === 'firepit') {
		// Кострище: кольцо тёмных камней вокруг золы, похоже на покрышку только силуэтом.
		cylinder(holder, 0x4a4743, .5, .55, .03, 0, .015, 0, 20);
		const geometry = new THREE.DodecahedronGeometry(.17, 0);
		for (let index = 0; index < 10; index++) {
			const angle = index / 10 * Math.PI * 2;
			const stone = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: index % 2 ? 0x45433f : 0x5a5650, flatShading: true }));
			stone.position.set(Math.cos(angle) * .66, .1, Math.sin(angle) * .66);
			stone.scale.set(1.15, .75, 1);
			stone.castShadow = true;
			holder.add(stone);
		}
	} else {
		// Ветка-плавник: вытянутая, как бутылка, но светлая и с отростком.
		cylinder(holder, 0xc7b79c, .12, .17, 1.5, 0, .14, 0).rotation.x = Math.PI / 2;
		const twig = cylinder(holder, 0xbcae94, .05, .07, .6, .22, .1, -.2);
		twig.rotation.set(Math.PI / 2, 0, 0);
		twig.rotation.y = .9;
	}
}

function bounds_Of(holder) {
	const bounds = new THREE.Box3().setFromObject(holder);
	return {
		x: .5 + bounds.min.x / photoSize.width, y: .5 + bounds.min.z / photoSize.height,
		w: (bounds.max.x - bounds.min.x) / photoSize.width, h: (bounds.max.z - bounds.min.z) / photoSize.height,
	};
}

function create_Scenery(scene, layout, occupied) {
	const random = seeded_Random(layout.seed);
	const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
	for (let index = 0; index < 51; index++) {
		const x = random() * 28 - 14;
		const z = random() * 18 - 9;
		if (occupied.some(item => Math.hypot(item.x - x, item.z - z) < 1.5)) continue;
		const size = .09 + random() * .46;
		const rock = new THREE.Mesh(rockGeometry, new THREE.MeshStandardMaterial({ color: index % 2 ? 0xa29a83 : 0xc5b49a, flatShading: true }));
		rock.position.set(x, .04, z);
		rock.scale.set(size * 1.3, size * .57, size);
		rock.rotation.y = random() * Math.PI;
		rock.castShadow = true;
		scene.add(rock);
	}
	for (const [x, z, angle] of layout.logs) box(scene, 0xa47e59, .34, .20, 3.16, x, .108, z).rotation.y = angle;
	for (const [x, z, color] of layout.parasols) {
		const parasol = group(scene, x, 0, z);
		cylinder(parasol, palette.dark, .06, .06, 1.37, 0, .68, 0);
		cylinder(parasol, color, .05, .88, .42, 0, 1.32, 0, 8);
		cylinder(parasol, palette.shell, .23, .41, .095, 0, 1.38, 0, 8);
	}
	// Полосатые полотенца отдыхающих: тоже не мусор.
	for (const [x, z, angle, color] of layout.towels) {
		const towel = group(scene, x, 0, z);
		towel.rotation.y = angle;
		for (let index = 0; index < 5; index++) box(towel, index % 2 ? 0xf1ead6 : color, 1.2, .02, .44, 0, .02, -.88 + index * .44);
	}
	// Дощатый настил вдоль верхнего края второго снимка.
	if (layout.boardwalk) {
		for (let index = 0; index < 40; index++) box(scene, index % 3 ? 0xb58b60 : 0x9e784e, .62, .14, 1.9, -14 + index * .72, .07, -7.6);
	}
}

export function create_Photo(layoutId, kinds, withDecoys) {
	const layout = layouts[layoutId];
	const scene = new THREE.Scene();
	const sun = create_Lighting(scene, 19);
	sun.position.set(-25, 29, -31);
	const camera = new THREE.OrthographicCamera(-14, 14, 8.75, -8.75, .1, 80);
	camera.position.set(0, 26, 0);
	camera.up.set(0, 0, -1);
	camera.lookAt(0, 0, 0);
	const texture = beach_Texture(4, 2.5);
	texture.offset.set(...layout.textureOffset);
	const sand = new THREE.Mesh(new THREE.PlaneGeometry(29, 18.5), new THREE.MeshStandardMaterial({ map: texture }));
	sand.rotation.x = -Math.PI / 2;
	sand.receiveShadow = true;
	scene.add(sand);
	const items = layout.targets.filter(item => kinds.includes(item.kind));
	const decoyItems = withDecoys ? layout.decoys : [];
	create_Scenery(scene, layout, [...items, ...decoyItems]);
	const place = (item, build) => {
		const holder = group(scene, item.x, 0, item.z);
		holder.rotation.y = item.angle;
		build(holder, item.kind);
		return { kind: item.kind, ...bounds_Of(holder) };
	};
	const targets = items.map(item => place(item, create_Litter));
	const decoys = decoyItems.map(item => place(item, create_Decoy));
	return { scene, camera, targets, decoys,
		// Статичный снимок нужно перерисовать, когда фототекстура песка декодируется.
		ready: () => Boolean(sand.material.map.image?.complete),
	};
}
