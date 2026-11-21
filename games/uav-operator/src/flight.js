import * as THREE from 'three';
import { base, flight_Ground as groundAt, limits, on_Pad, padRadius, sectors, shore } from './coast.js';
import { retryPenalty } from './difficulty.js';
import { create_Acro, fpvKit } from './fpv.js';
import { bind_FlightInputs, bind_Joystick } from './inputs.js';
import { add_Beacon } from './scenes.js';
import { palette } from './models.js';
import { close_StageMenu, query, scene_Frame, set_Status, show_CompletePrompt, stage_OverlayOpen, stage_Shell } from './ui.js';
import { text } from './text.js';
import { create_AnalogFeed } from './video.js';

const points = [base, ...sectors];
const launchHeading = -Math.PI * .34;
const directionArrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const clampAxis = value => THREE.MathUtils.clamp(value, -1, 1);

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

export function start_Flight({ mount, coast, renderer, signal, settings, restart, attempts, onLaunch, sound }) {
	const copy = text.flight;
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const { scene, fieldDrone, seaTime, touchesTree } = coast;
	const camera = new THREE.PerspectiveCamera(70, 1, .07, 620);
	const profile = settings.flight;
	const { scanRadius } = profile;
	const stabilized = profile.mode === 'assisted';
	const trainer = profile.mode === 'angle';
	const modeLabel = copy.osdModes[profile.mode];
	const keys = stabilized ? copy.keys : trainer ? copy.angleKeys : copy.acroKeys;
	const sticks = stabilized ? copy.joysticks : trainer ? copy.angleSticks : copy.acroSticks;
	const acro = create_Acro(trainer);
	const video = create_AnalogFeed(renderer);
	const photoCamera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 96);
	photoCamera.up.set(0, 0, -1);
	const trackedPosition = new THREE.Vector3();
	const markerLayer = `<div id="waypoints" aria-hidden="true">${points.map(point => `<span class="world-marker" id="marker-${point.label}">${point.label}</span>`).join('')}</div>`;
	const sceneMarkup = scene_Frame(`<div class="fpv-osd">
		<div class="fpv-top"><span>${fpvKit.name.toUpperCase()}<br><span id="osd-mode">${modeLabel}</span><br><span id="attempt-count"></span></span><span id="course">000°</span><span class="fpv-right" id="navigation-osd"></span></div>
		<div class="fpv-reticle" aria-hidden="true"></div><div class="fpv-message" id="osd-state"></div>
		<div class="fpv-bottom"><span><span id="battery"></span><br><span id="consumption"></span></span><span class="fpv-center"><span id="altitude">0.0 m</span><br><span id="throttle"></span></span><span class="fpv-right"><time id="airtime">00:00</time><br><span id="speed">0 km/h</span></span></div>
	</div>${markerLayer}`);
	const controls = `<div class="flight-controls">
		<div class="joystick-group"><div class="joystick" id="stick-view" aria-hidden="true"><i></i></div><span id="stick-left-label">${stabilized ? copy.attitude : copy.throttleYaw}</span></div>
		<button class="button button-primary" id="flight-action" type="button">${copy.takeoff}</button>
		<div class="joystick-group"><div class="joystick" id="stick-move" aria-hidden="true"><i></i></div><span id="stick-right-label">${stabilized ? copy.motion : copy.pitchRoll}</span></div>
	</div><aside class="flight-map" id="flight-map" aria-labelledby="map-title" hidden>
		<div class="overlay-heading"><h2 id="map-title">${copy.map}</h2><button class="button button-quiet close-overlay" type="button" id="close-map" aria-label="${text.close}">×</button></div><div class="sector-list">
		${sectors.map(point => `<span id="sector-${point.label}">${point.label}</span>`).join('')}
		</div><canvas id="map" width="150" height="230" aria-label="${copy.map}"></canvas></aside>
		<dialog id="full-photo" aria-label="${copy.capture}"><canvas width="1440" height="900"></canvas><form method="dialog"><button class="button button-primary">${copy.close}</button></form></dialog>`;
	const panel = `<button class="button button-quiet" type="button" id="toggle-map" aria-controls="flight-map" aria-expanded="false">${copy.map}</button>
		<button class="button button-quiet" type="button" id="flight-land" hidden>${copy.land}</button>
		<div class="fpv-controls" aria-label="${copy.settings}">
			<p>${copy.mode} · ${copy.modes[profile.mode]}</p>
			<label>${copy.filter}<select id="input-filter" ${stabilized ? 'disabled' : ''}><option value="12">12 Hz</option><option value="6" selected>6 Hz</option><option value="3">3 Hz</option></select></label>
			<label>${copy.feed}<select id="camera-effects"><option value="1" selected>${copy.analog}</option><option value="2">${copy.soft}</option><option value="0">${copy.clean}</option></select></label>
		</div>
		<figure class="flight-photo" id="flight-photo" hidden><canvas id="photo-preview" width="1440" height="900" aria-label="${copy.capture}"></canvas><figcaption id="photo-caption"></figcaption><button type="button" id="expand-photo" class="button button-quiet">${copy.expand}</button></figure>
		<p class="keyboard-note" id="flight-keys">${keys}</p><p class="joystick-note" id="flight-sticks">${sticks}</p>`;
	const tutorial = `<p class="keyboard-note">${keys}</p><p class="joystick-note">${sticks}</p><p>${copy.retryRule}</p>`;
	mount(stage_Shell(1, sceneMarkup, panel, controls, tutorial));
	const frame = query('#scene-frame');
	frame.tabIndex = -1;
	const focus = () => frame.focus({ preventScroll: true });
	const mapPanel = query('#flight-map');
	const mapToggle = query('#toggle-map');
	function toggle_Map() {
		mapPanel.hidden = !mapPanel.hidden;
		mapToggle.setAttribute('aria-expanded', String(!mapPanel.hidden));
		if (!mapPanel.hidden) draw_Map(map, motion.x, motion.z, motion.heading, scanned);
		focus();
	}
	mapToggle.addEventListener('click', () => { close_StageMenu(); toggle_Map(); }, { signal });
	query('#close-map').addEventListener('click', toggle_Map, { signal });
	const viewer = query('#full-photo');
	query('#expand-photo').addEventListener('click', () => {
		close_StageMenu();
		viewer.querySelector('canvas').getContext('2d').drawImage(query('#photo-preview'), 0, 0);
		flightInputs.reset();
		viewer.showModal();
	}, { signal });
	const effects = query('#camera-effects');
	const filter = query('#input-filter');
	const attemptText = query('#attempt-count');
	attemptText.textContent = `${copy.attempts} · ${attempts}`;
	const clock = query('#airtime');
	let flightSeconds = 0;
	const button = query('#flight-action');
	const flightControls = query('.flight-controls');
	const landButton = query('#flight-land');
	const map = query('#map').getContext('2d');
	const navigation = query('#navigation-osd');
	const altitudeText = query('#altitude');
	const batteryText = query('#battery');
	const usedText = query('#consumption');
	const courseText = query('#course');
	const speedText = query('#speed');
	const stateText = query('#osd-state');
	const throttleText = query('#throttle');
	const markers = points.map(point => ({ point,
		ring: add_Beacon(scene, point, point === base ? palette.mint : palette.lime, point === base ? padRadius : scanRadius),
		label: query(`#marker-${point.label}`),
	}));
	const scanned = new Set();
	const motion = { x: base.x, z: base.z, height: .72, y: groundAt(base.x, base.z) + .72, heading: stabilized ? 0 : launchHeading, vx: 0, vz: 0 };
	acro.reset(motion.heading);
	let battery = 100;
	let airborne = false;
	let failed = false;
	let landing = false;
	let landed = false;
	let resting = false;
	let paused = false;
	let errors = 0;
	let feedback = 0;
	let flash = 0;
	let telemetry = 0;
	let videoLoss = 0;
	let hasLifted = false;
	let liftedThisHop = false;
	const attitudeStick = bind_Joystick(query('#stick-move'), signal);
	const throttleStick = bind_Joystick(query('#stick-view'), signal);
	const flightInputs = bind_FlightInputs(attitudeStick, throttleStick, { action: perform_Action, toggleMap: toggle_Map, restart, blocked: stage_OverlayOpen, signal });
	button.textContent = stabilized ? copy.takeoff : copy.arm;
	set_Status(stabilized ? copy.waiting : copy.waitingAcro);

	function distance(point) {
		return Math.hypot(motion.x - point.x, motion.z - point.z);
	}

	function target_InRange() {
		return sectors.find(point => !scanned.has(point) && distance(point) <= scanRadius);
	}

	function show_Message(message, state) {
		set_Status(message, state, true);
		feedback = 2.4;
	}

	function capture_Sector(target) {
		const source = renderer.domElement;
		const preview = query('#photo-preview');
		const screenSize = renderer.getSize(new THREE.Vector2());
		const pixelRatio = renderer.getPixelRatio();
		photoCamera.updateProjectionMatrix();
		photoCamera.position.set(target.x, 30, target.z);
		photoCamera.lookAt(target.x, 0, target.z);
		const visibility = markers.map(marker => marker.ring.visible);
		const droneVisible = fieldDrone.drone.visible;
		for (const marker of markers) marker.ring.visible = false;
		fieldDrone.drone.visible = false;
		try {
			renderer.setDrawingBufferSize(preview.width, preview.height, 1);
			renderer.render(scene, photoCamera);
			preview.getContext('2d').drawImage(source, 0, 0);
		} finally {
			renderer.setDrawingBufferSize(screenSize.x, screenSize.y, pixelRatio);
			fieldDrone.drone.visible = droneVisible;
			markers.forEach((marker, index) => { marker.ring.visible = visibility[index]; });
		}
		query('#photo-caption').textContent = `${copy.capture} · ${target.label}`;
		query('#flight-photo').hidden = false;
	}

	function perform_Action() {
		if (stage_OverlayOpen()) return;
		if (failed) return restart();
		if (landing || landed) return;
		if (!airborne) {
			airborne = true;
			if (!resting) attempts = onLaunch();
			resting = false;
			liftedThisHop = false;
			attemptText.textContent = `${copy.attempts} · ${attempts}`;
			if (!stabilized) acro.reset(motion.heading);
			else {
				motion.height = 7;
				hasLifted = true;
				landButton.hidden = false;
			}
			button.textContent = copy.photo;
			focus();
			return;
		}
		if (scanned.size === sectors.length) return attempt_Landing();
		const target = target_InRange();
		if (!target || motion.height < 3 || motion.height > 12) {
			errors++;
			show_Message(copy.badScan, 'warn');
			return;
		}
		capture_Sector(target);
		sound.play('shutter');
		scanned.add(target);
		query(`#sector-${target.label}`).classList.add('captured');
		query(`#marker-${target.label}`).hidden = true;
		flash = .24;
		show_Message(scanned.size === sectors.length ? copy.comeback : copy.next, 'success');
		if (scanned.size === sectors.length) {
			if (!stabilized) button.hidden = true;
			else button.textContent = copy.land;
		}
	}
	function attempt_Landing() {
		if (failed || landed || landing) return;
		if (distance(base) > padRadius) return show_Message(copy.badLand, 'warn');
		if (!stabilized) return show_Message(copy.manualLand);
		if (motion.height > profile.landHeight) return show_Message(copy.lower, 'warn');
		landing = true;
		button.disabled = true;
		landButton.hidden = true;
		set_Status(copy.landing, 'success');
	}

	button.addEventListener('click', perform_Action, { signal });
	landButton.addEventListener('click', () => { close_StageMenu(); focus(); attempt_Landing(); }, { signal });
	signal.addEventListener('abort', () => {
		video.dispose();
		fieldDrone.drone.visible = true;
		flightInputs.reset();
		for (const marker of markers) {
			marker.ring.traverse(object => object.geometry?.dispose());
			marker.ring.removeFromParent();
		}
	}, { once: true });
	viewer.addEventListener('close', flightInputs.reset, { signal });
	const can_TouchDown = (x, z) => liftedThisHop && on_Pad(x, z);
	function update_Motion(delta) {
		if (!airborne || failed) return;
		const axes = flightInputs.axes();
		if (!stabilized) {
			for (const axis of Object.keys(axes)) axes[axis] = clampAxis(axes[axis]);
			const impact = acro.update(delta, motion, axes, Number(filter.value), groundAt, limits, can_TouchDown);
			battery = acro.power(delta * profile.drain, acro.throttle);
			liftedThisHop ||= motion.height > .77;
			hasLifted ||= liftedThisHop;
			const collision = touchesTree(motion.x, motion.y, motion.z);
			const touchingDown = liftedThisHop && motion.height <= .721;
			const upright = 1 - 2 * (acro.attitude.x ** 2 + acro.attitude.z ** 2);
			if (touchingDown && on_Pad(motion.x, motion.z)) finish_Flight();
			else if (collision || impact > 5 || (touchingDown && upright < .72)) fail_Flight(copy.crash);
			else if (battery === 0) fail_Flight(copy.emergency);
			return;
		}
		motion.heading -= THREE.MathUtils.clamp(axes.yaw, -1, 1) * delta * 1.48;
		motion.height = THREE.MathUtils.clamp(motion.height + axes.y * delta * 8.6, .72, 27);
		const length = Math.max(1, Math.hypot(axes.x, axes.z));
		const sine = Math.sin(motion.heading);
		const cosine = Math.cos(motion.heading);
		const blend = 1 - Math.exp(-8 * delta);
		motion.vx = THREE.MathUtils.lerp(motion.vx, (axes.x * cosine + axes.z * sine) * 15 / length, blend);
		motion.vz = THREE.MathUtils.lerp(motion.vz, (-axes.x * sine + axes.z * cosine) * 15 / length, blend);
		motion.x = THREE.MathUtils.clamp(motion.x + motion.vx * delta, limits.minX, limits.maxX);
		motion.z = THREE.MathUtils.clamp(motion.z + motion.vz * delta, limits.minZ, limits.maxZ);
		battery = acro.power(delta * profile.drain, .61 + .09 * Math.hypot(motion.vx, motion.vz) / 15);
		if (motion.height <= .721 && on_Pad(motion.x, motion.z)) finish_Flight();
		else if (touchesTree(motion.x, groundAt(motion.x, motion.z) + motion.height, motion.z)) fail_Flight(copy.crash);
		else if (battery === 0) fail_Flight(copy.emergency);
	}
	function fail_Flight(message) {
		failed = true;
		motion.vx = motion.vz = 0;
		flightControls.classList.add('retry-flight');
		button.hidden = false;
		landButton.hidden = true;
		button.textContent = copy.retry;
		button.disabled = false;
		sound.play('impact');
		frame.classList.add('signal-lost');
		set_Status(message, 'warn');
	}
	function finish_Flight() {
		landing = airborne = false;
		landed = scanned.size === sectors.length;
		resting = !landed;
		motion.height = .72;
		acro.reset(motion.heading);
		sound.play('land');
		flightControls.hidden = landed;
		landButton.hidden = true;
		button.disabled = false;
		button.textContent = stabilized ? copy.takeoff : copy.arm;
		motion.vx = motion.vz = 0;
		set_Status(landed ? copy.landed : stabilized ? copy.padRestAssisted : copy.padRest, 'success');
		if (landed) show_CompletePrompt(copy.completeNotice);
	}

	return { scene, camera, focus,
		score: () => Math.max(0, scanned.size * 25 + (hasLifted ? 10 : 0) + (landed ? 15 : 0) - errors * 5 - (failed ? 10 : 0) - retryPenalty * Math.max(0, attempts - 1)),
		summary: () => `${copy.attempts} · ${attempts} · ${copy.summarySectors} ${scanned.size} / ${sectors.length}`,
		render(time) {
			const effect = Number(effects.value);
			if (failed) video.render(scene, camera, reduceMotion.matches ? 0 : time, 1, 1, true);
			else if (!effect) renderer.render(scene, camera);
			else video.render(scene, camera, reduceMotion.matches ? 0 : time, videoLoss, reduceMotion.matches ? 0 : effect === 1 ? 1 : .27);
		},
		resize(aspect) {
			if (camera.aspect === aspect) return;
			camera.aspect = aspect;
			camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(.99 / Math.max(1.04, aspect)));
			camera.updateProjectionMatrix();
		},
		update(delta, time) {
			const overlayOpen = stage_OverlayOpen();
			if (overlayOpen && !paused) flightInputs.reset();
			paused = overlayOpen;
			if (paused) delta = 0;
			if (!paused && landing) {
				const blend = 1 - Math.exp(-6 * delta);
				motion.x = THREE.MathUtils.lerp(motion.x, base.x, blend);
				motion.z = THREE.MathUtils.lerp(motion.z, base.z, blend);
				motion.height = Math.max(.72, motion.height - delta * 3.8);
				if (motion.height === .72 && distance(base) < .08) {
					finish_Flight();
				}
			} else if (!paused) {
				update_Motion(delta);
			}
			if (airborne && !failed) flightSeconds += delta;
			const stamp = [Math.floor(flightSeconds / 60), Math.floor(flightSeconds % 60)].map(value => String(value).padStart(2, '0')).join(':');
			if (clock.textContent !== stamp) clock.textContent = stamp;
			seaTime.value = time;
			const { x, z, height, heading } = motion;
			const y = groundAt(x, z) + height;
			const backX = Math.sin(heading);
			const backZ = Math.cos(heading);
			camera.position.set(x, y + .20, z);
			if (!stabilized) {
				camera.quaternion.copy(acro.attitude);
				camera.rotateX(THREE.MathUtils.degToRad(fpvKit.cameraTilt));
				if (!reduceMotion.matches && airborne && !failed && Number(effects.value)) camera.rotateX(Math.sin(time * 97) * acro.throttle * .002);
			} else {
				camera.lookAt(x - backX * 20, y - 3.6, z - backZ * 20);
				if (!reduceMotion.matches) camera.rotateZ(-(motion.vx * backZ - motion.vz * backX) * .009);
			}
			const course = Math.round((360 - THREE.MathUtils.radToDeg(heading) % 360) % 360) % 360;
			videoLoss = THREE.MathUtils.smoothstep(Math.hypot(distance(base), height), ...profile.videoRange);
			sound.flight({ running: airborne && !failed, throttle: stabilized ? .48 + Math.hypot(motion.vx, motion.vz) * .014 : acro.throttle,
				speed: Math.hypot(motion.vx, motion.vz), loss: failed ? 1 : videoLoss, paused });
			camera.updateMatrixWorld();
			fieldDrone.drone.visible = false;
			fieldDrone.drone.scale.setScalar(.18);
			fieldDrone.drone.position.set(x, y, z);
			fieldDrone.drone.rotation.set(airborne && !failed ? -Math.hypot(motion.vx, motion.vz) * .013 : 0, heading, 0);
			if (airborne && !failed) for (const propeller of fieldDrone.propellers) propeller.rotation.y += delta * 19;
			for (const marker of markers) {
				const { point, label, ring } = marker;
				ring.visible = profile.markers && !scanned.has(point);
				label.hidden = !ring.visible;
				if (label.hidden) continue;
				trackedPosition.set(point.x, ring.position.y + 1.7, point.z).project(camera);
				label.hidden = scanned.has(point) || Math.abs(trackedPosition.x) > .92 || Math.abs(trackedPosition.y) > .83 || Math.abs(trackedPosition.z) > 1;
				label.style.left = `${50 + trackedPosition.x * 50}%`;
				label.style.top = `${50 - trackedPosition.y * 50}%`;
			}
			telemetry -= delta;
			if (telemetry <= 0) {
				telemetry = .09;
				if (!mapPanel.hidden) draw_Map(map, x, z, heading, scanned);
				courseText.textContent = `${String(course).padStart(3, '0')}°`;
				const next = sectors.reduce((nearest, point) => {
					if (scanned.has(point)) return nearest;
					return !nearest || distance(point) < distance(nearest) ? point : nearest;
				}, null) ?? base;
				const bearing = Math.atan2(next.x - x, z - next.z) + heading;
				const arrow = directionArrows[THREE.MathUtils.euclideanModulo(Math.round(bearing * 4 / Math.PI), 8)];
				navigation.textContent = failed ? 'VID 0%' : `VID ${Math.round(100 - videoLoss * 62)}%\nH ${Math.round(distance(base))} m\n${arrow} ${next.label} ${Math.round(distance(next))} m`;
				altitudeText.textContent = `${(airborne && height > .73 ? height : 0).toFixed(1)} m AGL`;
				speedText.textContent = `${Math.round(Math.hypot(motion.vx, motion.vz) * 3.6)} km/h`;
				batteryText.textContent = `${acro.voltage.toFixed(1)} V`;
				usedText.textContent = `${Math.round(acro.used)} mAh`;
				throttleText.textContent = !stabilized ? `THR ${Math.round((airborne && !failed ? acro.throttle : 0) * 100)}%` : '';
				batteryText.dataset.low = battery <= 22;
				stateText.textContent = failed ? copy.osdFail : landed ? copy.osdLanded : !airborne ? copy.osdSafe : battery <= 22 ? copy.osdLow : !stabilized && !hasLifted ? copy.osdArmed : '';
			}
			flash = Math.max(0, flash - delta);
			frame.classList.toggle('photo-flash', flash > 0 && !reduceMotion.matches);
			feedback -= delta;
			if (!airborne || failed || landing || feedback > 0) return;
			if (!stabilized && !hasLifted) set_Status(copy.liftAcro);
			else if (scanned.size === sectors.length) set_Status(distance(base) <= padRadius ? (!stabilized ? copy.manualLand : height <= profile.landHeight ? copy.landNow : copy.lower) : copy.comeback);
			else if (battery <= 22) set_Status(copy.low, 'warn');
			else if (target_InRange()) set_Status(height >= 3 && height <= 12 ? copy.canScan : copy.near, 'success');
			else set_Status(copy.searching);
		},
	};
}
