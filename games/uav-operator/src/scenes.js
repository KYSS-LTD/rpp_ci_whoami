import * as THREE from 'three';
import { beach_Texture, base, create_Coast, create_Lighting, seeded_Random, terrain_Height } from './coast.js';
import { box, cylinder, create_Component, group, palette, ring } from './models.js';

export const connections = { camera: 'CAM', gps: 'GPS', speed: 'MOT', battery: 'PWR' };
export const componentColors = { camera: palette.blue, gps: palette.mint, speed: palette.coral, battery: palette.lime };
export const partOrder = ['speed', 'camera', 'battery', 'gps'];

export function create_Renderer(canvas) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.10;
	return renderer;
}

const renderSize = new THREE.Vector2();

export function resize_Frame(renderer, stage) {
	const { clientWidth: width, clientHeight: height } = renderer.domElement;
	if (!width || !height) return;
	const ratio = Math.min(window.devicePixelRatio || 1, 1.65, Math.sqrt(2000000 / (width * height)));
	const currentSize = renderer.getSize(renderSize);
	if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
	if (currentSize.x !== width || currentSize.y !== height) renderer.setSize(width, height, false);
	stage.resize?.(width / height);
}

export function create_Home(coast) {
	const { scene, fieldDrone, seaTime } = coast;
	const camera = new THREE.PerspectiveCamera(41, 1, .13, 680);
	camera.position.set(46, 31, 50);
	camera.lookAt(-9, 2, -7);
	camera.updateMatrixWorld();
	return {
		scene, camera,
		resize(aspect) {
			camera.aspect = aspect;
			camera.updateProjectionMatrix();
		},
		update(delta, time) {
			fieldDrone.drone.scale.setScalar(1.5);
			fieldDrone.drone.position.set(camera.aspect > 1.2 ? .49 : .10, camera.aspect > 1.2 ? .04 : .35, 0).unproject(camera);
			fieldDrone.drone.position.sub(camera.position).normalize().multiplyScalar(13).add(camera.position);
			fieldDrone.drone.position.y += Math.sin(time * 1.6) * .16;
			fieldDrone.drone.rotation.set(.15 + Math.sin(time) * .035, Math.PI * .96 + Math.sin(time * .58) * .20, -.16);
			for (const [index, propeller] of fieldDrone.propellers.entries()) propeller.rotation.y += delta * (index % 2 ? -9 : 9);
			seaTime.value = time;
		},
	};
}

