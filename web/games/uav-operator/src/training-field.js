import * as THREE from 'three';
import { create_BoughGeometry, pine_Material, seeded_Random } from './coast.js';
import { create_FlightAtmosphere } from './atmosphere.js';
import { create_Landscape } from './landscape.js';
import { batch_Scenery } from './scenery-batches.js';
import { box, cylinder, group, ring } from './models.js';
import { text } from './text.js';

const bounds = { minX: -114, maxX: 114, minZ: -188, maxZ: 78 };
const home = { x: 0, z: 22, label: 'H' };
const padSize = 3.6;
const courses = {
	race: [[0, 6, 5.5, 7.8, 0], [18, -22, 7.2, 7.2, -.52], [34, -51, 6.6, 6.6, -.3], [13, -76, 5.3, 7.0, .68],
		[-18, -94, 6.6, 7.25, .92], [-31, -122, 5.5, 6.5, .24], [-8, -147, 7.4, 7.5, -.61], [19, -170, 6.8, 8.4, -.8]],
	field: [[0, -2, 6.4, 10, 0], [-9, -37, 7.4, 10, .25], [12, -75, 8.2, 11, -.48]],
};

function route_Distance(x, z, waypoints) {
	let distance = Infinity;
	for (let index = 1; index < waypoints.length; index++) {
		const [startX, startZ] = waypoints[index - 1];
		const [endX, endZ] = waypoints[index];
		const dx = endX - startX, dz = endZ - startZ;
		const along = THREE.MathUtils.clamp(((x - startX) * dx + (z - startZ) * dz) / (dx * dx + dz * dz), 0, 1);
		distance = Math.min(distance, Math.hypot(x - startX - along * dx, z - startZ - along * dz));
	}
	return distance;
}

function elevation(x, z) {
	const edge = Math.max(Math.abs(x) / 130, Math.abs(z + 52) / 153);
	const hills = Math.sin(x * .029 + z * .025) * 2.3 + Math.cos(z * .024 - x * .055) * 1.38;
	const blend = THREE.MathUtils.smoothstep(Math.hypot(x - home.x, z - home.z), 5.5, 21);
	return (hills + 2.3 * Math.sin(z * .015) ** 2 + Math.max(0, edge - .68) * 7) * blend;
}

function ground_Texture(asset, repeat, colorSpace) {
	const texture = new THREE.TextureLoader().load(asset);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(repeat, repeat);
	texture.colorSpace = colorSpace;
	texture.anisotropy = 4;
	return texture;
}

function add_Terrain(scene, waypoints, race) {
	const geometry = new THREE.PlaneGeometry(830, 830, 184, 184);
	geometry.rotateX(-Math.PI / 2);
	const points = geometry.attributes.position;
	const color = new THREE.Color();
	const colors = [];
	for (let index = 0; index < points.count; index++) {
		const x = points.getX(index);
		const z = points.getZ(index);
		points.setY(index, elevation(x, z));
		const serviceRoad = Math.exp(-Math.pow((x + 36 + 6 * Math.sin(z * .025)) / 3.2, 2)) * .59;
		// Цвет маршрута записан в сам рельеф. Дополнительной плоскости поверх травы нет.
		const lane = (1 - THREE.MathUtils.smoothstep(route_Distance(x, z, waypoints), 2.4, 6.5)) * (race ? .8 : .33);
		const tracks = Math.max(lane, serviceRoad);
		const patches = .5 + .5 * Math.sin(x * .074 + Math.cos(z * .095) * 2.7) * Math.cos(z * .045 - x * .032);
		color.setHSL(.22 - tracks * .16, .25 - tracks * .15, .56 + patches * .13 + tracks * .12);
		colors.push(color.r, color.g, color.b);
	}
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.computeVertexNormals();
	// Grass Ground (Poly Haven, CC0): https://polyhaven.com/a/grass_ground
	const land = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
		map: ground_Texture(new URL('./assets/field-grass.webp', import.meta.url).href, 92, THREE.SRGBColorSpace),
		normalMap: ground_Texture(new URL('./assets/field-grass-normal.webp', import.meta.url).href, 92, THREE.NoColorSpace),
		normalScale: new THREE.Vector2(.6, .6), vertexColors: true, roughness: .94,
	}));
	land.material.onBeforeCompile = shader => {
		shader.vertexShader = 'varying vec2 meadow;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n meadow = position.xz;');
		shader.fragmentShader = 'varying vec2 meadow;\n' + shader.fragmentShader.replace('#include <map_fragment>', `
			#include <map_fragment>
			float luma = dot(diffuseColor.rgb, vec3(.22,.68,.10));
			float variation = sin(meadow.x*.27 + sin(meadow.y*.13)) * cos(meadow.y*.21 + meadow.x*.08);
			diffuseColor.rgb = mix(diffuseColor.rgb, luma * vec3(.78,1.23,.60), .66 + variation*.18);
			float lane = abs(meadow.x + 36. + 6. * sin(meadow.y*.025));
			float wheel = 1. - smoothstep(.16,.47,abs(lane - .91) + variation*.08);
			diffuseColor.rgb = mix(diffuseColor.rgb, (.07+luma*.8)*vec3(1.25,.99,.68), wheel*.88);
		`);
	};
	land.receiveShadow = true;
	scene.add(land);
}

