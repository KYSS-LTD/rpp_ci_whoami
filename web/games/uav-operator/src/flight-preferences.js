import { text } from './text.js';
import { query } from './ui.js';

const defaults = { menu: 'KeyP', restart: 'KeyR', map: 'KeyM', action: 'Space' };
const allowed = ['KeyP', 'KeyR', 'KeyM', 'Space', 'KeyE', 'KeyQ', 'KeyF', 'KeyG', 'KeyH', 'KeyT', 'KeyU', 'KeyX', 'KeyZ', 'Enter'];
export const flightPreferences = { indicators: true, touchSticks: false, fov: 60, chaseTilt: 0, fpvTilts: new Map(), filter: '6', feeds: { fpv: '0', story: '1', chase: '0' }, bindings: { ...defaults } };
const copy = text.flight;

function keyLabel(code) {
	return code === 'Space' ? '␣' : code.replace('Key', '');
}

export function preference_Markup() {
	const bindings = { menu: copy.bindMenu, restart: copy.bindReset, map: copy.bindMap, action: copy.bindAction };
	return `<label class="flight-fov" for="camera-fov"><span>${copy.fov}</span>
			<output id="camera-fov-value" for="camera-fov"></output>
			<input type="range" id="camera-fov" min="40" max="100" step="1" value="${flightPreferences.fov}">
		</label>
		<label class="flight-fov" for="camera-tilt"><span id="camera-tilt-label"></span>
			<output id="camera-tilt-value" for="camera-tilt"></output>
			<input type="range" id="camera-tilt" step="1" aria-describedby="camera-tilt-help">
		</label><p class="keyboard-note camera-tilt-help" id="camera-tilt-help"></p>
		<label class="flight-menu-toggle touch-setting"><input type="checkbox" id="show-touch-sticks" ${flightPreferences.touchSticks ? 'checked' : ''}>${copy.touchSticks}</label>
		<label class="flight-menu-toggle"><input type="checkbox" id="show-indicators" ${flightPreferences.indicators ? 'checked' : ''}>${copy.indicator}</label>
		<details class="flight-bindings"><summary>${copy.bindings}</summary>
			${Object.entries(bindings).map(([id, label]) => `<label>${label}<select data-flight-bind="${id}">${allowed.map(code =>
				`<option value="${code}" ${flightPreferences.bindings[id] === code ? 'selected' : ''}>${keyLabel(code)}</option>`).join('')}</select></label>`).join('')}
			<button type="button" class="button button-quiet" id="default-flight-keys">${copy.bindDefault}</button>
		</details>`;
}

export function bind_Preferences(signal, setFov, cameraMode, tiltKey, defaultTilt, onTouchChange, story) {
	const checkbox = query('#show-indicators');
	const fov = query('#camera-fov');
	const fovValue = query('#camera-fov-value');
	const tilt = query('#camera-tilt');
	const tiltValue = query('#camera-tilt-value');
	const touchSticks = query('#show-touch-sticks');
	const filter = query('#input-filter');
	const feed = query('#camera-effects');
	const bindings = Array.from(document.querySelectorAll('[data-flight-bind]'));
	const indicators = query('#stick-indicators');
	const sync = () => {
		for (const select of bindings) select.value = flightPreferences.bindings[select.dataset.flightBind];
		indicators.hidden = !flightPreferences.indicators || matchMedia('(pointer: coarse)').matches;
		onTouchChange(touchSticks.checked);
		query('#current-flight-keys').textContent = bindings.map(select => `${select.parentElement.firstChild.textContent} ${keyLabel(select.value)}`).join(' · ');
	};
	for (const select of bindings) select.addEventListener('change', () => {
		const id = select.dataset.flightBind;
		const previous = flightPreferences.bindings[id];
		const replaced = Object.keys(flightPreferences.bindings).find(key => flightPreferences.bindings[key] === select.value);
		if (replaced) flightPreferences.bindings[replaced] = previous;
		flightPreferences.bindings[id] = select.value;
		sync();
	}, { signal });
	query('#default-flight-keys').addEventListener('click', () => {
		Object.assign(flightPreferences.bindings, defaults);
		sync();
	}, { signal });
	checkbox.addEventListener('change', () => { flightPreferences.indicators = checkbox.checked; sync(); }, { signal });
	touchSticks.addEventListener('change', () => { flightPreferences.touchSticks = touchSticks.checked; sync(); }, { signal });
	const syncFov = () => {
		flightPreferences.fov = fov.valueAsNumber;
		const degrees = `${flightPreferences.fov}°`;
		fovValue.textContent = degrees;
		fov.setAttribute('aria-valuetext', degrees);
		setFov(flightPreferences.fov);
	};
	fov.addEventListener('input', syncFov, { signal });
	filter.value = flightPreferences.filter;
	filter.addEventListener('change', () => { flightPreferences.filter = filter.value; }, { signal });
	let mode = cameraMode;
	const getTilt = () => mode === 'chase' ? flightPreferences.chaseTilt : (flightPreferences.fpvTilts.get(tiltKey) ?? defaultTilt);
	function syncTilt() {
		const degrees = `${getTilt()}°`;
		tiltValue.textContent = degrees;
		tilt.setAttribute('aria-valuetext', degrees);
	}
	function selectCamera(nextMode) {
		mode = nextMode;
		const chase = mode === 'chase';
		fov.parentElement.hidden = chase;
		if (chase) setFov(60);
		else syncFov();
		query('#camera-tilt-label').textContent = chase ? copy.chaseTilt : copy.fpvTilt;
		query('#camera-tilt-help').textContent = chase ? copy.chaseTiltHelp : copy.fpvTiltHelp;
		tilt.min = chase ? '-25' : '-20';
		tilt.max = chase ? '25' : '60';
		tilt.value = getTilt();
		feed.value = flightPreferences.feeds[story && mode === 'fpv' ? 'story' : mode];
		syncTilt();
	}
	tilt.addEventListener('input', () => {
		if (mode === 'chase') flightPreferences.chaseTilt = tilt.valueAsNumber;
		else flightPreferences.fpvTilts.set(tiltKey, tilt.valueAsNumber);
		syncTilt();
	}, { signal });
	feed.addEventListener('change', () => { flightPreferences.feeds[story && mode === 'fpv' ? 'story' : mode] = feed.value; }, { signal });
	selectCamera(cameraMode);
	sync();
	return { getTilt, selectCamera };
}
