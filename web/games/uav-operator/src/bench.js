import * as THREE from 'three';
import { create_Lighting } from './coast.js';
import { box, componentPlugs, create_Component, create_Propeller, create_Screw, create_Screwdriver, cylinder, group, palette } from './models.js';

export const connections = { camera: 'CAM', gps: 'GPS', speed: 'ESC', receiver: 'RX', transmitter: 'VTX', battery: 'PWR' };
export const componentColors = { camera: palette.blue, gps: palette.mint, speed: palette.coral, receiver: 0xdab179, transmitter: 0xc3a5ed, battery: palette.lime };
export const screwTurns = 3;

// Уровень пола внутри корпуса и верх стенок. Все модули ниже крышки, поэтому корпус закрывается без зазоров.
const floorLevel = .39;
const wallTop = .98;
const lidHalf = .04;
const screwRise = .3;
const flightController = { x: 0, z: -.08, top: .56 };

// Отсеки модулей в корпусе (центр основания модуля) и разъёмы на полётном контроллере.
const bays = {
	camera: { x: 0, z: -1.12, port: [0, -.27] },
	receiver: { x: -.7, z: -1.08, port: [-.2, -.27] },
	transmitter: { x: .7, z: -1.08, port: [.2, -.27] },
	gps: { x: -.74, z: -.08, port: [-.27, .02] },
	speed: { x: .74, z: -.08, port: [.27, .02] },
	battery: { x: 0, z: 1.05, port: [0, .27] },
};
const bayFootprints = { camera: [.62, .7], receiver: [.56, .44], transmitter: [.6, .5], gps: [.58, .58], speed: [.62, .62], battery: [1.34, .68] };
const screwHoles = [[-.98, -1.38], [.98, -1.38], [.98, 1.38], [-.98, 1.38]];

// Две раскладки стола: широкая для горизонтального экрана и вытянутая для телефона в портретной ориентации.
const layouts = {
	wide: {
		tiles: [[-4, -1.9], [4, -1.9], [-4, .1], [4, .1], [-4, 2.1], [4, 2.1]],
		bounds: { minX: -4.75, maxX: 4.75, minZ: -5.75, maxZ: 3.1 }, elevation: .92,
	},
	tall: {
		tiles: [[-2.4, 4.15], [0, 4.15], [2.4, 4.15], [-2.4, 5.55], [0, 5.55], [2.4, 5.55]],
		bounds: { minX: -3.35, maxX: 3.35, minZ: -5.75, maxZ: 6.25 }, elevation: 1.08,
	},
};
const lidParking = new THREE.Vector3(0, .04 + lidHalf, -4.45);
const trayCenter = new THREE.Vector3(2.75, .04, -4.45);
const driverRest = new THREE.Vector3(-2.75, .15, -5.25);

function create_Label(caption, color) {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 64;
	const ink = canvas.getContext('2d');
	ink.font = '600 34px "IBM Plex Mono", monospace';
	ink.textAlign = 'center';
	ink.textBaseline = 'middle';
	ink.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
	ink.fillText(caption, 64, 34);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const label = new THREE.Mesh(new THREE.PlaneGeometry(.36, .18), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
	label.rotation.x = -Math.PI / 2;
	return label;
}

function create_Hull(drone) {
	const shell = 0x2b3236;
	// Опоры, нижняя пластина и пол отсека.
	for (const x of [-.95, .95]) for (const z of [-1.3, 1.3]) cylinder(drone, palette.ink, .07, .07, .26, x, .17, z);
	box(drone, palette.ink, 2.5, .08, 3.3, 0, .34);
	box(drone, 0x223633, 2.3, .01, 3.1, 0, floorLevel - .005);
	// Стенки корпуса. В носовой стенке оставлено окно для объектива камеры.
	const wallHeight = wallTop - .38;
	const wallY = .38 + wallHeight / 2;
	for (const side of [-1, 1]) box(drone, shell, .1, wallHeight, 3.3, side * 1.2, wallY);
	box(drone, shell, 2.3, wallHeight, .1, 0, wallY, 1.6);
	for (const side of [-1, 1]) box(drone, shell, .83, wallHeight, .1, side * .735, wallY, -1.6);
	box(drone, shell, .64, .12, .1, 0, .44, -1.6);
	box(drone, shell, .64, .08, .1, 0, .94, -1.6);
	for (const side of [-1, 1]) box(drone, 0x3c464c, .02, .03, 3.3, side * 1.25, wallTop - .02);
	// Стойки под винты крышки.
	for (const [x, z] of screwHoles) {
		cylinder(drone, 0x3a4248, .1, .1, wallTop - floorLevel, x, (wallTop + floorLevel) / 2, z, 14);
		cylinder(drone, 0x111517, .04, .04, .01, x, wallTop + .003, z, 10);
	}
	// Лучи, моторы и пропеллеры.
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			const dx = sx * 1.4;
			const dz = sz * 1.05;
			const arm = box(drone, palette.dark, Math.hypot(dx, dz), .12, .26, sx * 1.6, .34, sz * 1.725);
			arm.rotation.y = Math.atan2(-dz, dx);
			const motorX = sx * 2.3;
			const motorZ = sz * 2.25;
			cylinder(drone, 0x2a2e31, .3, .3, .06, motorX, .41, motorZ, 20);
			cylinder(drone, 0x23262a, .26, .28, .3, motorX, .59, motorZ, 20);
			cylinder(drone, 0x8e7052, .27, .27, .04, motorX, .76, motorZ, 20);
			create_Propeller(drone, motorX, .8, motorZ, .78, sx * sz > 0).rotation.y = sx * sz * .43;
			box(drone, sz < 0 ? palette.mint : palette.coral, .14, .06, .06, sx * 2.0, .42, sz * 2.0);
		}
	}
}