function add_Windbreak(scene, random, obstacles) {
	const count = 112;
	const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .31, 4.8, 6),
		new THREE.MeshStandardMaterial({ color: 0x78604a }), count);
	const boughs = new THREE.InstancedMesh(create_BoughGeometry(74), pine_Material(true), count);
	const silhouettes = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.8, 6.1), pine_Material(), count * 2);
	const instance = new THREE.Object3D();
	const leaf = new THREE.Color();
	for (let index = 0; index < count; index++) {
		const side = index < count / 2 ? -1 : 1;
		const x = side * (62 + 58 * random() + 12 * Math.sin(index * .43));
		const z = -207 + random() * 288;
		const y = elevation(x, z);
		const scale = 1.05 + random() ** 1.55 * 1.45;
		const width = .8 + random() * .56;
		const angle = random() * Math.PI;
		const lean = (random() - .5) * .15;
		obstacles.push({ x, z, radius: 1.62 * scale * width, height: 5.7 * scale, tree: true });
		instance.scale.set(scale * width, scale, scale * width);
		instance.rotation.set(0, angle, lean);
		instance.position.set(x, y + 2.4 * scale, z);
		instance.updateMatrix();
		branches.setMatrixAt(index, instance.matrix);
		instance.position.y = y;
		instance.updateMatrix();
		boughs.setMatrixAt(index, instance.matrix);
		leaf.setRGB(.58 + random() * .35, .72 + random() * .25, .43 + random() * .37);
		boughs.setColorAt(index, leaf);
		for (let plane = 0; plane < 2; plane++) {
			const id = index * 2 + plane;
			instance.position.y = y + 2.92 * scale;
			instance.rotation.y = angle + plane * Math.PI / 2;
			instance.updateMatrix();
			silhouettes.setMatrixAt(id, instance.matrix);
			silhouettes.setColorAt(id, leaf);
		}
	}
	branches.castShadow = true;
	scene.add(branches, boughs, silhouettes);
}

function add_Shed(scene, x, z) {
	const shed = group(scene, x, elevation(x, z) - .12, z);
	box(shed, 0x81614a, 9, 3.0, 6, 0, 1.5);
	for (const side of [-1, 1]) {
		box(shed, 0x594643, 5.2, .19, 6.7, side * 2.476, 3.72).rotation.z = -side * .31;
		for (let rib = 0; rib < 12; rib++) {
			box(shed, 0x70534a, 5.1, .075, .052, side * 2.4, 3.845, (rib - 5.5) * .56).rotation.z = -side * .31;
		}
	}
	box(shed, 0x4a4037, 2.25, 2.45, .075, 0, 1.2, 3.03);
	for (const side of [-1, 1]) box(shed, 0x374747, 1.55, .86, .07, side * 2.84, 1.92, 3.05);
	for (let slat = -8; slat <= 8; slat++) {
		box(shed, 0x66513e, .048, 2.9, .035, slat * .52, 1.5, -3.01);
	}
}

