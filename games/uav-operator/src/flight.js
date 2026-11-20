import * as THREE from 'three';
import { base, limits, sectors, shore, terrain_Height } from './coast.js';
import { bind_FlightInputs, bind_Joystick } from './inputs.js';
import { add_Beacon } from './scenes.js';
import { palette } from './models.js';
import { query, scene_Frame, set_Status, stage_Shell } from './ui.js';
import { text } from './text.js';

const scanRadius = 6.5;
const landRadius = 4.4;
const points = [base, ...sectors];

function draw_Map(context, x, z, heading, scanned) {
	const width = context.canvas.width;
	const height = context.canvas.height;
	const plotX = world => 11 + (world - limits.minX) / (limits.maxX - limits.minX) * (width - 22);
	const plotZ = world => 11 + (world - limits.minZ) / (limits.maxZ - limits.minZ) * (height - 22);
	context.fillStyle = '#234346';
	context.fillRect(0, 0, width, height);
	context.fillStyle = '#596054';
	context.beginPath();
	context.moveTo(0, 0);
	for (let y = 0; y <= height; y += 2) {
		context.lineTo(plotX(shore(limits.minZ + (y - 11) / (height - 22) * (limits.maxZ - limits.minZ))), y);
	}
	context.lineTo(0, height);
	context.fill();
	context.setLineDash([3, 4]);
	context.strokeStyle = '#a9b8ad';
	context.strokeRect(8, 8, width - 16, height - 16);
	context.setLineDash([]);
	context.font = 'bold 14px monospace';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	for (const point of points) {
		context.fillStyle = scanned.has(point) ? '#25453d' : '#172522';
		context.beginPath();
		context.arc(plotX(point.x), plotZ(point.z), 9.5, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = scanned.has(point) ? '#8cba9f' : '#e6ff9d';
		context.fillText(point.label, plotX(point.x), plotZ(point.z) + .8);
	}
	context.save();
	context.translate(plotX(x), plotZ(z));
	context.rotate(-heading);
	context.fillStyle = '#fff8dd';
	context.strokeStyle = '#121714';
	context.beginPath();
	context.moveTo(0, -9);
	context.lineTo(6, 7);
	context.lineTo(0, 4);
	context.lineTo(-6, 7);
	context.closePath();
	context.fill();
	context.stroke();
	context.restore();
}

export function start_Flight({ mount, complete, coast, renderer, signal }) {
	const copy = text.flight;
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const { scene, fieldDrone, seaTime } = coast;
	const camera = new THREE.PerspectiveCamera(56, 1, .2, 620);
	const photoCamera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 96);
	photoCamera.up.set(0, 0, -1);
	const trackedPosition = new THREE.Vector3();
	const markerLayer = `<div id="waypoints" aria-hidden="true">${points.map(point => `<span class="world-marker" id="marker-${point.label}">${point.label}</span>`).join('')}</div>`;
	const sceneMarkup = scene_Frame(`<div class="camera-glass"></div><output id="navigation-osd" class="navigation-osd" aria-live="off"></output><div class="flight-hud"><span class="view-label">${copy.view}</span>
		<div class="flight-metrics"><div>${copy.battery}<strong id="battery">100%</strong></div><div>${copy.height}<strong id="altitude">0 м</strong></div></div></div>
		<div class="mini-map"><span>${copy.map}</span><canvas id="map" width="150" height="139" aria-label="${copy.map}"></canvas></div>${markerLayer}`);
	const footer = `<div class="flight-controls">
		<div class="joystick-group"><div class="joystick" id="stick-move" aria-hidden="true"><i></i></div><span>${copy.motion}</span></div>
		<button class="button button-primary" id="flight-action" type="button">${copy.takeoff}</button>
		<div class="joystick-group"><div class="joystick" id="stick-view" aria-hidden="true"><i></i></div><span>${copy.attitude}</span></div>
	</div>`;
	const panel = `<div class="diagram"><p class="micro">${copy.sector}</p><div class="sector-list">
		${sectors.map(point => `<span id="sector-${point.label}">${point.label}</span>`).join('')}
		</div></div><p class="lesson">${text.stages[1].lesson}</p>
		<figure class="flight-photo" id="flight-photo" hidden><canvas id="photo-preview" width="1440" height="900" aria-label="${copy.capture}"></canvas><figcaption id="photo-caption"></figcaption><button type="button" id="expand-photo" class="button button-quiet">${copy.expand}</button></figure>
		<dialog id="full-photo" aria-label="${copy.capture}"><canvas width="1440" height="900"></canvas><form method="dialog"><button class="button button-primary">${copy.close}</button></form></dialog>
		<p class="keyboard-note">${copy.keys}</p><p class="joystick-note">${copy.joysticks}</p>`;
	mount(stage_Shell(1, sceneMarkup, panel, footer, true));
	const viewer = query('#full-photo');
	query('#expand-photo').addEventListener('click', () => {
		viewer.querySelector('canvas').getContext('2d').drawImage(query('#photo-preview'), 0, 0);
		flightInputs.reset();
		viewer.showModal();
	}, { signal });
	const button = query('#flight-action');
	const map = query('#map').getContext('2d');
	const navigation = query('#navigation-osd');
	const altitudeText = query('#altitude');
	const batteryText = query('#battery');
	const markers = points.map(point => ({ point,
		ring: add_Beacon(scene, point, point === base ? palette.mint : palette.lime, point === base ? landRadius : scanRadius),
		label: query(`#marker-${point.label}`),
	}));
	const scanned = new Set();
	const motion = { x: base.x, z: base.z, height: .72, heading: 0, vx: 0, vz: 0 };
	let battery = 100;
	let airborne = false;
	let failed = false;
	let landing = false;
	let errors = 0;
	let feedback = 0;
	let flash = 0;
	const left = bind_Joystick(query('#stick-move'), signal);
	const right = bind_Joystick(query('#stick-view'), signal);
	const flightInputs = bind_FlightInputs(left, right, perform_Action, signal);
	set_Status(copy.waiting);

	function distance(point) {
		return Math.hypot(motion.x - point.x, motion.z - point.z);
	}

	function target_InRange() {
		return sectors.find(point => !scanned.has(point) && distance(point) <= scanRadius);
	}

	function show_Message(message, state) {
		set_Status(message, state);
		feedback = 2.4;
	}

	function capture_Sector(target) {
		const source = renderer.domElement;
		const preview = query('#photo-preview');
		const screenSize = renderer.getSize(new THREE.Vector2());
		const pixelRatio = renderer.getPixelRatio();
		renderer.setDrawingBufferSize(preview.width, preview.height, 1);
		photoCamera.updateProjectionMatrix();
		photoCamera.position.set(target.x, 30, target.z);
		photoCamera.lookAt(target.x, 0, target.z);
		const visibility = markers.map(marker => marker.ring.visible);
		for (const marker of markers) marker.ring.visible = false;
		fieldDrone.drone.visible = false;
		renderer.render(scene, photoCamera);
		const width = source.width;
		const height = source.height;
		preview.getContext('2d').drawImage(source, (source.width - width) / 2, (source.height - height) / 2, width, height, 0, 0, preview.width, preview.height);
		renderer.setDrawingBufferSize(screenSize.x, screenSize.y, pixelRatio);
		fieldDrone.drone.visible = false;
		markers.forEach((marker, index) => { marker.ring.visible = visibility[index]; });
		renderer.render(scene, camera);
		query('#photo-caption').textContent = `${copy.capture} · ${target.label}`;
		query('#flight-photo').hidden = false;
	}

	function perform_Action() {
		if (failed || landing || viewer.open) return;
		if (!airborne) {
			airborne = true;
			motion.height = 7;
			button.textContent = copy.photo;
			return;
		}
		if (scanned.size === sectors.length) {
			if (distance(base) > landRadius) return show_Message(copy.badLand, 'warn');
			if (motion.height > 4) return show_Message(copy.lower, 'warn');
			landing = true;
			button.disabled = true;
			set_Status(copy.landing, 'success');
			return;
		}
		const target = target_InRange();
		if (!target || motion.height < 3 || motion.height > 12) {
			errors++;
			show_Message(copy.badScan, 'warn');
			return;
		}
		scanned.add(target);
		capture_Sector(target);
		query(`#sector-${target.label}`).classList.add('captured');
		query(`#marker-${target.label}`).hidden = true;
		flash = .24;
		show_Message(scanned.size === sectors.length ? copy.comeback : copy.next, 'success');
		if (scanned.size === sectors.length) button.textContent = copy.land;
	}

	button.addEventListener('click', perform_Action, { signal });
	signal.addEventListener('abort', () => {
		fieldDrone.drone.visible = true;
		flightInputs.reset();
		for (const marker of markers) {
			marker.ring.traverse(object => object.geometry?.dispose());
			marker.ring.removeFromParent();
		}
	}, { once: true });
	viewer.addEventListener('close', flightInputs.reset, { signal });
	const frame = query('#scene-frame');
	function update_Motion(delta) {
		if (!airborne || failed) return;
		const axes = flightInputs.axes();
		motion.heading -= THREE.MathUtils.clamp(axes.yaw, -1, 1) * delta * 1.48;
		motion.height = THREE.MathUtils.clamp(motion.height + axes.y * delta * 8.6, 1.4, 27);
		const length = Math.max(1, Math.hypot(axes.x, axes.z));
		const sine = Math.sin(motion.heading);
		const cosine = Math.cos(motion.heading);
		const blend = 1 - Math.exp(-8 * delta);
		motion.vx = THREE.MathUtils.lerp(motion.vx, (axes.x * cosine + axes.z * sine) * 15 / length, blend);
		motion.vz = THREE.MathUtils.lerp(motion.vz, (-axes.x * sine + axes.z * cosine) * 15 / length, blend);
		motion.x = THREE.MathUtils.clamp(motion.x + motion.vx * delta, limits.minX, limits.maxX);
		motion.z = THREE.MathUtils.clamp(motion.z + motion.vz * delta, limits.minZ, limits.maxZ);
		battery = Math.max(0, battery - delta * (.70 + .018 * Math.hypot(motion.vx, motion.vz)));
		if (battery === 0) {
			failed = true;
			motion.height = .23;
			button.disabled = true;
			set_Status(copy.emergency, 'warn');
		}
	}

	return { scene, camera,
		resize(aspect) {
			camera.aspect = aspect;
			camera.fov = aspect < 1.3 ? 69 : 57;
			camera.updateProjectionMatrix();
		},
		update(delta, time) {
			if (viewer.open) return;
			if (landing) {
				const blend = 1 - Math.exp(-6 * delta);
				motion.x = THREE.MathUtils.lerp(motion.x, base.x, blend);
				motion.z = THREE.MathUtils.lerp(motion.z, base.z, blend);
				motion.height = Math.max(.72, motion.height - delta * 3.8);
				if (motion.height === .72 && distance(base) < .08) {
					complete(Math.max(55, 100 - errors * 5 - Math.floor((100 - battery) / 12)));
					return;
				}
			} else update_Motion(delta);
			seaTime.value = time;
			const { x, z, height, heading } = motion;
			const ground = Math.max(0, terrain_Height(x, z));
			const y = ground + height;
			const backX = Math.sin(heading);
			const backZ = Math.cos(heading);
			camera.position.set(x, y + .20, z);
			camera.lookAt(x - backX * 20, y - 3.6, z - backZ * 20);
			const lateral = motion.vx * backZ - motion.vz * backX;
			if (!reduceMotion.matches) camera.rotateZ(-lateral * .009);
			const course = Math.round((360 - THREE.MathUtils.radToDeg(heading) % 360) % 360) % 360;
			navigation.textContent = `${course.toString().padStart(3, '0')}°   ${Math.round(Math.hypot(motion.vx, motion.vz) * 3.6)} км/ч   H↔ ${Math.round(distance(base))} м`;
			camera.updateMatrixWorld();
			fieldDrone.drone.visible = false;
			fieldDrone.drone.scale.setScalar(.86);
			fieldDrone.drone.position.set(x, y, z);
			fieldDrone.drone.rotation.set(airborne && !failed ? -Math.hypot(motion.vx, motion.vz) * .013 : 0, heading, 0);
			if (airborne && !failed) for (const propeller of fieldDrone.propellers) propeller.rotation.y += delta * 19;
			for (const marker of markers) {
				const { point, label, ring } = marker;
				ring.visible = !scanned.has(point);
				trackedPosition.set(point.x, ring.position.y + 1.7, point.z).project(camera);
				label.hidden = scanned.has(point) || Math.abs(trackedPosition.x) > .92 || Math.abs(trackedPosition.y) > .83 || Math.abs(trackedPosition.z) > 1;
				label.style.left = `${50 + trackedPosition.x * 50}%`;
				label.style.top = `${50 - trackedPosition.y * 50}%`;
			}
			draw_Map(map, x, z, heading, scanned);
			const altitude = `${airborne && !failed ? height.toFixed(1).replace('.', ',') : 0} м`;
			const charge = `${Math.ceil(battery)}%`;
			if (altitudeText.textContent !== altitude) altitudeText.textContent = altitude;
			if (batteryText.textContent !== charge) batteryText.textContent = charge;
			batteryText.dataset.low = battery <= 22;
			flash = Math.max(0, flash - delta);
			frame.classList.toggle('photo-flash', flash > 0);
			feedback -= delta;
			if (!airborne || failed || landing || feedback > 0) return;
			if (scanned.size === sectors.length) set_Status(distance(base) <= landRadius ? (height <= 4 ? copy.landNow : copy.lower) : copy.comeback);
			else if (battery <= 22) set_Status(copy.low, 'warn');
			else if (target_InRange()) set_Status(height >= 3 && height <= 12 ? copy.canScan : copy.near, 'success');
			else set_Status(copy.searching);
		},
	};
}
