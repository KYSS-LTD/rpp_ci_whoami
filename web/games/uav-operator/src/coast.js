import * as THREE from 'three';
import { box, cylinder, group, ring, palette, create_Drone } from './models.js';
import { create_FlightAtmosphere } from './atmosphere.js';
import { create_Landscape } from './landscape.js';
import { batch_Scenery } from './scenery-batches.js';

export const base = { x: -15, z: 37, label: 'H' };
export const padRadius = 4.4;
const stationSite = { x: -25, z: 42 };
const terraceHeight = 3.2;
const padThickness = .16;

function site_Distance(x, z) {
	// Запас в один шаг сетки удерживает края фундамента на плоских треугольниках.
	return Math.min(Math.hypot(x - base.x, z - base.z) - padRadius,
		Math.max(Math.abs(x - stationSite.x) - 4, Math.abs(z - stationSite.z) - 3.2));
}

export function on_Pad(x, z) {
	return Math.hypot(x - base.x, z - base.z) <= padRadius;
}

export function flight_Ground(x, z) {
	return on_Pad(x, z) ? terraceHeight + padThickness : Math.max(0, terrain_Height(x, z));
}
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
	const natural = Math.min(10, inland * .045 + Math.max(0, inland - 23) * .105) + THREE.MathUtils.smoothstep(inland, 22, 40) * (2.5 + Math.sin(x * .13 + z * .08) * 2.2 + Math.cos(z * .15) * 1.4);
	return THREE.MathUtils.lerp(terraceHeight, natural, THREE.MathUtils.smoothstep(site_Distance(x, z), 4, 12));
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
	const geometry = new THREE.PlaneGeometry(320, 690, 128, 244);
	geometry.rotateX(-Math.PI / 2);
	const position = geometry.attributes.position;
	const colors = [];
	const sand = new THREE.Color(0xf3dbab);
	const wet = new THREE.Color(0xc3af96);
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
	terrain.material.map.repeat.y = 144;
	terrain.material.onBeforeCompile = shader => {
		shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
			#include <map_fragment>
			float grain = dot(diffuseColor.rgb,vec3(.25,.62,.13));
			diffuseColor.rgb = vec3(.18 + .80 * grain) * vec3(1.05,1.,.94);
		`);
	};
	terrain.receiveShadow = true;
	scene.add(terrain);
}

function create_Sea(scene) {
	const uniforms = { time: { value: 0 }, sky: { value: scene.background }, skyTurn: { value: scene.backgroundRotation.y } };
	const material = new THREE.ShaderMaterial({ uniforms, vertexShader: `
		varying vec2 world;
		void main() {
			vec4 point = modelMatrix * vec4(position, 1.0);
			world = point.xz;
			gl_Position = projectionMatrix * viewMatrix * point;
		}`, fragmentShader: `
		uniform float time;
		uniform float skyTurn;
		uniform sampler2D sky;
		varying vec2 world;
		void main() {
			float shore = 13.0 + 6.0 * cos(world.y * .044) - 6.0 * sin(world.y * .069);
			float depth = world.x - shore;
			vec3 view = normalize(cameraPosition - vec3(world.x, 0.0, world.y));
			float swell = sin(dot(world, vec2(.58, .19)) + time * 1.05 + .9*sin(world.y*.16));
			float chop = sin(dot(world, vec2(1.72, -.69)) - time * 1.9 + swell * 1.4);
			float ripples = sin(dot(world, vec2(3.19, .82)) + time * 2.2 + chop * 1.6);
			float range = distance(world, cameraPosition.xz);
			float detail = 1.0 - smoothstep(40.0, 185.0, range);
			vec3 normal = normalize(vec3((.064 * swell + .047 * chop)*detail, 1.0, (.060 * chop + .036 * ripples)*detail));
			float fresnel = .07 + .85 * pow(1.0 - clamp(dot(view, normal), 0.0, 1.0), 4.0);
			float shoal = .5 + .5*sin(world.x*.48 + sin(world.y*.31)*2.)*cos(world.y*.43);
			vec3 col = mix(mix(vec3(.22,.49,.37),vec3(.17,.40,.30),shoal), vec3(.012,.13,.16), smoothstep(-1.0, 32.0, depth+shoal*3.));
			vec3 reflectedDir = reflect(-view, normal);
			vec2 skyUv = vec2(.5 + (atan(reflectedDir.z,reflectedDir.x) + skyTurn)/6.2831853, .5 + asin(clamp(reflectedDir.y,.0,1.))/3.14159);
			vec3 reflected = textureLod(sky, vec2(fract(skyUv.x),skyUv.y), 5.).rgb;
			reflected = mix(reflected,vec3(.35,.49,.59),.52);
			col = mix(col, reflected*.80, fresnel) + detail * (.005 * ripples + .007 * chop);
			float glint = pow(max(dot(reflect(-normalize(vec3(-.83,.95,-.45)),normal),view),0.),64.);
			col += vec3(1.,.82,.55) * glint * .8 * detail;
			float surf = sin(depth * 1.11 + time * 1.35 + .44 * sin(world.y * .48) + .24 * chop);
			float foam = smoothstep(.84, 1.0, surf) * (1.0 - smoothstep(1.0, 12.0, depth));
			foam *= smoothstep(-.68, .75, ripples * .55 + swell * .62) * detail;
			col = mix(col, vec3(.76, .82, .76), clamp(foam * .51 + .48 * exp(-abs(depth - .24 + .17 * chop) * 3.1), 0.0, 1.0));
			col = mix(col,vec3(.48,.63,.66),smoothstep(150.,420.,range));
			gl_FragColor = vec4(col, 1.0);
			#include <tonemapping_fragment>
			#include <colorspace_fragment>
		}`,
	});
	const sea = new THREE.Mesh(new THREE.PlaneGeometry(740, 800), material);
	sea.rotation.x = -Math.PI / 2;
	sea.position.set(200, -.012, 0);
	scene.add(sea);
	return uniforms.time;
}

export function pine_Material(spray = false) {
	const canvas = document.createElement('canvas');
	canvas.width = 360;
	canvas.height = 512;
	const ink = canvas.getContext('2d');
	ink.scale(2, 2);
	const random = seeded_Random(589);
	if (spray) {
		// Прозрачная текстура отдельной ветви с хвоей и мелкими побегами.
		for (let twig = 0; twig < 54; twig++) {
			const start = twig / 54;
			const side = twig % 2 ? -1 : 1;
			const reach = (1 - start) * (.55 + random() * .44);
			const endX = 90 + side * 86 * reach;
			const endY = 252 - start * 222 - reach * 80;
			ink.strokeStyle = '#695640';
			ink.lineWidth = 1.3;
			ink.beginPath();
			ink.moveTo(90, 252 - start * 222);
			ink.lineTo(endX, endY);
			ink.stroke();
			for (let needle = 0; needle < 32; needle++) {
				const t = needle / 32;
				const x = 90 + (endX - 90) * t;
				const y = 252 - start * 222 + (endY - 252 + start * 222) * t;
				ink.strokeStyle = 'hsl(' + (86 + random() * 42) + ' 30% ' + (21 + random() * 22) + '%)';
				ink.lineWidth = .95 + random() * 1.9;
				ink.beginPath();
				ink.moveTo(x, y);
				ink.lineTo(x + (random() - .5) * 16 * reach, y - 3 - random() * 21 * reach);
				ink.stroke();
			}
		}
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = 4;
		return new THREE.MeshStandardMaterial({ map: texture, alphaTest: .35, side: THREE.DoubleSide, roughness: 1 });
	}
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
export function create_BoughGeometry(seed) {
	const random = seeded_Random(seed);
	const vertices = [];
	const texcoords = [];
	const indices = [];
	for (let tier = 0; tier < 10; tier++) {
		const fraction = tier / 10;
		for (let limb = 0; limb < 7; limb++) {
			const angle = limb * Math.PI * 2 / 7 + tier * .83 + random() * .34;
			const reach = (.30 + 1.78 * (1 - fraction) ** .8) * (.78 + random() * .38);
			const y = .95 + fraction * 4.72;
			const dx = Math.cos(angle), dz = Math.sin(angle);
			const first = vertices.length / 3;
			for (const [distance, side, height] of [[0, 0, .08], [.48, -.45, -.05], [.50, .43, .15], [1, 0, .26]]) {
				vertices.push((distance * dx - side * dz) * reach, y + height * reach, (distance * dz + side * dx) * reach);
			}
			texcoords.push(.5, 0, 0, .49, 1, .49, .5, 1);
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
	const cells = new Map();
	const cellSize = 23;
	const cellId = (x, z) => Math.floor(x / cellSize) + ':' + Math.floor(z / cellSize);
	for (let index = 0; index < 3400; index++) {
		const z = random() * 368 - 184;
		const margin = 43 + Math.cos(z * .071) * 10 + Math.sin(z * .031) * 7;
		const x = shore(z) - margin - random() ** 1.28 * 138;
		const launchPath = x > base.x - 2 && Math.abs(z - base.z + (x - base.x) * .55) < 7;
		if (x < -157 || launchPath || Math.hypot(x - base.x, z - base.z) < 8 || site_Distance(x, z) < 5 ||
			sectors.some(point => Math.hypot(x - point.x, z - point.z) < 9)) continue;
		const key = cellId(x, z);
		if (!cells.has(key)) cells.set(key, []);
		cells.get(key).push({
			x, y: terrain_Height(x, z), z,
			scale: 1.05 + random() ** 1.4 * 2.28,
			width: .66 + random() * .57, angle: random() * Math.PI,
			lean: (random() - .5) * .11, hue: random(),
		});
	}
	const trunkGeometry = new THREE.CylinderGeometry(.025, .14, 5.4, 6);
	const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x574332, roughness: 1 });
	const needles = pine_Material(true);
	const silhouette = pine_Material();
	const variants = [create_BoughGeometry(586), create_BoughGeometry(643), create_BoughGeometry(787)];
	const crownGeometry = new THREE.PlaneGeometry(3.8, 6.1);
	const green = new THREE.Color();
	for (const trees of cells.values()) {
		const cell = trees[0];
		const detailed = cell.x > limits.minX - 16;
		const crowns = new THREE.InstancedMesh(crownGeometry, silhouette, trees.length * 2);
		const bark = detailed ? new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length) : null;
		const branches = detailed ? new THREE.InstancedMesh(variants[Math.floor(random() * variants.length)], needles, trees.length) : null;
		for (const [index, tree] of trees.entries()) {
			const { x, y, z, scale, width, angle, lean, hue } = tree;
			stock.scale.set(scale * width, scale, scale * width);
			stock.rotation.set(0, angle, lean);
			green.setRGB(.63 + hue * .27, .72 + hue * .25, .43 + hue * .39);
			if (detailed) {
				stock.position.set(x, y, z);
				stock.updateMatrix();
				branches.setMatrixAt(index, stock.matrix);
				branches.setColorAt(index, green);
				stock.position.y += 2.68 * scale;
				stock.updateMatrix();
				bark.setMatrixAt(index, stock.matrix);
			}
			for (let plane = 0; plane < 2; plane++) {
				stock.position.set(x, y + 2.94 * scale, z);
				stock.rotation.y = angle + plane * Math.PI / 2;
				stock.updateMatrix();
				crowns.setMatrixAt(index * 2 + plane, stock.matrix);
				crowns.setColorAt(index * 2 + plane, green);
			}
		}
		crowns.receiveShadow = detailed;
		crowns.castShadow = detailed;
		scene.add(crowns);
		if (detailed) {
			bark.castShadow = true;
			bark.receiveShadow = branches.receiveShadow = true;
			scene.add(bark, branches);
		}
	}
	const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9d9b87, flatShading: true }), 66);
	for (let index = 0; index < rocks.count; index++) {
		let x, z;
		do {
			z = random() * 166 - 86;
			x = shore(z) - random() * 38;
		} while (site_Distance(x, z) < 2);
		const radius = .18 + random() * .96;
		stock.rotation.set(.3, random() * Math.PI, .24);
		stock.position.set(x, terrain_Height(x, z) + .03, z);
		stock.scale.set(radius * 1.4, radius * .48, radius);
		stock.updateMatrix();
		rocks.setMatrixAt(index, stock.matrix);
	}
	rocks.castShadow = rocks.receiveShadow = true;
	scene.add(rocks);
	return (x, y, z) => {
		for (let dx = -1; dx <= 1; dx++) {
			for (let dz = -1; dz <= 1; dz++) {
				for (const tree of cells.get(cellId(x + dx * cellSize, z + dz * cellSize)) ?? []) {
					const above = (y - tree.y) / tree.scale;
					if (above < 0 || above > 5.8) continue;
					const radius = above < .9 ? .22 : Math.max(.2, 1.34 * (5.8 - above) / 4.9);
					if (Math.hypot(x - tree.x, z - tree.z) < radius * tree.scale * tree.width + .16) return true;
				}
			}
		}
		return false;
	};
}

function add_Dunes(scene) {
	const land = create_Landscape(scene, terrain_Height, 1459);
	const random = seeded_Random(837);
	const safe = (x,z,r) => site_Distance(x,z)>4+r && sectors.every(p=>Math.hypot(x-p.x,z-p.z)>10+r)
		&& Math.hypot(x-5,z+54)>3+r
		&& !(x>base.x-1 && Math.abs(z-base.z+(x-base.x)*.55)<4+r)
		&& !(Math.abs(z-25)<3+r && x>shore(25)-1);
	const trees = [];
	for (const [cx,cz,spread] of [[-35,78,12],[-26,59,8],[-35,17,13],[-15,4,10],[-37,-24,12],
		[-25,-50,10],[-12,-70,10],[-24,-94,12],[-29,-124,12],[-19,-156,10],[-27,99,8]]) {
		for (let i=0;i<25;i++) {
			const a=random()*Math.PI*2, d=Math.sqrt(random())*spread;
			const x=cx+Math.cos(a)*d, z=cz+Math.sin(a)*d;
			const h=4.8+random()*4.8, r=h*.29;
			if (!safe(x,z,r) || shore(z)-x<12 || trees.some(t=>Math.hypot(t.x-x,t.z-z)<r+t.r)) continue;
			land.tree(x,z,h,random()<.52?'birch':'oak');
			trees.push({x,z,r:r*.7});
		}
	}
	// Изгороди повторяют край дюн. Между секциями есть сквозные проходы с песка в рощи.
	for (const [start,end,inset] of [[-159,-148,18],[-127,-114,18],[-107,-93,17],[-88,-70,17],
		[-66,-56,20],[-48,-38,18],[-15,2,18],[7,16,18],[45,58,17],[88,101,18]]) {
		for (let z=start;z<end;z+=6) {
			const next=Math.min(z+6,end), x=shore(z)-inset, xx=shore(next)-inset;
			if (safe(x,z,.5)&&safe(xx,next,.5)&&safe((x+xx)/2,(z+next)/2,.5)) land.fence(x,z,xx,next,1.32);
		}
	}
	for (const [z,inset] of [[-149,1],[-113,6],[-83,-1],[-60,7],[-11,3],[3,0],[54,6],[93,4]]) {
		const cx=shore(z)-inset;
		for (let i=0;i<13;i++) {
			const x=cx+(random()-.5)*10, zz=z+(random()-.5)*13;
			const w=.6+random()**1.55*3.1;
			if (safe(x,zz,w*.5)) land.rock(x,zz,w,w*(.21+random()*.34),w*(.63+random()*.5),random()*6);
		}
	}
	for (const z of [-153,-119,-85,-42,-13,12,56,94]) {
		const x=shore(z)-7.5;
		if (safe(x,z,2.9)) land.log(x-1.6,z-2.2,x+1.4,z+2.6,.27+random()*.18);
	}
	const archX=shore(8)+1;
	land.rock(archX,4.8,3.7,4.5,4.6,-.12);
	land.rock(archX,11.4,4.1,4.4,4.2,.25);
	land.rock(archX,8,3.25,1.24,9.2,0,4.45);
	for (let i=0;i<1850;i++) {
		const z=-172+283*random(), x=shore(z)-7-31*random();
		if (!safe(x,z,.2)) continue;
		for (let clump=0;clump<3;clump++) land.grass(x+random()*.9,z+random(),.59+random()*1.07);
	}
	land.finish();
	return land;
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
	const station = group(scene, stationSite.x, terraceHeight, stationSite.z);
	box(station, 0xd7b189, 7.8, .54, 6.2, 0, .2, 0);
	box(station, 0xf2d9a6, 6.6, 2.65, 4.8, 0, 1.6);
	// Нижняя грань цельной двускатной крыши лежит на верхней плоскости стен.
	const roofProfile = new THREE.Shape();
	roofProfile.moveTo(-3.68, 0);
	roofProfile.lineTo(3.68, 0);
	roofProfile.lineTo(3.68, .14);
	roofProfile.lineTo(0, 1.02);
	roofProfile.lineTo(-3.68, .14);
	roofProfile.closePath();
	const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofProfile, { depth: 5.6, bevelEnabled: false }),
		new THREE.MeshStandardMaterial({ color: 0x426a64, roughness: .84 }));
	roof.position.set(0, 1.6 + 2.65 / 2, -2.8);
	roof.castShadow = roof.receiveShadow = true;
	station.add(roof);
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
	const landing = group(scene, base.x, terraceHeight + padThickness - .08, base.z);
	cylinder(landing, 0x728274, padRadius, padRadius + .19, 1.22, 0, -.56, 0, 32);
	cylinder(landing, 0x39494a, padRadius, padRadius + .12, .16, 0, 0, 0, 32);
	ring(landing, 0xb5baae, padRadius - .33, .035, 0, .085, 0);
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
	const sun = create_FlightAtmosphere(scene, 'beach');
	create_Terrain(scene);
	const seaTime = create_Sea(scene);
	const pines = create_Vegetation(scene);
	const dunes = add_Dunes(scene);
	const touchesTree = (x,y,z) => dunes.touches(x,y,z) || pines(x,y,z);
	create_Lighthouse(scene);
	create_Station(scene);
	create_SectorDetails(scene);
	batch_Scenery(scene);
	const fieldDrone = create_Drone(scene);
	fieldDrone.drone.traverse(object => { object.castShadow = false; });
	return { scene, fieldDrone, seaTime, touchesTree, sun };
}