function add_FieldLandmarks(scene, obstacles, waypoints, race) {
	function place(x, z, radius, height) {
		if (route_Distance(x, z, waypoints) < radius + 8 || Math.hypot(x - home.x, z - home.z) < radius + padSize + 3
			|| obstacles.some(item => Math.hypot(item.x - x, item.z - z) < (item.radius ?? Math.hypot(item.width, item.depth)) + radius + .6)) return null;
		obstacles.push({ x, z, radius, height });
		return group(scene, x, elevation(x, z), z);
	}

	for (const [x, z] of race ? [[-15, 6], [45, -34], [-47, -101], [32, -164]] : [[-13, 8], [26, -14], [-23, -42], [27, -72], [3, -120]]) {
		const station = place(x, z, 1.4, 6);
		if (!station) continue;
		cylinder(station, 0x4b514e, .36, .48, .36, 0, .12, 0);
		cylinder(station, 0xe2dfce, .063, .12, 5.6, 0, 2.8, 0, 8);
		const sleeve = group(station, .19, 5.33);
		for (let stripe = 0; stripe < 5; stripe++) {
			const wide = .4 - stripe * .039;
			cylinder(sleeve, stripe % 2 ? 0xffe5ab : 0xda512a, wide, wide - .039, .30, stripe * .30, -stripe * .052, 0, 10).rotation.z = 1.4;
		}
	}

	for (const [x, z, turn] of race ? [[-23, 16, .2], [43, -80, -.35], [-17, -163, .3]] : [[16, 16, -.3], [-33, -26, .3], [38, -61, .5]]) {
		const shelter = place(x, z, 4, 3.6);
		if (!shelter) continue;
		shelter.rotation.y = turn;
		for (const side of [-1, 1]) {
			for (const front of [-1, 1]) box(shelter, 0x59605a, .18, 3.1, .18, side * 2.25, 1.35, front * 1.28);
			const canopy = box(shelter, race ? 0xb04a2d : 0x3a6572, 2.65, .16, 3.2, side * 1.28, 3.05);
			canopy.rotation.z = -side * .22;
			box(shelter, 0xc89c59, 1.16, .73, .84, side * 1.28, .35, -.6);
			box(shelter, 0x836746, 1.24, .1, .91, side * 1.28, .76, -.6);
		}
	}

	for (const [x, z] of race ? [[-16, -23], [49, -53], [31, -96], [-51, -138], [26, -142]]
		: [[-21, 0], [20, -16], [18, -45], [-16, -92], [29, -106], [-31, -116]]) {
		const station = place(x, z, 2.1, 2.3);
		if (!station) continue;
		if (race) {
			for (const side of [-1, 1]) {
				for (let tier = 0; tier < 3; tier++) ring(station, tier === 2 ? 0xedac40 : 0x343938, .68, .14, side * .82, .16 + .29 * tier, 0);
			}
		} else {
			for (const side of [-1, 1]) {
				cylinder(station, 0x515b55, .08, .14, 1.55, side, .63, 0, 8);
				const panel = group(station, side, 1.45, 0);
				panel.rotation.x = -.32;
				box(panel, 0xa5aaa0, 1.74, .14, 1.62);
				for (const col of [-1, 0, 1]) box(panel, 0x284c72, .52, .055, 1.46, col * .545, .09);
			}
		}
	}

	const markers = [];
	for (let index = 1; index < waypoints.length; index++) {
		const [x, z] = waypoints[index];
		const [fromX, fromZ] = waypoints[index - 1];
		const length = Math.hypot(x - fromX, z - fromZ);
		for (const side of [-1, 1]) for (const t of [.33, .68]) {
			const px = THREE.MathUtils.lerp(fromX, x, t) + side * (z - fromZ) / length * 6.3;
			const pz = THREE.MathUtils.lerp(fromZ, z, t) - side * (x - fromX) / length * 6.3;
			if (route_Distance(px, pz, waypoints) > 5.25) markers.push([px, pz]);
		}
	}
	for (const [x, z] of markers) {
		if (obstacles.some(item => Math.hypot(item.x - x, item.z - z) < (item.radius ?? Math.hypot(item.width, item.depth)) + .6)) continue;
		const y = elevation(x, z);
		const color = race ? 0xf47732 : 0x5d9db2;
		box(scene, 0x313c37, .51, .14, .51, x, y + .07, z);
		cylinder(scene, color, .106, .22, .36, x, y + .32, z, 8);
		cylinder(scene, 0xffebba, .081, .106, .08, x, y + .54, z, 8);
		cylinder(scene, color, .045, .081, .12, x, y + .64, z, 8);
	}
}

