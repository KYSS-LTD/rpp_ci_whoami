import * as THREE from 'three';
import { base as coastBase, flight_Ground, limits as coastLimits, on_Pad, padRadius as coastPadRadius, sectors as beachSectors, shore } from './coast.js';
import { retryPenalty } from './difficulty.js';
import { create_FleetModel, fleet } from './fleet.js';
import { create_ChaseCamera, create_Damage, signal_AtEdge } from './flight-dynamics.js';
import { bind_DamageDisplay } from './flight-damage-display.js';
import { bind_Preferences, flightPreferences, preference_Markup } from './flight-preferences.js';
import { create_Acro, fpvKit } from './fpv.js';
import { bind_FlightInputs, bind_Joystick } from './inputs.js';
import { add_Beacon } from './scenes.js';
import { dispose_Scene, palette } from './models.js';
import { create_Field, gate_Crossing } from './training-field.js';
import { bind_Click, close_StageMenu, query, scene_Frame, set_Status, show_CompletePrompt, stage_OverlayOpen, stage_Shell, toggle_StageMenu, vibrate_Device } from './ui.js';
import { text } from './text.js';
import { create_AnalogFeed } from './video.js';

const launchHeading = -Math.PI * .34;
const directionArrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const groundHeight = .72;

function draw_Map(context, x, z, heading, scanned, { limits, points, beach }) {
	const width = context.canvas.width;
	const height = context.canvas.height;
	const plotX = world => 11 + (world - limits.minX) / (limits.maxX - limits.minX) * (width - 22);
	const plotZ = world => 11 + (world - limits.minZ) / (limits.maxZ - limits.minZ) * (height - 22);
	context.fillStyle = beach ? '#234346' : '#485643';
	context.fillRect(0, 0, width, height);
	if (beach) {
		context.fillStyle = '#596054';
		context.beginPath();
		context.moveTo(0, 0);
		for (let y = 0; y <= height; y += 2) {
			context.lineTo(plotX(shore(limits.minZ + (y - 11) / (height - 22) * (limits.maxZ - limits.minZ))), y);
		}
		context.lineTo(0, height);
		context.fill();
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

export function start_Flight({ mount, coast, renderer, signal, settings, restart, attempts, onLaunch, sound, restarting, logAction, practice, resetMessage, freeMode }) {
	const copy = text.flight;
	const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
	const beach = !practice || practice.map === 'beach';
	const race = practice?.map === 'race';
	const field = beach ? null : create_Field(race);
	const world = field ?? coast;
	const { scene, seaTime, touchesTree } = world;
	const base = world.base ?? coastBase;
	const limits = world.limits ?? coastLimits;
	const onPad = world.onPad ?? on_Pad;
	const padRadius = world.padRadius ?? coastPadRadius;
	const groundAt = world.flightGround ?? flight_Ground;
	const sectors = world.gates ?? beachSectors;
	const points = [base, ...sectors];
	const mapData = { limits, points, beach };
	const droneKey = practice?.drone;
	const kit = droneKey ? fleet[droneKey] : fpvKit;
	const fieldDrone = droneKey ? create_FleetModel(scene, droneKey) : world.fieldDrone;
	if (droneKey && beach) coast.fieldDrone.drone.visible = false;
	const chase = practice?.camera === 'chase';
	const droneCenter = chase ? fieldDrone.drone.worldToLocal(new THREE.Box3().setFromObject(fieldDrone.drone).getCenter(new THREE.Vector3())) : null;
	const chaseDistance = chase ? Math.max(1.4, kit.length * 5.5) : 0;
	const updateChase = chase ? create_ChaseCamera(fieldDrone.drone, droneCenter, chaseDistance) : null;
	const camera = new THREE.PerspectiveCamera(flightPreferences.fov, 1, .07, 620);
	const profile = practice ? { ...settings.flight, mode: practice.mode, drain: .7 } : settings.flight;
	const { scanRadius } = profile;
	const stabilized = profile.mode === 'assisted';
	const trainer = profile.mode === 'angle';
	const modeLabel = copy.osdModes[profile.mode];
	const keys = stabilized ? copy.keys : trainer ? copy.angleKeys : copy.acroKeys;
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
			<label>${copy.filter}<select id="input-filter" ${stabilized ? 'disabled' : ''}><option value="12">12 Hz</option><option value="6" selected>6 Hz</option><option value="3">3 Hz</option></select></label>
			<label>${copy.feed}<select id="camera-effects"><option value="1" selected>${copy.analog}</option><option value="2">${copy.soft}</option><option value="0">${copy.clean}</option></select></label>
			${preference_Markup()}
		</div>
		<figure class="flight-photo" id="flight-photo" hidden><canvas id="photo-preview" width="1440" height="900" aria-label="${copy.capture}"></canvas><figcaption id="photo-caption"></figcaption><button type="button" id="expand-photo" class="button button-quiet">${copy.expand}</button></figure>
		<p class="keyboard-note" id="current-flight-keys"></p><p class="joystick-note">${sticks}</p><p class="keyboard-note">${copy.gamepad}</p>`;
	const tutorial = `<p class="keyboard-note">${keys}</p><p class="joystick-note">${sticks}</p><p class="keyboard-note">${copy.gamepad}</p>`;
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
	if (restarting) connect_Camera();
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

	function announce_Completion(message) {
		if (!completionNotice) return show_CompletePrompt(message);
		completion = { score: score_Flight(), duration: raceFinish ?? flightSeconds };
		completionNotice.textContent = `${message} ${text.free.flightExitHint}`;
		vibrate_Device([30, 60, 30]);
		completionTimer = setTimeout(() => { completionNotice.textContent = ''; }, 3000);
	}
	signal.addEventListener('abort', () => clearTimeout(completionTimer), { once: true });
	const previous = { x: motion.x, y: motion.y, z: motion.z };
	const attitudeStick = bind_Joystick(query('#stick-move'), signal);
	const throttleStick = bind_Joystick(query('#stick-view'), signal);
	const leftIndicator = query('#indicator-left i');
	const rightIndicator = query('#indicator-right i');
	bind_Preferences(signal, fov => { camera.fov = fov; camera.updateProjectionMatrix(); }, chase ? 'chase' : 'fpv');
	const flightInputs = bind_FlightInputs(attitudeStick, throttleStick, {
		action: perform_Action, toggleMap: toggle_Map, restart: request_Restart,
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
	set_Action(stabilized ? copy.takeoff : copy.arm);
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
		if (resetting || stage_OverlayOpen()) return;
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
		if (resetting || signalLost || landed || landing || damage.disabled || !armed || on_Ground()) return;
		if (!stabilized) return show_Message(beach ? copy.manualLand : text.free.gateHint);
		if (beach && distance(base) > padRadius) return show_Message(copy.badLand, 'warn');
		if (motion.height > profile.landHeight) return show_Message(copy.lower, 'warn');
		landing = true;
		show_Message(beach ? copy.landing : copy.descending, 'success');
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
		if (!armed || signalLost) return;
		const powered = !damage.disabled && battery > 0;
		const wasOnGround = on_Ground();
		let impact = 0;
		let upright = 1;
		if (!stabilized) {
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
		const travel = Math.hypot(motion.x - previous.x, motion.y - previous.y, motion.z - previous.z);
		const samples = Math.max(1, Math.ceil(travel / .28));
		let obstacle = false;
		for (let sample = 1; sample <= samples && !obstacle; sample++) {
			const timeAlongPath = sample / samples;
			obstacle = touchesTree(
				THREE.MathUtils.lerp(previous.x, motion.x, timeAlongPath),
				THREE.MathUtils.lerp(previous.y, motion.y, timeAlongPath),
				THREE.MathUtils.lerp(previous.z, motion.z, timeAlongPath),
			);
		}
		const side = motion.vx * Math.cos(motion.heading) - motion.vz * Math.sin(motion.heading);
		const fore = motion.vx * Math.sin(motion.heading) + motion.vz * Math.cos(motion.heading);
		if (obstacle) {
			if (!previousObstacle) impact = Math.max(impact, Math.hypot(motion.vx, motion.vz, stabilized ? motion.vy : acro.velocity.y));
			motion.x = previous.x;
			motion.z = previous.z;
			motion.y = previous.y;
			motion.height = motion.y - groundAt(motion.x, motion.z);
			motion.vx *= -.24;
			motion.vz *= -.24;
			acro.velocity.multiplyScalar(-.24);
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
		if (!gate_Crossing(gate, previous, motion)) return;
		nextGate++;
		scanned.add(gate);
		query(`#sector-${gate.label}`).classList.add('captured');
		sound.play('shutter');
		if (race && raceStart === null) raceStart = flightSeconds;
		if (nextGate !== sectors.length) return;
		if (race) {
			raceFinish = Math.max(.01, flightSeconds - raceStart);
			flightControls.hidden = true;
		}
		announce_Completion(race ? text.free.raceDone : text.free.fieldDone);
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
		announce_Completion(freeMode ? text.free.beachDone : copy.completeNotice);
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
	return { scene, camera, focus, motion, damage, points, limits, restart: request_Restart,
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
			const axes = flightInputs.axes();
			const overlayOpen = resetting || stage_OverlayOpen();
			if (overlayOpen && !paused) flightInputs.reset();
			paused = overlayOpen;
			const moving = !paused && raceFinish === null;
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
			fieldDrone.drone.position.set(x, y - .66, z);
			const grounded = on_Ground();
			if (stabilized) {
				const forwardSpeed = -(motion.vx * backX + motion.vz * backZ);
				const sideSpeed = motion.vx * backZ - motion.vz * backX;
				fieldDrone.drone.rotation.set(grounded ? 0 : -forwardSpeed * .013, heading,
					grounded ? 0 : -sideSpeed * .013 + damage.rollBias * .3, 'YXZ');
			}
			else fieldDrone.drone.quaternion.copy(acro.attitude);
			if (fieldDrone.body) fieldDrone.body.rotation.z = (1 - damage.hull) * .32;
			if (chase) {
				updateChase(camera);
			} else if (!stabilized) {
				camera.position.set(x, y + .20, z);
				camera.quaternion.copy(acro.attitude);
				camera.rotateX(THREE.MathUtils.degToRad(kit.cameraTilt));
				if (!grounded && !reduceMotion.matches && armed && damage.thrust < .99) camera.rotateX(Math.sin(time * 97) * (1 - damage.thrust) * .028);
			} else {
				camera.position.set(x, y + .20, z);
				camera.lookAt(x - backX * 20, y - 3.6, z - backZ * 20);
				if (!grounded && !reduceMotion.matches) camera.rotateZ(-(motion.vx * backZ - motion.vz * backX) * .009);
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
				trackedPosition.set(point.x, ring ? ring.position.y + 1.7 : point.y + point.height + .95, point.z).project(camera);
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
					: on_Ground() ? (hasLifted ? copy.osdLanded : copy.osdArmed) : '';
				disarmButton.hidden = !armed || signalLost || !on_Ground();
				landButton.hidden = !stabilized || !powered || landing || landed || on_Ground();
				if (!signalLost && (damage.disabled || battery === 0)) set_Action(copy.retry);
			}
			flash = Math.max(0, flash - delta);
			frame.classList.toggle('photo-flash', flash > 0 && !reduceMotion.matches);
			feedback -= delta;
			if (!armed || signalLost || landing || landed || feedback > 0) return;
			if (videoLoss > .16) set_Status(copy.edge, 'warn');
			else if (!stabilized && !hasLifted) set_Status(copy.liftAcro);
			else if (!beach) set_Status(nextGate < sectors.length ? text.free.gateHint : '');
			else if (scanned.size === sectors.length) set_Status(distance(base) <= padRadius ? (!stabilized ? copy.manualLand : height <= profile.landHeight ? copy.landNow : copy.lower) : copy.comeback);
			else if (battery <= 22) set_Status(copy.low, 'warn');
			else if (target_InRange()) set_Status(height >= 3 && height <= 12 ? copy.canScan : copy.near, 'success');
			else set_Status(copy.searching);
		},
	};
}
