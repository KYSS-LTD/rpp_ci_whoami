import { text } from './text.js';
import { query } from './ui.js';

const defaults = { menu: 'KeyP', restart: 'KeyR', map: 'KeyM', action: 'Space' };
const allowed = ['KeyP', 'KeyR', 'KeyM', 'Space', 'KeyE', 'KeyQ', 'KeyF', 'KeyG', 'KeyH', 'KeyT', 'KeyU', 'KeyX', 'KeyZ', 'Enter'];
export const flightPreferences = { indicators: true, fov: 60, filter: '6', feed: '1', bindings: { ...defaults } };
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
		<label class="flight-menu-toggle"><input type="checkbox" id="show-indicators" ${flightPreferences.indicators ? 'checked' : ''}>${copy.indicator}</label>
		<details class="flight-bindings"><summary>${copy.bindings}</summary>
			${Object.entries(bindings).map(([id, label]) => `<label>${label}<select data-flight-bind="${id}">${allowed.map(code =>
				`<option value="${code}" ${flightPreferences.bindings[id] === code ? 'selected' : ''}>${keyLabel(code)}</option>`).join('')}</select></label>`).join('')}
			<button type="button" class="button button-quiet" id="default-flight-keys">${copy.bindDefault}</button>
		</details>`;
}

export function bind_Preferences(signal, setFov) {
	const checkbox = query('#show-indicators');
	const fov = query('#camera-fov');
	const fovValue = query('#camera-fov-value');
	const filter = query('#input-filter');
	const feed = query('#camera-effects');
	const bindings = Array.from(document.querySelectorAll('[data-flight-bind]'));
	const indicators = query('#stick-indicators');
	const sync = () => {
		for (const select of bindings) select.value = flightPreferences.bindings[select.dataset.flightBind];
		indicators.hidden = !flightPreferences.indicators;
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
	const syncFov = () => {
		flightPreferences.fov = fov.valueAsNumber;
		const degrees = `${flightPreferences.fov}°`;
		fovValue.textContent = degrees;
		fov.setAttribute('aria-valuetext', degrees);
		setFov(flightPreferences.fov);
	};
	fov.addEventListener('input', syncFov, { signal });
	filter.value = flightPreferences.filter;
	feed.value = flightPreferences.feed;
	filter.addEventListener('change', () => { flightPreferences.filter = filter.value; }, { signal });
	feed.addEventListener('change', () => { flightPreferences.feed = feed.value; }, { signal });
	syncFov();
	sync();
}
