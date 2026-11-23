import * as THREE from 'three';
import { base as coastBase, flight_Ground, limits as coastLimits, on_Pad, padRadius as coastPadRadius, sectors as beachSectors, shore } from './coast.js';
import { retryPenalty } from './difficulty.js';
import { create_FleetModel, fleet } from './fleet.js';
import { create_ChaseCamera, create_Damage, create_TouchdownCamera, signal_AtEdge } from './flight-dynamics.js';
import { bind_DamageDisplay } from './flight-damage-display.js';
import { bind_Preferences, flightPreferences, preference_Markup } from './flight-preferences.js';
import { create_Acro, fpvKit } from './fpv.js';
import { bind_FlightInputs, bind_Joystick } from './inputs.js';
import { add_Beacon, create_GroundShadow } from './scenes.js';
import { dispose_Scene, palette } from './models.js';
import { create_Field, gate_Crossing } from './training-field.js';
import { create_GeologyMap } from './geology-maps.js';
import { bind_Click, close_StageMenu, query, scene_Frame, set_Status, show_CompletePrompt, stage_OverlayOpen, stage_Shell, toggle_StageMenu, vibrate_Device } from './ui.js';
import { text } from './text.js';
import { create_AnalogFeed } from './video.js';

const launchHeading = -Math.PI * .34;
const directionArrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const groundHeight = .72;

function relief_Image(context, { limits, groundAt, map }) {
	const { width, height } = context.canvas;
	const dx = (limits.maxX - limits.minX) / (width - 22);
	const dz = (limits.maxZ - limits.minZ) / (height - 22);
	const image = context.createImageData(width, height);
	const terrain = map === 'canyon' ? [149,105,75] : map === 'alpine' ? [112,123,115] : [100,117,83];
	for (let row = 0; row < height; row++) {
		const z = limits.minZ + (row - 11) * dz;
		for (let col = 0; col < width; col++) {
			const x = limits.minX + (col - 11) * dx;
			const h = groundAt(x, z);
			const west = groundAt(x - dx, z), north = groundAt(x, z - dz);
			const water = map === 'beach' ? x > shore(z) : map === 'alpine' && h < -.7;
			const shade = THREE.MathUtils.clamp(.85 + .22 * (h - west) / dx + .27 * (h - north) / dz, .51, 1.25);
			const contour = Math.floor(h / 4) !== Math.floor(north / 4) || Math.floor(h / 4) !== Math.floor(west / 4);
			const i = 4 * (row * width + col);
			const color = water ? [53,95,101] : terrain;
			for (let k = 0; k < 3; k++) image.data[i + k] = color[k] * (water ? 1 : shade * (contour ? .74 : 1));
			image.data[i + 3] = 255;
		}
	}
	return image;
}

