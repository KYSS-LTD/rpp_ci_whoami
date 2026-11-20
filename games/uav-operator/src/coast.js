import * as THREE from 'three';
import { box, cylinder, group, ring, palette, create_Drone } from './models.js';

export const base = { x: -15, z: 37, label: 'H' };
export const sectors = [
	{ x: 4, z: 76, label: 'A' }, { x: -4, z: -27, label: 'B' }, { x: 2, z: -139, label: 'C' },
];
export const limits = { minX: -47, maxX: 32, minZ: -162, maxZ: 104 };

export function seeded_Random(seed) {
	return () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 4294967296;
	};
}

export function shore(z) {
	return 13 + 6 * Math.cos(z * .044) - 6 * Math.sin(z * .069);
}

export function terrain_Height(x, z) {
	const inland = shore(z) - x;
	return Math.min(10, inland * .045 + Math.max(0, inland - 23) * .105) + THREE.MathUtils.smoothstep(inland, 22, 40) * (2.5 + Math.sin(x * .13 + z * .08) * 2.2 + Math.cos(z * .15) * 1.4);
}

export function beach_Texture(repeatX, repeatY) {
	const texture = new THREE.TextureLoader().load(new URL('./assets/coast-sand.jpg', import.meta.url).href);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeatX, repeatY);
	texture.anisotropy = 4;
	return texture;
}

function create_Terrain(scene) {
	const geometry = new THREE.PlaneGeometry(320, 370, 128, 136);
	geometry.rotateX(-Math.PI / 2);
	const position = geometry.attributes.position;
	const colors = [];
	const sand = new THREE.Color(0xe8c897);
	const wet = new THREE.Color(0xcda77b);
	const scrub = new THREE.Color(0x88a27b);
	const forest = new THREE.Color(0x4f815d);
	const random = seeded_Random(21);
	for (let index = 0; index < position.count; index++) {
		const x = position.getX(index);
		const z = position.getZ(index);
		const inland = shore(z) - x;
		position.setY(index, terrain_Height(x, z));
		const color = wet.clone().lerp(sand, THREE.MathUtils.smoothstep(inland, 0, 8));
		color.lerp(scrub, THREE.MathUtils.smoothstep(inland + 3 * Math.sin(.24 * z + .44 * x), 17, 32));
		color.lerp(forest, THREE.MathUtils.smoothstep(inland, 33, 80));
		color.multiplyScalar(.89 + random() * .20);
		colors.push(color.r, color.g, color.b);
	}
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.computeVertexNormals();
	const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: beach_Texture(65, 74) }));
	terrain.receiveShadow = true;
	scene.add(terrain);
}

function create_Sea(scene) {
	const uniforms = { time: { value: 0 } };
	const material = new THREE.ShaderMaterial({ uniforms, vertexShader: `
		varying vec2 world;
		void main() {
			vec4 point = modelMatrix * vec4(position, 1.0);
			world = point.xz;
			gl_Position = projectionMatrix * viewMatrix * point;
		}`, fragmentShader: `
		uniform float time;
		varying vec2 world;
		void main() {
			float shore = 13.0 + 6.0 * cos(world.y * .044) - 6.0 * sin(world.y * .069);
			float depth = world.x - shore;
			float wave = sin(depth * 1.05 + time * 1.45 + .18 * sin(world.y * .43));
			float foam = smoothstep(.73, .98, wave) * (1.0 - smoothstep(1.0, 23.0, depth));
			foam *= .42 + .24 * sin(world.y * .49 + time) + .17 * cos(world.y * 1.07);
			vec3 col = mix(vec3(.185, .72, .60), vec3(.016, .227, .296), smoothstep(-1.0, 59.0, depth));
			float ripple = sin(world.x * .55 + world.y * .22 + time) * sin(world.y * .82 - world.x * .42 - time);
			float detail = 1.0 - smoothstep(70.0, 143.0, distance(world, cameraPosition.xz));
			col += detail * (.029 * ripple + .016 * sin(world.x * 2.8 + world.y * .65));
			foam *= detail;
			col = mix(col, vec3(.92, .99, .83), clamp(foam + .62 * exp(-abs(depth - .25) * 1.4), 0.0, 1.0));
			gl_FragColor = vec4(col, 1.0);
			#include <colorspace_fragment>
		}`,
	});
	const sea = new THREE.Mesh(new THREE.PlaneGeometry(740, 800), material);
	sea.rotation.x = -Math.PI / 2;
	sea.position.set(200, -.012, 0);
	scene.add(sea);
	return uniforms.time;
}