function create_FlightController(drone) {
	const board = group(drone, flightController.x, 0, flightController.z);
	for (const x of [-.27, .27]) for (const z of [-.27, .27]) cylinder(board, 0xc7a465, .025, .025, .1, x, floorLevel + .05, z, 6);
	box(board, 0x1d3b33, .64, .05, .64, 0, .515);
	box(board, 0x151b20, .2, .03, .2, 0, .555);
	box(board, 0x151b20, .08, .025, .08, .14, .552, .12);
	box(board, palette.lime, .03, .02, .03, -.22, .55, .22);
	box(board, palette.blue, .03, .02, .03, -.17, .55, .22);
}

export function create_Bench({ parts, preinstalled }) {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x242d2c);
	const camera = new THREE.PerspectiveCamera(36, 1, .1, 120);
	const sun = create_Lighting(scene, 9);
	sun.position.set(-6, 14, 5);
	box(scene, 0x3a4743, 26, .4, 22, 0, -.2);
	box(scene, 0x1e302e, 11.6, .04, 13.6, 0, .02, -.2);
	const grid = new THREE.GridHelper(11.2, 28, 0x557264, 0x344b46);
	grid.scale.z = 13.2 / 11.2;
	grid.position.set(0, .045, -.2);
	scene.add(grid);
	const drone = group(scene);
	create_Hull(drone);
	create_FlightController(drone);
	const selectable = [];
	const anchors = new Map();
	const mark = (object, control) => {
		object.traverse(child => {
			if (!child.isMesh) return;
			child.userData.control = control;
			selectable.push(child);
		});
	};
	// Лоток для винтов на столе.
	cylinder(scene, 0x4b5258, .58, .52, .08, trayCenter.x, trayCenter.y + .04, trayCenter.z, 24);
	cylinder(scene, 0x252b2f, .5, .5, .02, trayCenter.x, trayCenter.y + .08, trayCenter.z, 24);
	// Отсеки и разъёмы. Подсвеченная площадка отсека тоже принимает модуль.
	const highlightMaterials = new Map();
	const portPositions = {};
	for (const [type, bay] of Object.entries(bays)) {
		const color = componentColors[type];
		const [width, depth] = bayFootprints[type];
		const zoneMaterial = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: .16, roughness: 1, depthWrite: false });
		const zone = new THREE.Mesh(new THREE.BoxGeometry(width, .01, depth), zoneMaterial);
		zone.position.set(bay.x, floorLevel + .006, bay.z);
		drone.add(zone);
		for (const [frameWidth, frameDepth, x, z] of [[width, .02, 0, -depth / 2], [width, .02, 0, depth / 2], [.02, depth, -width / 2, 0], [.02, depth, width / 2, 0]]) {
			box(drone, color, frameWidth, .012, frameDepth, bay.x + x, floorLevel + .007, bay.z + z);
		}
		const label = create_Label(connections[type], color);
		label.position.set(bay.x, floorLevel + .015, bay.z + depth / 2 - .12);
		drone.add(label);
		const portMaterial = new THREE.MeshStandardMaterial({ color, roughness: .5 });
		const port = new THREE.Mesh(new THREE.BoxGeometry(.13, .06, .09), portMaterial);
		const [portX, portZ] = bay.port;
		port.position.set(flightController.x + portX, flightController.top + .01, flightController.z + portZ);
		if (Math.abs(portX) > Math.abs(portZ)) port.rotation.y = Math.PI / 2;
		drone.add(port);
		portPositions[type] = port.position.clone().add(new THREE.Vector3(0, .02, 0));
		const control = `port-${connections[type]}`;
		mark(zone, control);
		mark(port, control);
		anchors.set(control, zone.position);
		highlightMaterials.set(control, [zoneMaterial, portMaterial]);
	}
	// Модули на столе и предустановленные модули в отсеках.
	const models = {};
	for (const type of [...parts, ...preinstalled]) {
		const model = create_Component(scene, type);
		const locked = preinstalled.includes(type);
		if (locked) model.position.set(bays[type].x, floorLevel, bays[type].z);
		mark(model, `part-${type}`);
		models[type] = { model, locked, tile: parts.indexOf(type), cable: null };
		anchors.set(`part-${type}`, model.position);
	}
	// Крышка с четырьмя отверстиями под винты.
	const lidMaterial = new THREE.MeshStandardMaterial({ color: 0x2e3438, roughness: .7 });
	const lid = group(scene);
	const plate = new THREE.Mesh(new THREE.BoxGeometry(2.5, lidHalf * 2, 3.3), lidMaterial);
	plate.castShadow = plate.receiveShadow = true;
	lid.add(plate);
	box(lid, 0x3b4248, 1.5, .03, 2.1, 0, lidHalf + .015, .05);
	for (let index = 0; index < 5; index++) box(lid, 0x1a1f22, .9, .012, .05, 0, lidHalf + .032, .55 + index * .14);
	box(lid, palette.lime, .06, .012, 1.2, -.62, lidHalf + .032, -.25);
	for (const [x, z] of screwHoles) cylinder(lid, 0x111517, .07, .07, .01, x, lidHalf + .002, z, 12);
	mark(lid, 'lid');
	anchors.set('lid', lid.position);
	highlightMaterials.set('lid', [lidMaterial]);
	// Винты. Каждый знает своё отверстие, место в лотке и глубину закручивания (1 - затянут).
	const screws = screwHoles.map(([x, z], index) => {
		const { screw, surfaces } = create_Screw(scene);
		mark(screw, `screw-${index}`);
		anchors.set(`screw-${index}`, screw.position);
		highlightMaterials.set(`screw-${index}`, surfaces);
		const traySpot = new THREE.Vector3(trayCenter.x + (index % 2 ? .2 : -.2), trayCenter.y + .12, trayCenter.z + (index < 2 ? -.18 : .18));
		screw.position.set(x, wallTop + lidHalf * 2, z);
		return { screw, hole: new THREE.Vector3(x, lidHalf, z), traySpot, state: 'lid', depth: 1, shownDepth: 1, spin: 0 };
	});
	const { tool: driver, surfaces: driverSurfaces } = create_Screwdriver(scene);
	mark(driver, 'driver');
	driver.position.copy(driverRest);
	const driverCenter = new THREE.Vector3();
	anchors.set('driver', driverCenter);
	highlightMaterials.set('driver', driverSurfaces);
	const ray = new THREE.Raycaster();
	const projected = new THREE.Vector3();
	const holeWorld = new THREE.Vector3();
	const targetPosition = new THREE.Vector3();
	const targetQuaternion = new THREE.Quaternion();
	const turnEuler = new THREE.Euler();
	const lying = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
	const screwLying = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
	const handTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.32, 0, .24));
	driver.quaternion.copy(lying);
	let layout = layouts.wide;
	let angle = .18;
	let lastAngle;
	let lastLayout;
	let lidProgress = 0;
	let tilesPlaced = false;

	function tile_Position(type) {
		const [x, z] = layout.tiles[models[type].tile];
		return new THREE.Vector3(x, .07, z);
	}

	// Тайлы под модулями на столе. Перестраиваются при смене раскладки.
	const tiles = parts.map(() => {
		const tile = box(scene, 0x303f39, 1.2, .03, 1.1, 0, .055, 0);
		tile.receiveShadow = true;
		return tile;
	});

	function place_Tiles() {
		parts.forEach((type, index) => {
			const [x, z] = layout.tiles[index];
			tiles[index].position.set(x, .055, z);
		});
	}

	// Камера подбирает расстояние так, чтобы стол целиком помещался в кадр при любом соотношении сторон.
	function fit_Camera() {
		const { bounds, elevation } = layout;
		const center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
		const direction = new THREE.Vector3(Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation));
		const corners = [];
		for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) for (const y of [0, 1.1]) corners.push(new THREE.Vector3(x, y, z));
		let near = 4;
		let far = 80;
		for (let step = 0; step < 24; step++) {
			const distance = (near + far) / 2;
			camera.position.copy(center).addScaledVector(direction, distance);
			camera.lookAt(center);
			camera.updateMatrixWorld();
			const fits = corners.every(corner => {
				projected.copy(corner).project(camera);
				return Math.abs(projected.x) <= .95 && projected.y <= .74 && projected.y >= -.9;
			});
			if (fits) far = distance;
			else near = distance;
		}
		camera.position.copy(center).addScaledVector(direction, far);
		camera.lookAt(center);
		camera.updateMatrixWorld();
	}

	function cable_For(type) {
		const plug = new THREE.Vector3(...componentPlugs[type]).add(new THREE.Vector3(bays[type].x, floorLevel, bays[type].z));
		const port = portPositions[type];
		const middle = plug.clone().lerp(port, .5);
		middle.y = Math.max(plug.y, port.y) + .06;
		const curve = new THREE.CatmullRomCurve3([plug, plug.clone().lerp(middle, .5).setY(middle.y - .02), middle, port.clone().setY(port.y + .05), port]);
		const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .022, 6), new THREE.MeshStandardMaterial({ color: componentColors[type], roughness: .6 }));
		cable.castShadow = true;
		scene.add(cable);
		return cable;
	}

	function remove_Cable(entry) {
		if (!entry.cable) return;
		entry.cable.geometry.dispose();
		entry.cable.material.dispose();
		entry.cable.removeFromParent();
		entry.cable = null;
	}

	function pose_Driver(bench, delta, time) {
		const blend = 1 - Math.exp(-12 * delta);
		if (bench.driverState === 'engaged') {
			const target = screws[bench.engagedScrew];
			targetPosition.copy(target.screw.position).add(new THREE.Vector3(0, .055, 0));
			targetQuaternion.setFromEuler(turnEuler.set(0, target.screw.rotation.y, 0));
		} else if (bench.driverState === 'hand') {
			targetPosition.copy(bench.handPoint);
			targetPosition.y += Math.sin(time * 2.4) * .04;
			targetQuaternion.copy(handTilt);
		} else {
			targetPosition.copy(driverRest);
			targetQuaternion.copy(lying);
		}
		driver.position.lerp(targetPosition, bench.driverState === 'engaged' ? 1 - Math.exp(-22 * delta) : blend);
		driver.quaternion.slerp(targetQuaternion, blend);
		driverCenter.copy(driver.position).add(new THREE.Vector3(0, .9, 0).applyQuaternion(driver.quaternion));
	}

	function pose_Screws(delta) {
		const blend = 1 - Math.exp(-10 * delta);
		lid.updateMatrixWorld();
		for (const entry of screws) {
			entry.shownDepth = THREE.MathUtils.damp(entry.shownDepth, entry.depth, 9, delta);
			if (entry.state === 'tray') {
				entry.screw.position.lerp(entry.traySpot, blend);
				entry.screw.quaternion.slerp(screwLying, blend);
				continue;
			}
			holeWorld.copy(entry.hole).applyMatrix4(lid.matrixWorld);
			targetPosition.copy(holeWorld).add(new THREE.Vector3(0, (1 - entry.shownDepth) * screwRise, 0));
			// Только что вставленный винт плавно прилетает из лотка, затем точно встаёт в отверстие.
			if (entry.screw.position.distanceTo(targetPosition) > .02) entry.screw.position.lerp(targetPosition, blend);
			else entry.screw.position.copy(targetPosition);
			entry.screw.quaternion.setFromEuler(turnEuler.set(0, -entry.shownDepth * screwTurns * Math.PI * 2, 0));
		}
	}

	function pose_Lid(bench, delta) {
		// После последнего подключения даём модулю опуститься в отсек перед движением крышки.
		if (!bench.lidOpen && lidProgress > .5 && Object.values(models).some(entry => !entry.cable)) return;
		lidProgress = THREE.MathUtils.damp(lidProgress, bench.lidOpen ? 1 : 0, 5, delta);
		if (Math.abs(lidProgress - (bench.lidOpen ? 1 : 0)) < .002) lidProgress = bench.lidOpen ? 1 : 0;
		lid.position.set(0, wallTop + lidHalf, 0).lerp(lidParking, lidProgress);
		lid.position.y += Math.sin(lidProgress * Math.PI) * 1.8;
		lid.rotation.set(0, lidProgress * Math.PI / 2, 0);
	}

	return {
		scene, camera, installed: new Set(preinstalled), selected: null, lidOpen: false,
		driverState: 'table', engagedScrew: null, handPoint: new THREE.Vector3(0, 2.3, .4), highlight: new Set(), screws,
		// Положение модуля для линии перетаскивания (в нормализованных координатах экрана).
		projected_Part(type) {
			return models[type].model.position.clone().add(new THREE.Vector3(0, .25, 0)).project(camera);
		},
		lid_Settled() {
			return lidProgress === (this.lidOpen ? 1 : 0);
		},
		rotate() { angle += Math.PI / 4; lastAngle = null; },
		// Ищет объект под указателем. Если луч не попал в подходящий объект, берём ближайший на экране:
		// так на телефоне легче попасть пальцем по мелким винтам и разъёмам.
		nearest_Screw(x, y, radiusX, radiusY) {
			let best = null;
			let closest = 1;
			for (const [index, entry] of screws.entries()) {
				const control = `screw-${index}`;
				if (!this.highlight.has(control)) continue;
				projected.copy(entry.screw.position).project(camera);
				const distance = Math.hypot((projected.x - x) / radiusX, (projected.y - y) / radiusY);
				if (distance > closest) continue;
				best = control;
				closest = distance;
			}
			return best;
		},
		pick(x, y, accept, tolerance) {
			ray.setFromCamera({ x, y }, camera);
			const hit = ray.intersectObjects(selectable, false).find(entry => entry.object.visible);
			if (hit && accept(hit.object.userData.control)) return hit.object.userData.control;
			let nearest = null;
			let nearestDistance = 1;
			for (const [control, position] of anchors) {
				if (!accept(control)) continue;
				projected.copy(position).project(camera);
				const distance = Math.hypot((projected.x - x) / tolerance.x, (projected.y - y) / tolerance.y);
				if (distance < nearestDistance) {
					nearest = control;
					nearestDistance = distance;
				}
			}
			return nearest;
		},
		// Точка на высоте 1.6 под указателем: туда перемещается отвёртка в руке.
		aim_Hand(x, y) {
			ray.setFromCamera({ x, y }, camera);
			const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.7);
			const point = ray.ray.intersectPlane(plane, new THREE.Vector3());
			if (point) this.handPoint.set(THREE.MathUtils.clamp(point.x, -4, 4), 1.7, THREE.MathUtils.clamp(point.z, -6, 5));
		},
		resize(aspect) {
			const nextLayout = aspect < .95 ? layouts.tall : layouts.wide;
			if (aspect === camera.aspect && angle === lastAngle && nextLayout === lastLayout) return;
			lastAngle = angle;
			lastLayout = layout = nextLayout;
			camera.aspect = aspect;
			camera.updateProjectionMatrix();
			place_Tiles();
			fit_Camera();
			// При первом показе модули сразу лежат на своих местах, а не прилетают из центра стола.
			if (!tilesPlaced) {
				tilesPlaced = true;
				for (const [type, entry] of Object.entries(models)) if (!entry.locked) entry.model.position.copy(tile_Position(type));
			}
		},
		update(delta, time) {
			pose_Lid(this, delta);
			pose_Screws(delta);
			pose_Driver(this, delta, time);
			for (const [type, entry] of Object.entries(models)) {
				const { model } = entry;
				const installed = this.installed.has(type);
				const selected = this.selected === type;
				const blend = 1 - Math.exp(-10 * delta);
				const target = installed ? new THREE.Vector3(bays[type].x, floorLevel, bays[type].z) : tile_Position(type);
				if (selected && !installed) target.y = 1.35 + Math.sin(time * 4) * .1;
				// Модуль сначала поднимается, затем опускается в отсек, чтобы не проходить сквозь стенки.
				const far = Math.hypot(model.position.x - target.x, model.position.z - target.z) > .08;
				if (far && (installed || model.position.y > .3)) target.y = Math.max(target.y, 1.3);
				model.position.lerp(target, blend);
				model.rotation.y = installed ? 0 : selected ? time * .66 : -.25;
				const seated = installed && model.position.distanceTo(new THREE.Vector3(bays[type].x, floorLevel, bays[type].z)) < .03;
				if (seated && !entry.cable) entry.cable = cable_For(type);
				else if (!seated && entry.cable) remove_Cable(entry);
			}
			// Пульсирующая подсветка объектов, с которыми сейчас нужно работать.
			const glow = .18 + .16 * Math.sin(time * 5.5);
			for (const [control, surfaces] of highlightMaterials) {
				const lit = this.highlight.has(control);
				for (const surface of surfaces) {
					if (surface.transparent) surface.opacity = lit ? .3 + glow : .16;
					else surface.emissive.setRGB(lit ? glow : 0, lit ? glow * .9 : 0, lit ? glow * .45 : 0);
				}
			}
		},
	};
}
