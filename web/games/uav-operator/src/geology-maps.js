import * as THREE from 'three';
import { create_BoughGeometry, pine_Material, seeded_Random } from './coast.js';
import { create_FlightAtmosphere } from './atmosphere.js';
import { create_Valley, create_StrataMaterial, add_Tarn, tarn } from './geology-terrain.js';
import { add_RockGates, passages } from './geology-gates.js';
import { create_SceneryCollision } from './scenery-collision.js';
import { cylinder, ring, box, group } from './models.js';
import boulderData from './assets/geology-boulder_01.json';
import cragData from './assets/geology-namaqualand_boulder_04.json';

const tau = Math.PI * 2;
const base = { x: 0, z: 30, label: 'H' };
const padRadius = 2.7;
const limits = { minX: -103, maxX: 103, minZ: -166, maxZ: 69 };
// Две фотограмметрические модели Poly Haven, CC0, упрощены до 700 треугольников.
// https://polyhaven.com/a/boulder_01 | https://polyhaven.com/a/namaqualand_boulder_04
function scanned_Rock(data, alpine, projection) {
	const geometry = new THREE.BufferGeometryLoader().parse(data);
	geometry.computeBoundingBox();
	const bounds = geometry.boundingBox,
		size = bounds.getSize(new THREE.Vector3()),
		center = bounds.getCenter(new THREE.Vector3());
	geometry.translate(-center.x, -bounds.min.y, -center.z);
	geometry.scale(2 / size.x, 1 / size.y, 2 / size.z);
	if (projection) {
		const pos = geometry.attributes.position,
			colors = [],
			color = new THREE.Color();
		for (let i = 0; i < pos.count; i++) {
			const y = pos.getY(i);
			color.set(alpine ? 0x898e92 : 0xbb7757).multiplyScalar(0.78 + 0.24 * y);
			colors.push(color.r, color.g, color.b);
		}
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		return { geometry, material: projection };
	}
	const loader = new THREE.TextureLoader();
	const map = loader.load(
		new URL('./assets/geology-namaqualand_boulder_04-diff.webp', import.meta.url).href,
	);
	const normalMap = loader.load(
		new URL('./assets/geology-namaqualand_boulder_04-nor_gl.webp', import.meta.url).href,
	);
	map.flipY = normalMap.flipY = false;
	map.anisotropy = normalMap.anisotropy = 4;
	map.colorSpace = THREE.SRGBColorSpace;
	const material = new THREE.MeshStandardMaterial({
		map,
		normalMap,
		color: alpine ? 0xe3eaf1 : 0xf0bd9f,
		roughness: 0.91,
	});
	material.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <map_fragment>',
			`
			#include <map_fragment>
			float stoneValue=dot(diffuseColor.rgb,vec3(.24,.64,.12));
			diffuseColor.rgb=mix(diffuseColor.rgb,stoneValue*vec3(${alpine ? '1.04,1.08,1.10' : '1.65,.96,.65'}),.72);
		`,
		);
	};
	material.customProgramCacheKey = () => (alpine ? 'moraine-granite' : 'desert-varnish');
	return { geometry, material };
}