function pine_Material() {
	const canvas = document.createElement('canvas');
	canvas.width = 360;
	canvas.height = 512;
	const ink = canvas.getContext('2d');
	ink.scale(2, 2);
	const random = seeded_Random(589);
	ink.fillStyle = '#6d5944';
	ink.fillRect(87, 22, 5, 230);
	for (let row = 0; row < 68; row++) {
		const level = 224 - row * 3.15;
		const span = 5 + (67 - row) * .98;
		for (const side of [-1, 1]) {
			const reach = span * (.73 + random() * .35);
			for (let spray = 0; spray < 28; spray++) {
				const t = spray / 28;
				const x = 90 + side * reach * t;
				const y = level + (14 + span * .13) * t - 8 * t * t;
				const light = 19 + random() * 12 + (side < 0 ? 7 : 0);
				ink.fillStyle = `hsl(145 23% ${light}%)`;
				ink.beginPath();
				ink.moveTo(x - 3, y + 4);
				ink.lineTo(x + side * (3 + random() * 9), y - 4 - random() * 9);
				ink.lineTo(x + 4, y + 2);
				ink.fill();
			}
		}
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return new THREE.MeshStandardMaterial({ map: texture, alphaTest: .42, side: THREE.DoubleSide, roughness: 1 });
}

// Группы ветвей образуют ярусы вокруг ствола, чтобы крона сохраняла объём при облёте.
function create_BoughGeometry() {
	const random = seeded_Random(586);
	const vertices = [];
	const texcoords = [];
	const indices = [];
	for (let tier = 0; tier < 8; tier++) {
		const fraction = tier / 8;
		for (let limb = 0; limb < 5; limb++) {
			const angle = limb * Math.PI * .4 + tier * .83 + random() * .34;
			const reach = (.30 + 1.28 * (1 - fraction)) * (.78 + random() * .38);
			const y = .95 + fraction * 4.72;
			const dx = Math.cos(angle), dz = Math.sin(angle);
			const first = vertices.length / 3;
			for (const [distance, side, height] of [[0,0,.42],[.47,-.32,.03],[.5,.31,-.03],[1,0,-.27]]) {
				vertices.push((distance * dx - side * dz) * reach, y + height * reach, (distance * dz + side * dx) * reach);
			}
			texcoords.push(.5,1, 0,.36, 1,.36, .5,.05);
			indices.push(first, first+1, first+2, first+1, first+3, first+2);
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(texcoords, 2));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

function create_Vegetation(scene) {
	const random = seeded_Random(197);
	const stock = new THREE.Object3D();
	const conifers = 1260;
	const bark = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .18, 4.5, 7), new THREE.MeshStandardMaterial({ color: 0x876344 }), conifers);
	const needles = pine_Material();
	const branches = new THREE.InstancedMesh(create_BoughGeometry(), needles, conifers);
	const crowns = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.3, 5.2), needles, conifers * 2);
	for (let index = 0; index < conifers; index++) {
		const z = random() * 330 - 165;
		const x = shore(z) - 27 - random() * 77;
		const y = terrain_Height(x, z);
		const scale = .63 + random() ** .8 * 2.05;
		stock.rotation.y = random() * Math.PI;
		stock.position.set(x, y, z);
		stock.scale.setScalar(scale);
		stock.updateMatrix();
		branches.setMatrixAt(index, stock.matrix);
		stock.position.y += 2.25 * scale;
		stock.scale.setScalar(scale);
		stock.updateMatrix();
		bark.setMatrixAt(index, stock.matrix);
		for (let layer = 0; layer < 2; layer++) {
			stock.position.y = y + 2.68 * scale;
			stock.rotation.y += layer * Math.PI / 2;
			stock.scale.setScalar(scale);
			stock.updateMatrix();
			crowns.setMatrixAt(index * 2 + layer, stock.matrix);
			const green = new THREE.Color(0xf4f8eb);
			crowns.setColorAt(index * 2 + layer, green.multiplyScalar(.8 + random() * .38));
		}
	}
	const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9d9b87, flatShading: true }), 66);
	for (let index = 0; index < rocks.count; index++) {
		const z = random() * 166 - 86;
		const x = shore(z) - random() * 38;
		const radius = .18 + random() * .96;
		stock.rotation.set(.3, random() * Math.PI, .24);
		stock.position.set(x, terrain_Height(x, z) + .03, z);
		stock.scale.set(radius * 1.4, radius * .48, radius);
		stock.updateMatrix();
		rocks.setMatrixAt(index, stock.matrix);
	}
	for (const element of [bark, branches, crowns, rocks]) {
		element.castShadow = true;
		element.receiveShadow = true;
		scene.add(element);
	}
}

function create_Lighthouse(scene) {
	const x = 5;
	const z = -54;
	const lighthouse = group(scene, x, terrain_Height(x, z), z);
	cylinder(lighthouse, 0x9b927c, 3.08, 3.67, .67, 0, .22, 0);
	for (let index = 0; index < 6; index++) {
		const radius = 1.36 - index * .062;
		cylinder(lighthouse, index % 2 ? 0xf6e6ca : 0xd5654f, radius - .062, radius, 1.31, 0, 1.01 + index * 1.31, 0, 24);
	}
	cylinder(lighthouse, 0x3e4648, 1.51, 1.29, .35, 0, 8.32, 0, 24);
	cylinder(lighthouse, 0x447c88, .82, .85, 1.26, 0, 9.05, 0, 12);
	for (let index = 0; index < 6; index++) {
		const angle = index * Math.PI / 3;
		box(lighthouse, 0x2b3434, .06, 1.26, .06, .83 * Math.cos(angle), 9.05, .83 * Math.sin(angle));
	}
	cylinder(lighthouse, 0xbf5843, .09, 1.18, .76, 0, 10.03, 0, 16);
	cylinder(lighthouse, palette.ink, .055, .055, .39, 0, 10.53, 0);
	box(lighthouse, 0x574538, .66, 1.19, .14, 0, 1.07, 1.28);
}