function add_Bales(scene, details, obstacles) {
	const paper = document.createElement('canvas');
	paper.width = 256;
	paper.height = 256;
	const context = paper.getContext('2d');
	const random = seeded_Random(509);
	context.fillStyle = '#ab874a';
	context.fillRect(0, 0, 256, 256);
	for (let fiber = 0; fiber < 2100; fiber++) {
		const x = random() * 256, y = random() * 256;
		context.strokeStyle = `hsl(${39 + random() * 17} ${32 + random() * 26}% ${32 + random() * 34}%)`;
		context.lineWidth = .45 + random();
		context.beginPath();
		context.moveTo(x, y);
		context.lineTo(x + 4 + random() * 12, y + (random() - .5) * 9);
		context.stroke();
	}
	const texture = new THREE.CanvasTexture(paper);
	texture.colorSpace = THREE.SRGBColorSpace;
	const straw = new THREE.MeshStandardMaterial({ map: texture, color: 0xd4c47f, roughness: 1 });
	const drum = new THREE.CylinderGeometry(.83, .86, 1.28, 18);
	for (const [x, z] of details) {
		const bale = group(scene, x, elevation(x, z) + .76, z);
		bale.rotation.y = (x - z) * .06;
		const shape = new THREE.Mesh(drum, straw);
		shape.rotation.z = Math.PI / 2;
		shape.castShadow = true;
		bale.add(shape);
		for (const side of [-1, 1]) {
			for (let radius = .2; radius < .82; radius += .145) {
				const stripe = ring(bale, 0x937a39, radius, .015, side * .646, 0, 0);
				stripe.rotation.set(0, Math.PI / 2, 0);
			}
		}
		obstacles.push({ x, z, radius: .9, height: 1.68 });
	}
}

function add_Gate(scene, x, z, height, width, yaw, index, race, finish) {
	const y = elevation(x, z);
	const gate = group(scene, x, y, z);
	gate.rotation.y = yaw;
	const accent = race ? index === 0 ? 0x43885c : 0xe34b26 : 0x246c94;
	for (const side of [-1, 1]) {
		box(gate, 0x3c4344, .85, .18, 1.5, side * width / 2, .09);
		for (let bar = 0; bar < 6; bar++) {
			box(gate, bar % 2 ? accent : 0xe7e4d4, .29, height / 6, .29, side * width / 2, (bar + .5) * height / 6);
		}
	}
	box(gate, accent, width + .29, .32, .29, 0, height);
	const banner = document.createElement('canvas');
	banner.width = 192;
	banner.height = 64;
	const context = banner.getContext('2d');
	context.fillStyle = race ? '#1c292d' : '#254f64';
	context.fillRect(0, 0, banner.width, banner.height);
	if (finish) {
		for (let column = 0; column < 12; column++) {
			for (let row = 0; row < 4; row++) {
				if ((column + row) % 2) {
					context.fillStyle = '#8b8e80';
					context.fillRect(column * 16, row * 16, 16, 16);
				}
			}
		}
		context.fillStyle = '#19231d';
		context.fillRect(16, 6, 160, 52);
	}
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.font = `bold ${finish ? 28 : 38}px sans-serif`;
	context.fillStyle = '#ffffe8';
	context.fillText(finish ? text.free.finishGate : String(index + 1).padStart(2, '0'), 96, 33);
	const texture = new THREE.CanvasTexture(banner);
	texture.colorSpace = THREE.SRGBColorSpace;
	const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.34, .47), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
	sign.position.set(0, height + .34, 0);
	gate.add(sign);
	return { x, y, z, height, width, yaw, label: String(index + 1) };
}