export function create_Bench() {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x242d2c);
	const camera = new THREE.PerspectiveCamera(36, 1, .1, 80);
	const sun = create_Lighting(scene, 8);
	sun.position.set(-6, 12, 5);
	box(scene, 0x3a4743, 19, .35, 14, 0, -.55);
	box(scene, 0x1e302e, 9.2, .10, 6.9, 0, -.325);
	const grid = new THREE.GridHelper(8.8, 22, 0x557264, 0x344b46);
	grid.scale.z = .74;
	grid.position.y = -.268;
	scene.add(grid);
	const frame = group(scene);
	box(frame, palette.ink, 2.42, .24, 2.85, 0, .08);
	box(frame, 0x247058, 1.97, .12, 2.24, 0, .26);
	box(frame, 0x1a2727, .52, .1, .52, 0, .37);
	for (const x of [-1, 1]) {
		for (const z of [-1, 1]) {
			box(frame, palette.dark, 1.57, .16, .32, x * 1.59, .045, z * 1.06).rotation.y = -x * z * .42;
			cylinder(frame, palette.dark, .35, .40, .38, x * 2.18, .19, z * 1.34);
			cylinder(frame, palette.metal, .24, .30, .11, x * 2.18, .42, z * 1.34);
			box(frame, palette.shell, 1.32, .037, .13, x * 2.18, .49, z * 1.34).rotation.y = z * x * .43;
			cylinder(frame, palette.ink, .32, .32, .1, x * .95, -.08, z * 1.13);
		}
	}
	const sockets = [[-.65, -.69], [.65, -.69], [.65, .69], [-.65, .69]];
	const bayPositions = [[-3.52, -1.43], [3.52, -1.43], [3.52, 1.43], [-3.52, 1.43]];
	const parts = {};
	const selectable = [];
	Object.keys(connections).forEach((type, index) => {
		const [socketX, socketZ] = sockets[index];
		const [bayX, bayZ] = bayPositions[index];
		const socket = box(frame, componentColors[type], .45, .11, .25, socketX, .37, socketZ);
		socket.userData.control = `port-${connections[type]}`;
		selectable.push(socket);
		box(scene, 0x303f39, 1.35, .055, 1.26, bayX, -.235, bayZ);
		const model = create_Component(scene, type);
		model.position.set(bayX, .02, bayZ);
		model.traverse(object => {
			if (!object.isMesh) return;
			object.userData.control = `part-${type}`;
			selectable.push(object);
		});
		parts[type] = { model, socketX, socketZ, bayX, bayZ };
	});
	const lid = group(scene, 0, .56, 0);
	box(lid, palette.dark, 2.17, .13, 2.42);
	for (const side of [-1, 1]) box(lid, palette.lime, .045, .025, 1.6, side * .84, .08);
	const screw = cylinder(lid, palette.metal, .16, .14, .10, 0, .11, .72);
	box(screw, palette.ink, .19, .02, .04, 0, .054);
	const driver = group(scene, 0, .75, .72);
	cylinder(driver, palette.metal, .045, .025, .89, 0, .45, 0);
	cylinder(driver, palette.coral, .14, .10, .60, 0, 1.18, 0, 8);
	box(driver, palette.ink, .065, .43, .05, 0, 1.2, .115);
	driver.visible = false;
	const ray = new THREE.Raycaster();
	let angle = .20;
	return {
		turn: 0, tool: false, scene, camera, installed: new Set(), selected: null,
		wireEnds(type) {
			const part = parts[type];
			const plug = part.model.position.clone();
			plug.y += .14;
			const socket = new THREE.Vector3(part.socketX, .47, part.socketZ);
			return [plug.project(camera), socket.project(camera)];
		},
		rotate() { angle += Math.PI / 4; },
		pick(x, y) {
			ray.setFromCamera({ x, y }, camera);
			return ray.intersectObjects(selectable, false)[0]?.object.userData.control;
		},
		resize(aspect) {
			camera.aspect = aspect;
			camera.updateProjectionMatrix();
			const distance = Math.max(11.5, 15 / aspect);
			camera.position.set(Math.sin(angle) * distance * .61, distance * .77, Math.cos(angle) * distance * .61);
			camera.lookAt(0, 0, 0);
		},
		update(delta, time) {
			driver.visible = this.tool && this.turn < 1;
			driver.rotation.y = screw.rotation.y = this.turn * Math.PI * 6;
			driver.position.y = .75 + this.turn * .23;
			screw.position.y = .11 + this.turn * .23;
			lid.position.z = THREE.MathUtils.lerp(lid.position.z, this.turn >= 1 ? -3.25 : 0, 1 - Math.exp(-7 * delta));
			for (const [type, part] of Object.entries(parts)) {
				const installed = this.installed.has(type);
				const selected = this.selected === type;
				const blend = 1 - Math.exp(-10 * delta);
				part.model.position.x = THREE.MathUtils.lerp(part.model.position.x, installed ? part.socketX * 2.45 : part.bayX, blend);
				part.model.position.z = THREE.MathUtils.lerp(part.model.position.z, installed ? part.socketZ : part.bayZ, blend);
				part.model.position.y = THREE.MathUtils.lerp(part.model.position.y, installed ? .55 : selected ? .58 + Math.sin(time * 4) * .12 : .02, blend);
				part.model.rotation.y = installed ? 0 : selected ? time * .66 : -.25;
			}
		},
	};
}