function distance_ToTrail(x, z, route) {
	let best = Infinity,
		ax = base.x,
		az = base.z;
	for (const [bx, bz] of route) {
		const dx = bx - ax,
			dz = bz - az;
		const t = THREE.MathUtils.clamp(
			((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz),
			0,
			1,
		);
		best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
		ax = bx;
		az = bz;
	}
	return best;
}

function add_RockGroups(scene, collision, groundAt, alpine, route, material, random) {
	const forms = [
		scanned_Rock(boulderData, alpine, material),
		scanned_Rock(cragData, alpine, false),
	];
	const talus = new THREE.IcosahedronGeometry(1, 0);
	const gravelPoints = talus.attributes.position,
		gravelColors = [];
	const gravelColor = new THREE.Color(alpine ? 0x9d9e9b : 0xc48a66);
	for (let i = 0; i < gravelPoints.count; i++) {
		const x = gravelPoints.getX(i),
			y = gravelPoints.getY(i),
			z = gravelPoints.getZ(i);
		gravelPoints.setXYZ(i, x + 0.21 * y, 0.39 + y * (0.6 + 0.11 * x), z + 0.16 * x * y);
		const shade = 0.81 + 0.17 * y;
		gravelColors.push(gravelColor.r * shade, gravelColor.g * shade, gravelColor.b * shade);
	}
	talus.setAttribute('color', new THREE.Float32BufferAttribute(gravelColors, 3));
	talus.computeVertexNormals();
	forms.push({ geometry: talus, material });
	const clusters = alpine
		? [
				[-34, 10, 9],
				[24, -37, 11],
				[-50, -77, 15],
				[38, -100, 20],
				[-39, -150, 13],
				[26, -166, 20],
				[55, 15, 16],
				[-62, -45, 21],
			]
		: [
				[-28, -24, 18],
				[28, -38, 19],
				[-39, -75, 16],
				[39, -94, 22],
				[-28, -128, 15],
				[38, -146, 19],
				[61, -32, 25],
				[-70, 1, 24],
				[55, 20, 14],
			];
	const pieces = forms.map(() => []);
	const dummy = new THREE.Object3D();
	function add(x, z, h, rx, rz, yaw, small = false) {
		const bury = small
			? 0.12
			: Math.max(
					0.6,
					0.17 * h,
					groundAt(x, z) -
						Math.min(
							groundAt(x + rx * 0.7, z),
							groundAt(x - rx * 0.7, z),
							groundAt(x, z + rz * 0.7),
							groundAt(x, z - rz * 0.7),
						),
				);
		dummy.position.set(x, groundAt(x, z) - bury, z);
		dummy.scale.set(rx, h + bury * 0.24, rz);
		dummy.rotation.set(0, yaw, 0);
		dummy.updateMatrix();
		const variant = small ? 2 : Math.floor(random() * 2);
		pieces[variant].push(dummy.matrix.clone());
	}
	// Выветренные опоры продолжаются в склон. Коридор между ними остаётся свободным.
	for (const [cx, cz, yaw, span, rise] of route)
		for (const side of [-1, 1]) {
			for (let step = 0; step < 3; step++) {
				const along = side * (span + 3.2 + 3.6 * step);
				const across = (step - 1) * 2.2 + side * 0.8;
				const x = cx + along * Math.cos(yaw) + across * Math.sin(yaw);
				const z = cz - along * Math.sin(yaw) + across * Math.cos(yaw);
				const h = rise * (0.24 + 0.53 * random()) * (1 - step * 0.19);
				add(x, z, h, 4.0 + random() * 2.8, 3.6 + 1.2 * step, random() * tau);
			}
		}
	for (const [cx, cz, height] of clusters) {
		for (let j = 0; j < 5; j++) {
			const x = cx + (j ? (random() - 0.5) * 18 : 0),
				z = cz + (j ? (random() - 0.5) * 16 : 0);
			const h = height * (j ? 0.28 + 0.54 * random() : 1);
			const r = h * (alpine ? 0.69 : 0.5);
			if (distance_ToTrail(x, z, route) > r + 4.4)
				add(x, z, h, r, r * (0.54 + random() * 0.38), random() * tau);
		}
	}
	for (let i = 0; i < 220; i++) {
		const x = -89 + random() * 178,
			z = -161 + random() * 214,
			r = 0.3 + random() ** 2 * 2.4;
		if (distance_ToTrail(x, z, route) < r + 3.5 || Math.hypot(x - base.x, z - base.z) < 8)
			continue;
		add(
			x,
			z,
			r * (0.32 + 0.68 * random()),
			r,
			r * (0.53 + 0.45 * random()),
			random() * tau,
			true,
		);
	}
	forms.forEach(({ geometry, material: rockMaterial }, index) => {
		const mesh = new THREE.InstancedMesh(geometry, rockMaterial, pieces[index].length);
		mesh.name = alpine ? 'Glacial erratics' : 'Eroded sandstone fins';
		pieces[index].forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
		mesh.castShadow = mesh.receiveShadow = true;
		scene.add(mesh);
		collision.add(mesh);
	});
}

function add_Tussocks(scene, groundAt, alpine, route, random) {
	const pos = [],
		rgb = [],
		c = new THREE.Color();
	for (let i = 0; i < 32; i++) {
		const a = random() * tau,
			len = 0.19 + random() * 0.48,
			x = Math.sin(a),
			z = Math.cos(a),
			w = 0.011 + random() * 0.021;
		const bend = len * (alpine ? 0.52 : 0.65),
			root = 0.08 + random() * 0.11;
		pos.push(
			root * x + w * z,
			0,
			root * z - w * x,
			root * x - w * z,
			0,
			root * z + w * x,
			(root + bend) * x,
			len,
			(root + bend) * z,
		);
		c.set(alpine ? 0x6f774b : 0x717052);
		rgb.push(c.r, c.g, c.b, c.r, c.g, c.b);
		c.set(i % 4 === 0 ? 0xc5b58a : alpine ? 0xa3a45d : 0xaea57a);
		rgb.push(c.r, c.g, c.b);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
	geo.computeVertexNormals();
	const count = matchMedia('(pointer: coarse)').matches ? 380 : 680;
	const grass = new THREE.InstancedMesh(
		geo,
		new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
		count,
	);
	const dummy = new THREE.Object3D();
	for (let i = 0; i < count;) {
		const x = (random() - 0.5) * 144,
			z = 56 - random() * 212,
			y = groundAt(x, z);
		if (
			y < (alpine ? tarn.level + 0.27 : -2) ||
			y > (alpine ? 14 : 17) ||
			Math.hypot(x - base.x, z - base.z) < 4
		)
			continue;
		const patch = 0.5 + 0.5 * Math.sin(x * 0.16 + Math.sin(z * 0.1) * 1.9) * Math.cos(z * 0.11);
		if (random() > patch || distance_ToTrail(x, z, route) < (alpine ? 1 : 2.7)) continue;
		const size = 0.6 + random() * 1.7;
		dummy.position.set(x, y - 0.04, z);
		dummy.rotation.y = random() * tau;
		dummy.scale.set(size, size * (alpine ? 0.9 : 0.66), size);
		dummy.updateMatrix();
		grass.setMatrixAt(i++, dummy.matrix);
	}
	grass.name = 'Dry grass tussocks';
	grass.receiveShadow = true;
	scene.add(grass);
}

function add_Treeline(scene, collision, groundAt, random) {
	const branches = [],
		trunks = [],
		crowns = [],
		dummy = new THREE.Object3D();
	const groves = [
		[-47, 13, 15],
		[34, -13, 8],
		[-55, -42, 12],
		[56, -79, 17],
		[-58, -112, 17],
		[30, -142, 12],
		[-88, -162, 26],
		[79, -178, 22],
		[-25, -179, 14],
		[92, 10, 28],
		[-81, 62, 15],
		[-97, -60, 24],
	];
	for (const [cx, cz, r] of groves)
		for (let i = 0; i < Math.ceil(r * 1.35); i++) {
			const a = random() * tau,
				d = Math.sqrt(random()) * r,
				x = cx + Math.cos(a) * d,
				z = cz + Math.sin(a) * d;
			const y = groundAt(x, z);
			if (y < 0.2 || y > 27 || distance_ToTrail(x, z, passages.alpine) < 8) continue;
			const h = 2.5 + random() ** 1.2 * 6.7,
				w = h * (0.84 + random() * 0.3),
				yaw = random() * tau;
			dummy.scale.set(w / 6, h / 6, w / 6);
			dummy.rotation.set(0, yaw, (random() - 0.5) * 0.11);
			dummy.position.set(x, y, z);
			dummy.updateMatrix();
			branches.push(dummy.matrix.clone());
			dummy.position.y = y + h * 0.41;
			dummy.updateMatrix();
			trunks.push(dummy.matrix.clone());
			dummy.position.y = y + h * 0.49;
			for (let j = 0; j < 2; j++) {
				dummy.rotation.y = yaw + j * Math.PI * 0.5;
				dummy.updateMatrix();
				crowns.push(dummy.matrix.clone());
			}
		}
	const wood = new THREE.MeshStandardMaterial({ color: 0x5e5141, roughness: 0.98 });
	for (const [geometry, material, matrices, solid] of [
		[new THREE.CylinderGeometry(0.065, 0.23, 5, 7), wood, trunks, true],
		[create_BoughGeometry(5157), pine_Material(true), branches, true],
		[new THREE.PlaneGeometry(3.9, 6.12), pine_Material(), crowns, false],
	]) {
		const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
		matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
		mesh.name = 'Spruce treeline';
		mesh.castShadow = mesh.receiveShadow = true;
		scene.add(mesh);
		if (solid) collision.add(mesh);
	}
}

export function create_GeologyMap(id) {
	const alpine = id === 'alpine',
		route = passages[id];
	const scene = new THREE.Scene();
	const sun = create_FlightAtmosphere(scene, id);
	const collision = create_SceneryCollision(),
		material = create_StrataMaterial(alpine ? 'marble' : 'sandstone', true, alpine);
	const groundAt = create_Valley(scene, alpine, material.userData.cliffPhoto);
	const gates = add_RockGates(scene, collision, groundAt, material, id);
	const random = seeded_Random(alpine ? 8783 : 1441);
	add_RockGroups(scene, collision, groundAt, alpine, route, material, random);
	add_Tussocks(scene, groundAt, alpine, route, random);
	if (alpine) add_Treeline(scene, collision, groundAt, random);
	const seaTime = alpine ? add_Tarn(scene, groundAt, sun) : null;
	const pad = group(scene, base.x, 0.025, base.z);
	cylinder(pad, 0x4d524d, padRadius, padRadius + 0.04, 0.075, 0, 0, 0, 48);
	ring(pad, 0xe3d6a6, padRadius - 0.21, 0.039, 0, 0.045, 0);
	for (const side of [-1, 1]) box(pad, 0xe3d6a6, 0.14, 0.012, 1.52, side * 0.48, 0.047);
	box(pad, 0xe3d6a6, 0.9, 0.012, 0.15, 0, 0.047);
	const onPad = (x, z) => Math.hypot(x - base.x, z - base.z) <= padRadius;
	const flightGround = (x, z) => {
		if (onPad(x, z)) return 0.076;
		const y = groundAt(x, z);
		if (alpine && Math.abs(x - tarn.x) < 25 && Math.abs(z - tarn.z) < 44.5)
			return Math.max(tarn.level, y);
		return y;
	};
	return { scene, sun, gates, collision, seaTime, base, limits, padRadius, onPad, flightGround };
}