function create_Station(scene) {
	const station = group(scene, -25, terrain_Height(-25, 42), 42);
	box(station, 0xd7b189, 7.8, .54, 6.2, 0, .2, 0);
	box(station, 0xf2d9a6, 6.6, 2.65, 4.8, 0, 1.6);
	const roof = box(station, 0x426a64, 7.36, .27, 5.6, 0, 3, 0);
	roof.rotation.z = .10;
	box(station, 0x736052, .86, 2.19, .14, 1.9, 1.29, -2.41);
	box(station, 0x48757c, 2.4, .98, .13, -.91, 1.81, -2.43);
	box(station, 0xf0e7ca, .09, 1.08, .15, -.91, 1.81, -2.45);
	const pier = group(scene, shore(25) + 6.9, .65, 25);
	for (let index = 0; index < 22; index++) box(pier, index % 3 ? 0xb58b60 : 0x9e784e, .68, .2, 3.4, index * .71 - 7.1);
	for (let index = -1; index < 3; index++) {
		for (const side of [-1, 1]) cylinder(pier, 0x715b49, .17, .2, 1.8, index * 4.4 - 2, -.46, side * 1.35, 8);
	}
	for (const [x, z, angle] of [[23, 29, .49], [29, 21, -.15]]) {
		const boat = group(scene, x, .13, z);
		boat.rotation.y = angle;
		box(boat, 0xefe5cc, 1.4, .46, 3.45);
		box(boat, 0xe88956, 1.25, .23, 3.1, 0, .33);
		const bow = cylinder(boat, 0xefebe0, .84, .61, .42, 0, 0, -1.81, 3);
		bow.rotation.y = Math.PI;
		box(boat, 0x397e84, 1.1, .61, 1.14, 0, .56, .42);
	}
	const landing = group(scene, base.x, terrain_Height(base.x, base.z) + .52, base.z);
	cylinder(landing, 0x728274, 3.40, 3.59, 1.22, 0, -.56, 0, 32);
	cylinder(landing, 0x39494a, 3.35, 3.52, .16, 0, 0, 0, 32);
	ring(landing, palette.lime, 2.97, .065, 0, .12, 0);
	for (const side of [-1, 1]) box(landing, palette.shell, .22, .035, 1.73, side * .53, .107, 0);
	box(landing, palette.shell, 1.04, .035, .22, 0, .107, 0);
}

function create_SectorDetails(scene) {
	const random = seeded_Random(101);
	const colors = [0xd16643, 0x55a1a2, 0xe8dfbb];
	const shapes = [[.32, .28, .56], [.25, .29, .76], [.58, .06, .45]];
	for (const point of sectors) {
		for (let index = 0; index < 7; index++) {
			const x = point.x + (random() - .5) * 8.3;
			const z = point.z + (random() - .5) * 8.3;
			const y = Math.max(.01, terrain_Height(x, z));
			const type = index % shapes.length;
			const [width, height, depth] = shapes[type];
			const item = group(scene, x, y, z);
			item.rotation.y = random() * Math.PI;
			if (type === 2) box(item, colors[type], width, height, depth, 0, height / 2);
			else {
				cylinder(item, colors[type], width / 2, width / 2, depth, 0, height / 2, 0).rotation.x = Math.PI / 2;
				cylinder(item, type === 1 ? 0x325888 : 0xb9b9a9, width * .38, width * .38, .11,
					0, height / 2, depth / 2 + .04).rotation.x = Math.PI / 2;
			}
		}
	}
}

export function create_Lighting(scene, span = 42) {
	scene.add(new THREE.HemisphereLight(0xfff8e2, 0x698197, 2.05));
	const sun = new THREE.DirectionalLight(0xffedd1, 2.45);
	sun.position.set(-38, 52, -27);
	sun.castShadow = true;
	const shadowSize = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
	sun.shadow.mapSize.set(shadowSize, shadowSize);
	Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: .5, far: 180 });
	sun.shadow.normalBias = span * .0013;
	sun.shadow.intensity = .76;
	scene.add(sun, sun.target);
	return sun;
}

export function create_Coast() {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x9accbe);
	new THREE.TextureLoader().load(new URL('./assets/clouds.jpg', import.meta.url).href, panorama => {
		panorama.mapping = THREE.EquirectangularReflectionMapping;
		panorama.colorSpace = THREE.SRGBColorSpace;
		scene.background = panorama;
	});
	scene.fog = new THREE.FogExp2(0xb6caca, .005);
	create_Lighting(scene, 69);
	create_Terrain(scene);
	const seaTime = create_Sea(scene);
	create_Vegetation(scene);
	create_Lighthouse(scene);
	create_Station(scene);
	create_SectorDetails(scene);
	const fieldDrone = create_Drone(scene);
	return { scene, fieldDrone, seaTime };
}