export function gate_Crossing(gate, previous, position, heightOffset = 0) {
	const sine = Math.sin(gate.yaw);
	const cosine = Math.cos(gate.yaw);
	const before = (previous.x - gate.x) * sine + (previous.z - gate.z) * cosine;
	const after = (position.x - gate.x) * sine + (position.z - gate.z) * cosine;
	if (before <= 0 || after > 0) return false;
	const t = before / (before - after);
	const x = THREE.MathUtils.lerp(previous.x, position.x, t) - gate.x;
	const z = THREE.MathUtils.lerp(previous.z, position.z, t) - gate.z;
	const y = THREE.MathUtils.lerp(previous.y, position.y, t) - gate.y + heightOffset;
	return Math.abs(x * cosine - z * sine) < gate.width / 2 - .15 && y > .4 && y < gate.height - .16;
}

function add_Lookout(scene, race) {
	const x = race ? 46 : -50, z = race ? -66 : -39;
	const frame = group(scene, x, elevation(x,z)-.12, z);
	const height = race ? 5.5 : 11.3, width = race ? 2.1 : 1.55;
	const upper = race ? width : .41;
	const metal = race ? 0x62665e : 0x78807b;
	function beam(ax,ay,az,bx,by,bz,size) {
		const direction = new THREE.Vector3(bx-ax,by-ay,bz-az);
		const strut = box(frame, metal, size,direction.length(),size,(ax+bx)/2,(ay+by)/2,(az+bz)/2);
		strut.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
	}
	for (const side of [-1,1]) for (const front of [-1,1]) {
		beam(width*side,0,width*front, upper*side,height,upper*front,.17);
		beam(width*side,.4,width*front,-upper*side,height-.3,upper*front,.075);
		beam(width*side,.4,width*front,upper*side,height-.3,-upper*front,.075);
	}
	if (race) {
		box(frame,0x957753,5.1,.25,4.8,0,height);
		for (const side of [-1,1]) {
			for (const front of [-1,1]) box(frame,metal,.12,3.1,.12,side*2.2,height+1.55,front*2.05);
			for (let row=0; row<3; row++) box(frame,0xb79b72,4.5,.17,.10,0,height+.30+row*.38,side*2.05);
			box(frame,0x954634,2.8,.14,5.1,side*1.32,height+3.28).rotation.z=-side*.18;
		}
		for (let step=0;step<15;step++) box(frame,0x9b8061,1.15,.16,.49,2.96,.30+step*.36,4.7-step*.40);
	} else {
		const wheel = group(frame,0,height+.36,.44);
		for (let blade=0;blade<16;blade++) {
			const spoke = group(wheel);
			spoke.rotation.z = blade*Math.PI/8;
			box(spoke,metal,.058,2.55,.08,0,1.27);
			const sail=box(spoke,blade%3 ? 0xb8b4a0 : 0x967968,.57,1.37,.065,0,1.95);
			sail.rotation.y=.34;
		}
		cylinder(wheel,0x895944,.34,.34,.23,0,0,.12).rotation.x=Math.PI/2;
		beam(0,height,0,2.84,height+.39,-1.4,.1);
		box(frame,0x90523b,1.24,.88,.06,2.6,height+.72,-1.34);
	}
	// Проверяем каждый элемент в его локальных осях, чтобы сохранялись просветы под сооружением.
	frame.updateMatrixWorld(true);
	const volumes = [];
	frame.traverse(mesh => {
		if (!mesh.isMesh) return;
		mesh.geometry.computeBoundingBox();
		volumes.push({ inverse: mesh.matrixWorld.clone().invert(), bounds: mesh.geometry.boundingBox.clone().expandByScalar(.09) });
	});
	const probe = new THREE.Vector3();
	return (px,py,pz) => Math.abs(px-x)<6 && Math.abs(pz-z)<6 &&
		volumes.some(v=>v.bounds.containsPoint(probe.set(px,py,pz).applyMatrix4(v.inverse)));
}