function draw_Map(context, x, z, heading, scanned, mapData) {
	const { limits, points, beach } = mapData;
	const { width, height } = context.canvas;
	const plotX = world => 11 + (world - limits.minX) / (limits.maxX - limits.minX) * (width - 22);
	const plotZ = world => 11 + (world - limits.minZ) / (limits.maxZ - limits.minZ) * (height - 22);
	context.putImageData(mapData.relief ??= relief_Image(context, mapData), 0, 0);
	if (!beach) {
		context.strokeStyle = '#ccdbbd';
		context.setLineDash([2, 3]);
		context.beginPath();
		for (const point of points) context.lineTo(plotX(point.x), plotZ(point.z));
		context.stroke();
	}
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

export function start_Flight({ mount, coast, renderer, signal, settings, restart, attempts, onLaunch, sound, restarting, logAction, practice, resetMessage, freeMode, storyCamera, onCameraChange, restoredState }) {
	const copy = text.flight;
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const story = !practice;
	const beach = story || practice.map === 'beach';
	const race = practice?.map === 'race';
	const geology = practice?.map === 'canyon' || practice?.map === 'alpine';
	const world = beach ? coast : geology ? create_GeologyMap(practice.map) : create_Field(race);
	const courseComplete = geology ? text.free.archesDone : race ? text.free.raceDone : text.free.fieldDone;
	const { scene, seaTime, collision, touchesTree } = world;
	const pendingMasks = new Set();
	scene.traverse(object => {
		const material = object.material;
		if (object.castShadow && material?.alphaTest > 0 && material.map && !material.map.image) pendingMasks.add(material.map);
	});
	const base = world.base ?? coastBase;
	const limits = world.limits ?? coastLimits;
	const onPad = world.onPad ?? on_Pad;
	const padRadius = world.padRadius ?? coastPadRadius;
	const groundAt = world.flightGround ?? flight_Ground;
	const sectors = world.gates ?? beachSectors;
	const points = [base, ...sectors];
	const mapData = { limits, points, beach, groundAt, map: practice?.map ?? 'beach' };
	const droneKey = practice?.drone;
	const kit = droneKey ? fleet[droneKey] : fpvKit;
	const fieldDrone = droneKey ? create_FleetModel(scene, droneKey) : world.fieldDrone;
	if (droneKey && beach) coast.fieldDrone.drone.visible = false;
	let chase = (restoredState?.camera ?? practice?.camera ?? storyCamera) === 'chase';
	let cameraChanged = true;
	// Берег переиспользуется при перезапуске. Размеры измеряем до разворота и переноса на площадку.
	fieldDrone.drone.position.set(0,0,0);
	fieldDrone.drone.quaternion.identity();
	for (const propeller of fieldDrone.propellers) propeller.rotation.y = 0;
	// Корпус учебного F5 собран в единицах демонстрационной модели; в полёте размах около 32 см.
	if (story) fieldDrone.drone.scale.setScalar(.08);
	const droneBounds = new THREE.Box3().setFromObject(fieldDrone.drone);
	const center = droneBounds.getCenter(new THREE.Vector3());
	const modelOffset = groundHeight + droneBounds.min.y;
	const bodyOffset = center.y - modelOffset;
	const droneCenter = fieldDrone.drone.worldToLocal(center);
	const droneSize = droneBounds.getSize(new THREE.Vector3());
	const bodyRadius = .5 * Math.max(droneSize.x, droneSize.z);
	const sweepStart = new THREE.Vector3(), sweepEnd = new THREE.Vector3();
	const impactVelocity = new THREE.Vector3();
	const groundShadow = create_GroundShadow(scene, world.sun, droneBounds.max.x - droneBounds.min.x, groundAt);
	fieldDrone.drone.traverse(object => { object.castShadow = false; });
	const chaseDistance = Math.max(1.4, (kit.length ?? .32) * 5.5);
	const updateChase = create_ChaseCamera(fieldDrone.drone, droneCenter, chaseDistance, touchesTree, groundAt, collision);
	const camera = new THREE.PerspectiveCamera(flightPreferences.fov, 1, .07, 620);
	const touchdownCamera = create_TouchdownCamera(camera);
	const profile = practice ? { ...settings.flight, mode: practice.mode, drain: .7 } : settings.flight;
	const { scanRadius } = profile;
	const stabilized = profile.mode === 'assisted';
	const trainer = profile.mode === 'angle';
	const modeLabel = copy.osdModes[profile.mode];
	const controlKeys = stabilized ? copy.keys : trainer ? copy.angleKeys : copy.acroKeys;
	const keys = story ? `${controlKeys} ${copy.storyLandKey}` : controlKeys;
	const sticks = stabilized ? copy.joysticks : trainer ? copy.angleSticks : copy.acroSticks;
	const acro = create_Acro(trainer, kit);
	const damage = create_Damage(kit.mass, kit.guards);
	const video = create_AnalogFeed(renderer);
	const photoCamera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 96);
	photoCamera.up.set(0, 0, -1);
	const trackedPosition = new THREE.Vector3();
	const markerLayer = `<div id="waypoints" aria-hidden="true">${points.map(point => `<span class="world-marker" id="marker-${point.label}">${point.label}</span>`).join('')}</div>`;
	const sceneMarkup = scene_Frame(`<div class="fpv-osd">
		<div class="fpv-top"><span>${kit.name.toUpperCase()}<br><span id="osd-mode">${modeLabel}</span><br><span id="attempt-count"></span></span><span id="course">000°</span><span class="fpv-right" id="navigation-osd"></span></div>
		<div class="fpv-reticle" aria-hidden="true"></div><div class="fpv-message" id="osd-state"></div>
		<div id="stick-indicators" class="stick-indicators" aria-hidden="true" hidden>
			<span class="stick-position" id="indicator-left"><i></i></span><span class="stick-position" id="indicator-right"><i></i></span>
		</div>
		<div class="fpv-bottom"><div><canvas id="damage-osd" width="216" height="160" role="img" hidden></canvas><span id="battery"></span><br><span id="consumption"></span></div><span class="fpv-center"><span id="altitude">0.0 m</span><br><span id="throttle"></span></span><span class="fpv-right"><time id="airtime">00:00</time><br><span id="speed">0 km/h</span></span></div>
	</div>${markerLayer}<div class="camera-boot" id="camera-boot" hidden><span role="status">${copy.connected}</span></div>
	<div class="camera-reset" id="camera-reset" hidden><span role="status">${copy.reboot}</span></div>`);
	const mapLabel = beach ? copy.map : text.free.map;
	const controls = `<div class="flight-controls-mini"><button class="button osd-button" id="quick-map" type="button" aria-label="${mapLabel}" aria-controls="flight-map" aria-expanded="false" title="${mapLabel}"><span aria-hidden="true">⌖</span></button>
		<button class="button osd-button" id="quick-restart" type="button" aria-label="${copy.restart}" title="${copy.restart}"><span aria-hidden="true">↻</span></button></div><div class="flight-controls">
		<div class="joystick-group"><div class="joystick" id="stick-view" aria-hidden="true"><i></i></div><span id="stick-left-label">${stabilized ? copy.attitude : copy.throttleYaw}</span></div>
		<button class="button osd-button" id="flight-action" type="button"><span aria-hidden="true"></span></button>
		<div class="joystick-group"><div class="joystick" id="stick-move" aria-hidden="true"><i></i></div><span id="stick-right-label">${stabilized ? copy.motion : copy.pitchRoll}</span></div>
		<div class="touch-flight-zone" id="touch-left" aria-hidden="true"></div><div class="touch-flight-zone" id="touch-right" aria-hidden="true"></div>
	</div><aside class="flight-map" id="flight-map" aria-labelledby="map-title" hidden>
		<div class="overlay-heading"><h2 id="map-title">${mapLabel}</h2><button class="button button-quiet close-overlay" type="button" id="close-map" aria-label="${text.close}">×</button></div><div class="sector-list">
		${sectors.map(point => `<span id="sector-${point.label}">${point.label}</span>`).join('')}
		</div><canvas id="map" width="150" height="230" aria-label="${mapLabel}"></canvas></aside>
		<dialog id="full-photo" aria-label="${copy.capture}"><canvas width="1440" height="900"></canvas><div class="dialog-actions"><button class="button button-primary" id="close-photo" type="button">${copy.close}</button></div></dialog>`;
	const panel = `<button class="button button-quiet" type="button" id="toggle-map" aria-controls="flight-map" aria-expanded="false">${mapLabel}</button>
		<button class="button button-quiet" type="button" id="flight-land" hidden>${copy.land}</button>
		<button class="button button-quiet" type="button" id="flight-disarm" hidden>${copy.disarm}</button>
		<div class="fpv-controls" aria-label="${copy.settings}">
			<p>${copy.mode} · ${copy.modes[profile.mode]}</p>
			<label>${copy.camera}<select id="flight-camera"><option value="fpv">${text.free.cameras.fpv}</option><option value="chase">${text.free.cameras.chase}</option></select></label>
			<label>${copy.filter}<select id="input-filter" ${stabilized ? 'disabled' : ''}><option value="12">12 Hz</option><option value="6" selected>6 Hz</option><option value="3">3 Hz</option></select></label>
			<label>${copy.feed}<select id="camera-effects"><option value="1" selected>${copy.analog}</option><option value="2">${copy.soft}</option><option value="0">${copy.clean}</option></select></label>
			${preference_Markup()}
		</div>
		<figure class="flight-photo" id="flight-photo" hidden><canvas id="photo-preview" width="1440" height="900" aria-label="${copy.capture}"></canvas><figcaption id="photo-caption"></figcaption><button type="button" id="expand-photo" class="button button-quiet">${copy.expand}</button></figure>
		<p class="keyboard-note" id="current-flight-keys"></p><p class="joystick-note">${copy.touchFlight} ${sticks}</p><p class="keyboard-note">${copy.gamepad}</p>`;
	const tutorial = `<p class="keyboard-note">${keys}</p><p class="joystick-note">${copy.touchFlight} ${sticks}</p><p class="keyboard-note">${copy.gamepad}</p>`;
	const stageOverride = practice ? { freeMode, title: text.free.maps[practice.map].title, exit: text.free.back, guide: beach ? null : text.free.maps[practice.map].detail } : {};
	mount(stage_Shell(1, sceneMarkup, panel, controls, tutorial, '', stageOverride));
	bind_Click('#close-photo', () => query('#full-photo').close(), signal);
	const frame = query('#scene-frame');
	const boot = query('#camera-boot');
	const resetScreen = query('#camera-reset');
	let resetting = false;
	let bootTimer;
	let cameraStarted = false;
	function connect_Camera() {
		cameraStarted = true;
		boot.hidden = false;
		bootTimer = setTimeout(() => { boot.hidden = true; }, 1450);
	}
	let lossTimer;
	if (restarting && !restoredState) connect_Camera();
	signal.addEventListener('abort', () => { clearTimeout(bootTimer); clearTimeout(lossTimer); }, { once: true });
	frame.tabIndex = -1;
	const focus = () => frame.focus({ preventScroll: true });
	const mapPanel = query('#flight-map');
	const mapToggle = query('#toggle-map');
	const quickMap = query('#quick-map');
	function show_Map(open) {
		mapPanel.hidden = !open;
		mapToggle.setAttribute('aria-expanded', String(open));
		quickMap.setAttribute('aria-expanded', String(open));
		if (!mapPanel.hidden) draw_Map(map, motion.x, motion.z, motion.heading, scanned, mapData);
	}
	function toggle_Map() {
		if (resetting) return;
		show_Map(mapPanel.hidden);
		focus();
	}
	async function request_Restart(message) {
		if (resetting || signal.aborted) return;
		resetting = true;
		clearTimeout(lossTimer);
		flightInputs.reset();
		close_StageMenu();
		query('.mission-view dialog[open]')?.close();
		show_Map(false);
		resetScreen.hidden = false;
		query('.flight-view').classList.add('flight-resetting');
		const animations = resetScreen.getAnimations();
		if (animations.length) await Promise.allSettled(animations.map(animation => animation.finished));
		if (!signal.aborted) restart(message);
	}
	mapToggle.addEventListener('click', () => { close_StageMenu(); toggle_Map(); }, { signal });
	bind_Click('#quick-map', toggle_Map, signal);
	bind_Click('#quick-restart', request_Restart, signal);
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
	const actionGlyph = button.querySelector('span');
	const flightControls = query('.flight-controls');
	const landButton = query('#flight-land');
	const disarmButton = query('#flight-disarm');
	const map = query('#map').getContext('2d');
	const navigation = query('#navigation-osd');
	const altitudeText = query('#altitude');
	const batteryText = query('#battery');
	const usedText = query('#consumption');
	const courseText = query('#course');
	const speedText = query('#speed');
	const stateText = query('#osd-state');
	const throttleText = query('#throttle');
	const completionNotice = query('#flight-complete-notice');
	const updateDamageDisplay = bind_DamageDisplay(query('#damage-osd'), fieldDrone.propellers, kit.guards);
	const markers = points.map(point => ({ point,
		ring: beach ? add_Beacon(scene, point, point === base ? palette.mint : palette.lime, point === base ? padRadius : scanRadius) : null,
		label: query(`#marker-${point.label}`),
	}));
	const scanned = new Set();
	const motion = { x: base.x, z: base.z, height: groundHeight, y: groundAt(base.x, base.z) + groundHeight, heading: beach && !stabilized ? launchHeading : 0, vx: 0, vz: 0, vy: 0 };
	acro.reset(motion.heading);
	let battery = 100;
	let armed = false;
	let hasLaunched = false;
	let signalLost = false;
	let landing = false;
	let landed = false;
	let landingNoticePending = false;
	let paused = false;
	let errors = 0;
	let feedback = 0;
	let flash = 0;
	let telemetry = 0;
	let videoLoss = 0;
	let hasLifted = false;
	let raceStart = null;
	let raceFinish = null;
	let impactCooldown = 0;
	let previousObstacle = false;
	let nextGate = 0;
	let completionTimer;
	let completion = null;
	if (restoredState) {
		({ flightSeconds, battery, armed, hasLaunched, signalLost, landing, landed, errors, hasLifted,
			raceStart, raceFinish, impactCooldown, previousObstacle, nextGate, completion, cameraStarted } = restoredState);
		Object.assign(motion, restoredState.motion);
		acro.restore(restoredState.acro);
		damage.hull = restoredState.hull;
		damage.propellers.splice(0, 4, ...restoredState.propellers);
		for (const index of restoredState.scanned) {
			const point = sectors[index];
			if (!point) continue;
			scanned.add(point);
			query(`#sector-${point.label}`).classList.add('captured');
		}
	}

	function record_Completion() {
		if (completionNotice) completion = { score: score_Flight(), duration: raceFinish ?? flightSeconds };
	}

	function announce_Completion(message) {
		if (!completionNotice) return show_CompletePrompt(message);
		completionNotice.textContent = `${message} ${text.free.flightExitHint}`;
		vibrate_Device([30, 60, 30]);
		completionTimer = setTimeout(() => { completionNotice.textContent = ''; }, 3000);
	}
	signal.addEventListener('abort', () => clearTimeout(completionTimer), { once: true });
	const previous = { x: motion.x, y: motion.y, z: motion.z };
	const attitudeStick = bind_Joystick(query('#stick-move'), query('#touch-right'), signal);
	const throttleStick = bind_Joystick(query('#stick-view'), query('#touch-left'), signal);
	const leftIndicator = query('#indicator-left i');
	const rightIndicator = query('#indicator-right i');
	const cameraSelect = query('#flight-camera');
	cameraSelect.value = chase ? 'chase' : 'fpv';
	const preferences = bind_Preferences(signal, fov => { camera.fov = fov; camera.updateProjectionMatrix(); }, cameraSelect.value,
		`${droneKey ?? 'story'}:${stabilized ? 'assisted' : 'fixed'}`, stabilized ? -10 : kit.cameraTilt, showSticks => {
			flightControls.dataset.sticks = showSticks ? 'visible' : 'floating';
			attitudeStick.reset();
			throttleStick.reset();
		}, story);
	function select_Camera(mode) {
		chase = mode === 'chase';
		cameraChanged = true;
		cameraSelect.value = mode;
		frame.dataset.camera = mode;
		preferences.selectCamera(mode);
		onCameraChange(mode);
	}
	frame.dataset.camera = cameraSelect.value;
	cameraSelect.addEventListener('change', () => select_Camera(cameraSelect.value), { signal });
	const flightInputs = bind_FlightInputs(attitudeStick, throttleStick, {
		action: perform_Action, land: story ? attempt_Landing : undefined, toggleMap: toggle_Map,
		restart: request_Restart, toggleCamera: () => select_Camera(chase ? 'fpv' : 'chase'),
		menu: () => { if (!resetting) toggle_StageMenu(); },
		bindings: flightPreferences.bindings, blocked: () => resetting || stage_OverlayOpen(), signal,
		showAxes(axes) {
			if (!flightPreferences.indicators) return;
			leftIndicator.style.transform = `translate(${axes.yaw * 16}px, ${-axes.y * 16}px)`;
			rightIndicator.style.transform = `translate(${axes.x * 16}px, ${axes.z * 16}px)`;
		},
	});
	const actionIcons = { [copy.takeoff]: '↑', [copy.arm]: '⏻', [copy.land]: '↓', [copy.photo]: '◉', [copy.retry]: '↻' };
	function set_Action(label) {
		if (button.title === label) return;
		actionGlyph.textContent = actionIcons[label];
		button.setAttribute('aria-label', label);
		button.title = label;
	}
	set_Action(armed ? (beach && scanned.size < sectors.length ? copy.photo : copy.land) : (stabilized ? copy.takeoff : copy.arm));
	set_Status(resetMessage || (stabilized ? copy.waiting : copy.waitingAcro));

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
		const shadowVisible = groundShadow.mesh.visible;
		groundShadow.mesh.visible = false;
		for (const marker of markers) marker.ring.visible = false;
		fieldDrone.drone.visible = false;
		try {
			renderer.setDrawingBufferSize(preview.width, preview.height, 1);
			renderer.render(scene, photoCamera);
			preview.getContext('2d').drawImage(source, 0, 0);
		} finally {
			renderer.setDrawingBufferSize(screenSize.x, screenSize.y, pixelRatio);
			fieldDrone.drone.visible = droneVisible;
			groundShadow.mesh.visible = shadowVisible;
			markers.forEach((marker, index) => { marker.ring.visible = visibility[index]; });
		}
		query('#photo-caption').textContent = `${copy.capture} · ${target.label}`;
		query('#flight-photo').hidden = false;
	}

	function perform_Action() {
		if (resetting || stage_OverlayOpen() || landingNoticePending) return;
		if (raceFinish !== null || landed) {
			if (!freeMode) queueMicrotask(() => { if (!signal.aborted) query('#complete-submit').click(); });
			return;
		}
		if (signalLost) return;
		if (damage.disabled || battery === 0) return request_Restart();
		if (landing) return;
		if (!armed) {
			armed = true;
			if (!cameraStarted) connect_Camera();
			if (!hasLaunched) {
				hasLaunched = true;
				attempts = onLaunch();
				attemptText.textContent = `${copy.attempts} · ${attempts}`;
			}
			if (!stabilized) acro.reset(motion.heading);
			else {
				motion.height = beach ? 7 : 3.7;
				motion.y = groundAt(motion.x, motion.z) + motion.height;
				hasLifted = true;
			}
			set_Action(beach ? copy.photo : copy.land);
			focus();
			return;
		}
		if (!beach) return attempt_Landing();
		if (scanned.size === sectors.length) return attempt_Landing();
		const target = target_InRange();
		if (!target || motion.height < 3 || motion.height > 12) {
			logAction(target ? 'wrongHeight' : 'missedSector');
			errors++;
			show_Message(copy.badScan, 'warn');
			return;
		}
		capture_Sector(target);
		sound.play('shutter');
		scanned.add(target);
		logAction('captured');
		query(`#sector-${target.label}`).classList.add('captured');
		query(`#marker-${target.label}`).hidden = true;
		flash = .24;
		show_Message(scanned.size === sectors.length ? copy.comeback : copy.next, 'success');
		if (scanned.size === sectors.length) {
			set_Action(copy.land);
		}
	}
	function attempt_Landing() {
		if (resetting || signalLost || landed || landing || damage.disabled || battery === 0 || !armed || on_Ground()) return;
		if (!story && !stabilized) return show_Message(beach ? copy.manualLand : text.free.gateHint);
		if (beach && !onPad(motion.x, motion.z)) return show_Message(copy.badLand, 'warn');
		if (!story && motion.height > profile.landHeight) return show_Message(copy.lower, 'warn');
		if (story) acro.reset(motion.heading);
		landing = true;
		show_Message(story ? copy.storyLanding : beach ? copy.landing : copy.descending, 'success');
	}

	const on_Ground = () => motion.height <= groundHeight + .001;
	button.addEventListener('click', perform_Action, { signal });
	landButton.addEventListener('click', () => { close_StageMenu(); focus(); attempt_Landing(); }, { signal });
	bind_Click('#flight-disarm', () => {
		if (!armed || !on_Ground()) return;
		armed = landing = false;
		acro.reset(motion.heading);
		motion.vx = motion.vy = motion.vz = 0;
		set_Action(stabilized ? copy.takeoff : copy.arm);
		disarmButton.hidden = true;
		close_StageMenu();
		focus();
	}, signal);
	signal.addEventListener('abort', () => {
		video.dispose();
		groundShadow.mesh.removeFromParent();
		dispose_Scene(groundShadow.mesh);
		fieldDrone.drone.visible = true;
		for (const propeller of fieldDrone.propellers) propeller.visible = true;
		if (beach && fieldDrone !== coast.fieldDrone) {
			coast.fieldDrone.drone.visible = true;
			fieldDrone.drone.removeFromParent();
			dispose_Scene(fieldDrone.drone);
		}
		flightInputs.reset();
		for (const marker of markers) {
			marker.ring?.traverse(object => object.geometry?.dispose());
			marker.ring?.removeFromParent();
		}
	}, { once: true });
	viewer.addEventListener('close', flightInputs.reset, { signal });
	function update_Motion(delta, axes) {
		if (!armed || signalLost || (story && landed)) return;
		const powered = !damage.disabled && battery > 0;
		const wasOnGround = on_Ground();
		let impact = 0;
		let upright = 1;
		// Над H автоматика гасит инерцию и ведёт дрон вертикально до мягкого касания.
		if (story && landing && (!powered || !onPad(motion.x, motion.z))) landing = false;
		if (story && landing) {
			const descentSpeed = Math.min(2.4, .6 + (motion.height - groundHeight) * .7);
			motion.vx = motion.vz = motion.vy = 0;
			motion.height = Math.max(groundHeight, motion.height - descentSpeed * delta);
			motion.y = groundAt(motion.x, motion.z) + motion.height;
			battery = acro.power(delta * profile.drain, .48);
		} else if (!stabilized) {
			impact = acro.update(delta, motion, axes, Number(filter.value), groundAt, damage, powered);
			if (powered) battery = acro.power(delta * profile.drain, acro.throttle);
			upright = impact > 0 ? acro.impactUpright : 1 - 2 * (acro.attitude.x ** 2 + acro.attitude.z ** 2);
		} else {
			const maxSpeed = kit.maxSpeed ?? 15;
			const stick = Math.max(1, Math.hypot(axes.x, axes.z));
			if (!wasOnGround) motion.heading -= axes.yaw * delta * 1.48 * (kit.agility ?? 1);
			const sine = Math.sin(motion.heading);
			const cosine = Math.cos(motion.heading);
			const blend = 1 - Math.exp(-(kit.motorResponse ?? 14) * .48 * delta);
			if (axes.y > 0 || !powered) landing = false;
			const horizontal = powered && !wasOnGround ? maxSpeed * damage.thrust / stick : 0;
			motion.vx = THREE.MathUtils.lerp(motion.vx, (axes.x * cosine + axes.z * sine) * horizontal + (horizontal ? damage.rollBias * 5 : 0), blend);
			motion.vz = THREE.MathUtils.lerp(motion.vz, (-axes.x * sine + axes.z * cosine) * horizontal + (horizontal ? damage.pitchBias * 5 : 0), blend);
			const climb = landing ? -Math.min(2.4, .6 + (motion.height - groundHeight) * .7) : axes.y * (kit === fpvKit ? 8.6 : 5);
			motion.vy = powered ? THREE.MathUtils.lerp(motion.vy, climb * damage.thrust, blend)
				: Math.max(-19, motion.vy - 9.81 * delta);
			motion.x += motion.vx * delta;
			motion.z += motion.vz * delta;
			motion.height = THREE.MathUtils.clamp(motion.height + motion.vy * delta, groundHeight, 27);
			motion.y = groundAt(motion.x, motion.z) + motion.height;
			if (on_Ground()) {
				if (!wasOnGround) impact = Math.hypot(motion.vy, motion.vx * .5, motion.vz * .5);
				motion.vy = 0;
				const friction = Math.exp(-12 * delta);
				motion.vx *= friction;
				motion.vz *= friction;
			}
			if (powered) battery = acro.power(delta * profile.drain, .48 + .17 * Math.hypot(motion.vx, motion.vz) / maxSpeed);
		}
		sweepStart.set(previous.x, previous.y + bodyOffset, previous.z);
		sweepEnd.set(motion.x, motion.y + bodyOffset, motion.z);
		const travel = sweepStart.distanceTo(sweepEnd);
		let hit = collision?.sweep(sweepStart, sweepEnd, bodyRadius);
		let stopTime = hit?.time ?? 1;
		let obstacle = Boolean(hit);
		if (touchesTree) {
			const samples = Math.max(1, Math.ceil(travel * stopTime / .28));
			for (let sample = 1; sample <= samples; sample++) {
				const t = stopTime * sample / samples;
				if (!touchesTree(
					THREE.MathUtils.lerp(sweepStart.x, sweepEnd.x, t),
					THREE.MathUtils.lerp(sweepStart.y, sweepEnd.y, t),
					THREE.MathUtils.lerp(sweepStart.z, sweepEnd.z, t),
				)) continue;
				stopTime = stopTime * (sample - 1) / samples;
				obstacle = true;
				hit = null;
				break;
			}
		}
		const side = motion.vx * Math.cos(motion.heading) - motion.vz * Math.sin(motion.heading);
		const fore = motion.vx * Math.sin(motion.heading) + motion.vz * Math.cos(motion.heading);
		if (obstacle) {
			impactVelocity.set(motion.vx, stabilized ? motion.vy : acro.velocity.y, motion.vz);
			const impactSpeed = hit ? Math.max(0, -impactVelocity.dot(hit.normal)) : impactVelocity.length();
			if (!previousObstacle) impact = Math.max(impact, impactSpeed);
			const clearance = Math.max(0, stopTime - .002 / Math.max(travel, .002));
			motion.x = THREE.MathUtils.lerp(previous.x, motion.x, clearance);
			motion.z = THREE.MathUtils.lerp(previous.z, motion.z, clearance);
			motion.y = Math.max(groundAt(motion.x, motion.z) + groundHeight, THREE.MathUtils.lerp(previous.y, motion.y, clearance));
			motion.height = motion.y - groundAt(motion.x, motion.z);
			if (hit) impactVelocity.addScaledVector(hit.normal, 1.24 * impactSpeed);
			else impactVelocity.multiplyScalar(-.24);
			motion.vx = impactVelocity.x;
			motion.vy = impactVelocity.y;
			motion.vz = impactVelocity.z;
			acro.velocity.copy(impactVelocity);
		}
		previousObstacle = obstacle;
		impactCooldown = Math.max(0, impactCooldown - delta);
		if (impact > 0 && impactCooldown === 0) {
			const rotor = (side > 0 ? 2 : 0) + (fore > 0 ? 1 : 0);
			if (damage.impact(impact, upright, rotor)) {
				impactCooldown = .18;
				errors++;
				logAction('crash');
				sound.play('impact');
				show_Message(damage.disabled ? copy.disabled : copy.crash, 'warn');
			}
		}
		hasLifted ||= motion.height > .77;
		if (powered && battery === 0) {
			logAction('empty');
			show_Message(copy.emergency, 'warn');
		}
		if (!wasOnGround && on_Ground()) register_Touchdown(onPad(motion.x, motion.z) && impact < 5 && upright > .6);
		if (!beach && !obstacle && nextGate < sectors.length) advance_Course();
	}

	function advance_Course() {
		const gate = sectors[nextGate];
		if (!gate_Crossing(gate, previous, motion, bodyOffset)) return;
		nextGate++;
		scanned.add(gate);
		query(`#sector-${gate.label}`).classList.add('captured');
		sound.play('shutter');
		if (race && raceStart === null) raceStart = flightSeconds;
		if (nextGate !== sectors.length) return;
		if (race) {
			raceFinish = Math.max(.01, flightSeconds - raceStart);
		}
		record_Completion();
		announce_Completion(courseComplete);
	}

	function lose_Signal() {
		signalLost = true;
		boot.hidden = true;
		flightControls.classList.add('retry-flight');
		button.hidden = true;
		landButton.hidden = true;
		frame.classList.add('signal-lost');
		set_Status(copy.signalLost, 'warn');
		if (!completion) lossTimer = setTimeout(() => request_Restart(copy.newAttempt), 1450);
	}

	function register_Touchdown(safePad) {
		touchdownCamera.start();
		const landingWasActive = landing;
		landing = false;
		if (safePad) logAction('returned');
		if (!damage.disabled && battery > 0 && (landingWasActive || feedback <= 0)) {
			sound.play('land');
			show_Message(safePad ? copy.padRest : copy.touchdown, 'success');
		}
		if (landed || !beach || !safePad || !hasLifted || scanned.size !== sectors.length) return;
		landed = true;
		button.hidden = true;
		record_Completion();
		landingNoticePending = true;
	}

	const raceScore = () => raceFinish === null ? Math.round(nextGate / sectors.length * 65)
		: Math.max(30, Math.min(100, Math.round(100 - Math.max(0, raceFinish - 29) * 1.08 - errors * 4)));
	const fieldScore = () => Math.max(0, Math.round(nextGate / sectors.length * 100) - errors * 4);
	function score_Flight() {
		if (beach) return Math.max(0, scanned.size * 25 + (hasLifted ? 10 : 0) + (landed ? 15 : 0) - errors * 5 - retryPenalty * Math.max(0, attempts - 1));
		return race ? raceScore() : fieldScore();
	}
	const lapStamp = value => {
		const hundredths = Math.round(value * 100);
		return `${Math.floor(hundredths / 6000)}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`;
	};
	if (restoredState) {
		if (beach && scanned.size) capture_Sector([...scanned].at(-1));
		if (signalLost) {
			frame.classList.add('signal-lost');
			flightControls.classList.add('retry-flight');
			button.hidden = landButton.hidden = true;
			set_Status(copy.signalLost, 'warn');
		}
		if (landed) button.hidden = true;
		if (completion || landed) {
			const notice = beach ? (freeMode ? text.free.beachDone : copy.completeNotice) : courseComplete;
			announce_Completion(notice);
		}
	}

	return { scene, camera, focus, motion, damage, points, limits, restart: request_Restart,
		checkpoint: () => ({
			motion, flightSeconds, battery, armed, hasLaunched, signalLost, landing, landed, errors, hasLifted,
			raceStart, raceFinish, impactCooldown, previousObstacle, nextGate, completion, cameraStarted,
			camera: chase ? 'chase' : 'fpv', acro: acro.checkpoint(), hull: damage.hull, propellers: damage.propellers,
			scanned: [...scanned].map(point => sectors.indexOf(point)),
		}),
		completed: () => completion !== null,
		score: () => completion?.score ?? score_Flight(),
		duration: () => completion?.duration ?? null,
		summary: () => beach ? `${copy.attempts} · ${attempts} · ${copy.summarySectors} ${scanned.size} / ${sectors.length}`
			: `${text.free.gates} ${nextGate} / ${sectors.length}${raceFinish === null ? '' : ` · ${text.free.timed} ${lapStamp(raceFinish)}`}`,
		render(time) {
			const effect = Number(effects.value);
			if (signalLost || effect !== 0) video.render(scene, camera, reduceMotion.matches ? 0 : time, videoLoss, effect === 1 ? 1 : effect === 2 ? .61 : .45, signalLost);
			else renderer.render(scene, camera);
		},
		resize(aspect) {
			if (camera.aspect === aspect) return;
			camera.aspect = aspect;
			camera.updateProjectionMatrix();
		},
		update(delta, time, elapsed = delta) {
			for (const mask of pendingMasks) {
				if (!mask.image) continue;
				world.sun.shadow.needsUpdate = true;
				pendingMasks.delete(mask);
			}
			const axes = flightInputs.axes();
			const overlayOpen = resetting || stage_OverlayOpen();
			if (overlayOpen && !paused) flightInputs.reset();
			paused = overlayOpen;
			const moving = !paused;
			if (!moving) delta = 0;
			if (moving && armed && !signalLost) flightSeconds += elapsed;
			if (moving) {
				Object.assign(previous, { x: motion.x, y: motion.y, z: motion.z });
				update_Motion(delta, axes);
			}
			const stamp = race ? lapStamp(raceFinish ?? (raceStart === null ? 0 : flightSeconds - raceStart))
				: [Math.floor(flightSeconds / 60), Math.floor(flightSeconds % 60)].map(value => String(value).padStart(2, '0')).join(':');
			if (clock.textContent !== stamp) clock.textContent = stamp;
			if (seaTime) seaTime.value = time;
			const { x, z, height, heading } = motion;
			const y = groundAt(x, z) + height;
			const backX = Math.sin(heading);
			const backZ = Math.cos(heading);
			fieldDrone.drone.visible = chase;
			fieldDrone.drone.position.set(x, y - modelOffset, z);
			groundShadow.update(x, y + bodyOffset, z, chase);
			const grounded = on_Ground();
			if (stabilized) {
				const forwardSpeed = -(motion.vx * backX + motion.vz * backZ);
				const sideSpeed = motion.vx * backZ - motion.vz * backX;
				fieldDrone.drone.rotation.set(grounded ? 0 : -forwardSpeed * .013, heading,
					grounded ? 0 : -sideSpeed * .013 + damage.rollBias * .3, 'YXZ');
			}
			else fieldDrone.drone.quaternion.copy(acro.attitude);
			if (fieldDrone.body) fieldDrone.body.rotation.z = (1 - damage.hull) * .32;
			const tilt = preferences.getTilt();
			if (chase) {
				updateChase(camera, heading, tilt, Math.min(.07, elapsed), cameraChanged || reduceMotion.matches);
			} else if (!stabilized) {
				camera.position.set(x, y + bodyOffset, z);
				camera.quaternion.copy(acro.attitude);
				camera.rotateX(THREE.MathUtils.degToRad(tilt));
				if (!grounded && !reduceMotion.matches && armed && damage.thrust < .99) camera.rotateX(Math.sin(time * 97) * (1 - damage.thrust) * .028);
			} else {
				camera.position.set(x, y + bodyOffset, z);
				camera.lookAt(x - backX * 20, y + bodyOffset, z - backZ * 20);
				camera.rotateX(THREE.MathUtils.degToRad(tilt));
				if (!grounded && !reduceMotion.matches) camera.rotateZ(-(motion.vx * backZ - motion.vz * backX) * .009);
			}
			cameraChanged = false;
			const cameraSettled = touchdownCamera.settle(delta);
			if (cameraSettled && landingNoticePending) {
				landingNoticePending = false;
				announce_Completion(freeMode ? text.free.beachDone : copy.completeNotice);
			}
			const course = Math.round((360 - THREE.MathUtils.radToDeg(heading) % 360) % 360) % 360;
			videoLoss = signal_AtEdge(x, z, limits);
			if (videoLoss >= 1 && !signalLost) lose_Signal();
			const powered = armed && !signalLost && !damage.disabled && battery > 0;
			sound.flight({ running: powered, throttle: stabilized ? .48 + Math.hypot(motion.vx, motion.vz) * .014 : acro.throttle,
				speed: Math.hypot(motion.vx, motion.vz), signalLost, paused: !moving });
			camera.updateMatrixWorld();
			fieldDrone.propellers.forEach((propeller, index) => {
				propeller.visible = damage.propellers[index] > .04;
				if (powered) propeller.rotation.y += delta * 27 * damage.propellers[index] * (index % 2 ? 1 : -1);
			});
			for (const marker of markers) {
				const { point, label, ring } = marker;
				const visible = beach ? profile.markers && !scanned.has(point) : point === sectors[nextGate];
				if (ring) ring.visible = visible;
				label.hidden = !visible;
				if (label.hidden) continue;
				trackedPosition.set(point.x, ring ? ring.position.y + 1.7 : point.y + (geology ? point.height * .52 : point.height + .95), point.z).project(camera);
				label.hidden = scanned.has(point) || Math.abs(trackedPosition.x) > .92 || Math.abs(trackedPosition.y) > .83 || Math.abs(trackedPosition.z) > 1;
				label.style.left = `${50 + trackedPosition.x * 50}%`;
				label.style.top = `${50 - trackedPosition.y * 50}%`;
			}
			telemetry -= delta;
			if (telemetry <= 0) {
				telemetry = .09;
				if (!mapPanel.hidden) draw_Map(map, x, z, heading, scanned, mapData);
				courseText.textContent = `${String(course).padStart(3, '0')}°`;
				const next = (beach ? sectors.reduce((nearest, point) => {
					if (scanned.has(point)) return nearest;
					return !nearest || distance(point) < distance(nearest) ? point : nearest;
				}, null) : sectors[nextGate]) ?? base;
				const bearing = Math.atan2(next.x - x, z - next.z) + heading;
				const arrow = directionArrows[THREE.MathUtils.euclideanModulo(Math.round(bearing * 4 / Math.PI), 8)];
				navigation.textContent = signalLost ? 'VID 0%' : `VID ${Math.round(100 - videoLoss * 100)}%\nH ${Math.round(distance(base))} m\n${arrow} ${next.label} ${Math.round(distance(next))} m`;
				altitudeText.textContent = `${Math.max(0, height - groundHeight).toFixed(1)} m AGL`;
				speedText.textContent = `${Math.round(Math.hypot(motion.vx, motion.vz) * 3.6)} km/h`;
				batteryText.textContent = `${acro.voltage.toFixed(1)} V`;
				usedText.textContent = `${Math.round(acro.used)} mAh`;
				throttleText.textContent = !stabilized ? `THR ${Math.round((powered ? acro.throttle : 0) * 100)}%` : '';
				updateDamageDisplay(damage);
				batteryText.dataset.low = battery <= 22;
				stateText.textContent = signalLost ? copy.osdFail : damage.disabled ? copy.disabled : !armed ? copy.osdSafe : battery <= 22 ? copy.osdLow
					: grounded && cameraSettled ? (hasLifted ? copy.osdLanded : copy.osdArmed) : '';
				disarmButton.hidden = !armed || signalLost || !on_Ground();
				landButton.hidden = (!story && !stabilized) || !powered || landing || landed || on_Ground();
				if (!signalLost && (damage.disabled || battery === 0)) set_Action(copy.retry);
			}
			flash = Math.max(0, flash - delta);
			frame.classList.toggle('photo-flash', flash > 0 && !reduceMotion.matches);
			feedback -= delta;
			if (!armed || signalLost || landing || landed || feedback > 0) return;
			if (videoLoss > .16) set_Status(copy.edge, 'warn');
			else if (!stabilized && !hasLifted) set_Status(copy.liftAcro);
			else if (!beach) set_Status(nextGate < sectors.length ? text.free.gateHint : '');
			else if (scanned.size === sectors.length) set_Status(onPad(x, z)
				? (story ? copy.storyLandNow : !stabilized ? copy.manualLand : height <= profile.landHeight ? copy.landNow : copy.lower)
				: copy.comeback);
			else if (battery <= 22) set_Status(copy.low, 'warn');
			else if (target_InRange()) set_Status(height >= 3 && height <= 12 ? copy.canScan : copy.near, 'success');
			else set_Status(copy.searching);
		},
	};
}