export function add_Beacon(scene, point, color, radius) {
	const y = Math.max(0, terrain_Height(point.x, point.z));
	const beacon = group(scene, point.x, y, point.z);
	const marker = ring(beacon, color, radius, .08, 0, .22, 0);
	const points = marker.geometry.attributes.position;
	for (let index = 0; index < points.count; index++) {
		const ground = Math.max(0, terrain_Height(point.x + points.getX(index), point.z - points.getY(index)));
		points.setZ(index, points.getZ(index) + ground - y);
	}
	marker.geometry.computeVertexNormals();
	marker.castShadow = false;
	return beacon;
}

export const photoSize = { width: 28, height: 17.5 };
const litter = [
	{ kind: 'bottle', x: -8.1, z: -3.5, angle: -.67 }, { kind: 'bag', x: .7, z: 3.45, angle: .53 },
	{ kind: 'can', x: 7.3, z: -2.85, angle: -.22 }, { kind: 'bottle', x: 9.6, z: 4.75, angle: 1.09 },
];

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
	} else {
		cylinder(holder, 0xe46853, .39, .39, .79, 0, .39, 0).rotation.x = Math.PI / 2;
		for (const end of [-.41, .41]) cylinder(holder, 0xbcc2bc, .41, .41, .055, 0, .39, end).rotation.x = Math.PI / 2;
	}
}

export function create_Photo() {
	const scene = new THREE.Scene();
	const sun = create_Lighting(scene, 19);
	sun.position.set(-25, 29, -31);
	const camera = new THREE.OrthographicCamera(-14, 14, 8.75, -8.75, .1, 80);
	camera.position.set(0, 26, 0);
	camera.up.set(0, 0, -1);
	camera.lookAt(0, 0, 0);
	const sand = new THREE.Mesh(new THREE.PlaneGeometry(29, 18.5), new THREE.MeshStandardMaterial({ map: beach_Texture(4, 2.5) }));
	sand.rotation.x = -Math.PI / 2;
	sand.receiveShadow = true;
	scene.add(sand);
	const random = seeded_Random(219);
	const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
	for (let index = 0; index < 51; index++) {
		const x = random() * 28 - 14;
		const z = random() * 18 - 9;
		if (litter.some(item => Math.hypot(item.x - x, item.z - z) < 1.5)) continue;
		const size = .09 + random() * .46;
		const rock = new THREE.Mesh(rockGeometry, new THREE.MeshStandardMaterial({ color: index % 2 ? 0xa29a83 : 0xc5b49a, flatShading: true }));
		rock.position.set(x, .04, z);
		rock.scale.set(size * 1.3, size * .57, size);
		rock.rotation.y = random() * Math.PI;
		rock.castShadow = true;
		scene.add(rock);
	}
	for (const [x, z, angle] of [[-8.6, 4.8, .31], [4, -5.5, -.53], [13.1, -.21, .43], [-2.8, -2.6, 1.05]]) {
		const log = box(scene, 0xa47e59, .34, .20, 3.16, x, .108, z);
		log.rotation.y = angle;
	}
	for (const [x, z, color] of [[-12, -6.1, 0xda775b], [-3.9, 6.7, 0x569791], [11.7, -7.1, 0x9b834d]]) {
		const parasol = group(scene, x, 0, z);
		cylinder(parasol, palette.dark, .06, .06, 1.37, 0, .68, 0);
		cylinder(parasol, color, .05, .88, .42, 0, 1.32, 0, 8);
		cylinder(parasol, palette.shell, .23, .41, .095, 0, 1.38, 0, 8);
	}
	const targets = litter.map(item => {
		const holder = group(scene, item.x, 0, item.z);
		holder.rotation.y = item.angle;
		create_Litter(holder, item.kind);
		const bounds = new THREE.Box3().setFromObject(holder);
		return { kind: item.kind,
			x: .5 + bounds.min.x / photoSize.width, y: .5 + bounds.min.z / photoSize.height,
			w: (bounds.max.x - bounds.min.x) / photoSize.width, h: (bounds.max.z - bounds.min.z) / photoSize.height };
	});
	return { scene, camera, targets,
		update() {
			// Перерисовываем статичный снимок после декодирования фототекстуры.
			if (sand.material.map.image?.complete) delete this.update;
		},
	};
}