function add_PracticeLandscape(scene, waypoints, obstacles, race) {
	const land = create_Landscape(scene, elevation, race ? 3209 : 475);
	const random = seeded_Random(race ? 542 : 714);
	const occupied = [{x:race?46:-50, z:race?-66:-39, r:6}];
	const clear = (x,z,r) => route_Distance(x,z,waypoints) > r + (race ? 4.9 : 5.8)
		&& Math.hypot(x-home.x,z-home.z) > r + 6
		&& obstacles.every(o => Math.hypot(o.x-x,o.z-z) > r + (o.radius ?? Math.hypot(o.width,o.depth)))
		&& occupied.every(o => Math.hypot(o.x-x,o.z-z) > r+o.r);
	// У изгородей оставлены разрывы. Соседние луга и каменные коридоры доступны из основной трассы.
	const fences = race ? [
		[-9,18,-9,-5], [11,17,12,2], [25,-7,38,-28], [45,-37,50,-52], [48,-61,39,-74],
		[9,-42,0,-55], [-4,-57,-14,-67], [-30,-78,-44,-90], [-48,-99,-49,-122], [0,-160,12,-181],
		[38,31,69,29], [73,23,71,-4], [-23,45,-58,38], [-65,32,-70,5], [49,-128,78,-144],
	] : [
		[-12,15,-14,-1], [-16,-9,-25,-25], [-29,-32,-48,-35], [12,18,15,0], [16,-5,32,-14],
		[40,-19,61,-25], [68,-29,73,-53], [70,-61,47,-68], [37,-69,24,-64],
		[-24,36,-55,39], [-62,37,-72,16], [-73,8,-70,-15], [-50,-75,-47,-104],
		[-43,-112,-21,-130], [23,-98,50,-108], [56,-113,76,-133], [1,-158,30,-161],
	];
	for (const [x,z,xx,zz] of fences) {
		const n = Math.ceil(Math.hypot(xx-x,zz-z)/3);
		// Проверяем весь пролёт, включая повороты рядом с воротами.
		const posts = Array.from({length:n+1}, (_,i) => ({x:x+(xx-x)*i/n, z:z+(zz-z)*i/n}));
		if (posts.some(p => route_Distance(p.x,p.z,waypoints) < 4.8)) continue;
		land.fence(x,z,xx,zz, race ? 1.42 : 1.64);
		for (const p of posts) occupied.push({...p,r:.32});
	}
	const groves = race ? [
		[-18,8,12], [20,1,8], [-3,-27,12], [49,-27,9], [54,-55,13], [16,-51,10],
		[-10,-69,11], [-39,-83,13], [5,-101,14], [-52,-122,13], [-19,-141,11],
		[11,-124,12], [35,-158,13], [-57,-29,16], [81,-104,15], [-71,39,13], [47,50,17],
	] : [
		[-20,5,10], [24,4,9], [5,-21,8], [-29,-35,11], [30,-51,14], [-17,-67,11],
		[-63,-46,17], [57,11,16], [56,-91,17], [-46,-99,16], [6,-117,16],
		[-39,-154,18], [35,-160,15], [-55,52,15], [21,47,14], [83,-148,15],
	];
	for (const [cx,cz,spread] of groves) {
		for (let i=0; i<24; i++) {
			const angle=random()*Math.PI*2, d=Math.sqrt(random())*spread;
			const x=cx+Math.cos(angle)*d, z=cz+Math.sin(angle)*d;
			const oak = random() < (race ? .42 : .22), h = (oak ? 6.7 : 6.1) + random()*5;
			const r = h*(oak ? .34 : .24);
			if (!clear(x,z,r)) continue;
			land.tree(x,z,h,oak ? 'oak' : 'birch');
			occupied.push({x,z,r:r*.70});
		}
	}
	const outcrops = race ? [[-13,1],[8,-26],[45,-39],[1,-64],[-32,-82],[-50,-107],[-10,-134],[37,-156],[-50,44],[51,-96]]
		: [[17,9],[-22,-14],[21,-36],[-5,-58],[33,-82],[-52,-80],[48,36],[-18,-114],[16,-146]];
	for (const [cx,cz] of outcrops) {
		for (let i=0;i<15;i++) {
			const x=cx+(random()-.5)*13, z=cz+(random()-.5)*11;
			const w=1.1+random()**2*4.7;
			if (!clear(x,z,w*.40)) continue;
			land.rock(x,z,w, w*(.27+random()*.39),w*(.58+random()*.38),random()*6);
		}
	}
	for (const [x,z,xx,zz] of (race ? [[-19,3,-13,-4],[40,-49,46,-53],[-47,-101,-39,-102],[7,-134,13,-139],[-66,11,-58,16]]
		: [[17,-18,24,-20],[-22,-58,-16,-53],[32,-97,42,-100],[-57,10,-63,18],[-20,-132,-12,-136]])) {
		land.log(x,z,xx,zz,.32 + random()*.22);
	}
	if (race) {
		land.rock(-19,-20,4.3,3.9,4.6,.2);
		land.rock(-26,-20,4.7,4.4,4.2,-.3);
		land.rock(-22.5,-20,10.0,1.32,3.45,0,4.15);
	}
	for (let i=0;i<2300;i++) {
		const x=-100+200*random(), z=-182+246*random();
		if (route_Distance(x,z,waypoints)<4 || Math.abs(x+36+6*Math.sin(z*.025))<1.6) continue;
		for (let j=0;j<3;j++) land.grass(x+random()*1.5,z+random()*1.5,.63+random()*.80);
	}
	land.finish();
	return land;
}

export function create_Field(race) {
	const scene = new THREE.Scene();
	const sun = create_FlightAtmosphere(scene, race ? 'race' : 'field');
	const course = race ? courses.race : courses.field;
	const waypoints = [[home.x, home.z], ...course];
	add_Terrain(scene, waypoints, race);
	const obstacles = [];
	add_Windbreak(scene, seeded_Random(race ? 88 : 27), obstacles);
	for (const [x, z] of [[-41, -58], [70, -102]]) {
		add_Shed(scene, x, z);
		obstacles.push({ x, z, width: 4.5, depth: 3.0, height: 4.5 });
	}
	add_Bales(scene, race
		? [[-8, -28], [-10, -28], [30, -57], [28, -57], [5, -88], [7, -88], [-38, -118], [-40, -118]]
		: [[15, 1], [18, 4], [-18, -17], [-19, -19], [26, -34], [28, -41], [-21, -65], [-25, -62], [6, -81], [4, -83]], obstacles);
	add_FieldLandmarks(scene, obstacles, waypoints, race);
	const touchesLookout = add_Lookout(scene,race);
	const land = add_PracticeLandscape(scene, waypoints, obstacles, race);
	const pad = group(scene, home.x, .02, home.z);
	cylinder(pad, 0x4a5450, padSize, padSize + .06, .14, 0, .03, 0, 36);
	ring(pad, 0xe6debd, padSize - .22, .045, 0, .105, 0);
	for (const side of [-1, 1]) box(pad, 0xe6debd, .17, .025, 1.6, side * .49, .105);
	box(pad, 0xe6debd, .81, .025, .17, 0, .105);
	const gates = course.map((gate, index) => add_Gate(scene, ...gate, index, race, race && index === course.length - 1));
	batch_Scenery(scene);
	const onPad = (x, z) => Math.hypot(x - home.x, z - home.z) <= padSize;
	return {
		scene, sun, gates, limits: bounds, base: home, padRadius: padSize, onPad,
		flightGround: (x, z) => elevation(x, z) + (onPad(x, z) ? .12 : 0),
		touchesTree(x, y, z) {
			if (land.touches(x,y,z) || touchesLookout(x,y,z)) return true;
			if (obstacles.some(obstacle => {
				const dx = Math.abs(x - obstacle.x), dz = Math.abs(z - obstacle.z);
				if (obstacle.radius ? Math.hypot(dx, dz) > obstacle.radius : dx > obstacle.width || dz > obstacle.depth) return false;
				const localY = y - elevation(obstacle.x, obstacle.z);
				return localY > 0 && localY < obstacle.height && (!obstacle.tree || localY > obstacle.height * .47 || Math.hypot(dx, dz) < .42);
			})) return true;
			return gates.some(gate => {
				const dx = x - gate.x, dz = z - gate.z, dy = y - gate.y;
				const sine = Math.sin(gate.yaw), cosine = Math.cos(gate.yaw);
				const span = Math.abs(dx * cosine - dz * sine);
				if (Math.abs(dx * sine + dz * cosine) > .27 || dy < 0 || dy > gate.height + .2) return false;
				return Math.abs(span - gate.width / 2) < .28 || (span < gate.width / 2 && Math.abs(dy - gate.height) < .23);
			});
		},
	};
}
