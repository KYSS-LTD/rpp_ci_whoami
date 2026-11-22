import * as THREE from 'three';
import { create_FleetModel, fleet } from './fleet.js';
import { text } from './text.js';
import { bind_Click, glyphs, query } from './ui.js';

const copy = text.free;
const difficulties = ['easy', 'normal', 'hard'];
export const freeOptions = { map: 'beach', drone: 'mini', mode: 'acro', camera: 'fpv' };

export function mount_FreeMenu({ mount, signal, screen, select, start, exit, hasSave }) {
	const block = screen === 'assembly' || screen === 'survey';
	const current = screen === 'assembly' ? 0 : 2;
	const options = screen === 'flight';
	const title = block ? text.stages[current].title : options ? copy.flightSetup : copy.title;
	const cards = text.stages.map((stage, index) => {
		const item = copy.blocks[index];
		return `<button type="button" class="free-tile" data-screen="${stage.id}">
			<span class="free-glyph" aria-hidden="true">${glyphs[stage.id]}</span><span><strong>${item.title}</strong><small>${item.detail}</small></span>
			<span class="free-chevron" aria-hidden="true">›</span></button>`;
	}).join('');
	const radio = (name, id, label, detail, selected, icon) => `<label class="free-option"><input type="radio" name="${name}" value="${id}" ${id === selected ? 'checked' : ''}>
		<span aria-hidden="true">${icon}</span><span><strong>${label}</strong>${detail ? `<small>${detail}</small>` : ''}</span></label>`;
	const aircraft = Object.entries(fleet).map(([id, drone]) => `<option value="${id}" ${id === freeOptions.drone ? 'selected' : ''}>${drone.name}</option>`).join('');
	const optionsMarkup = `<div class="free-setup"><fieldset class="free-maps"><legend>${copy.map}</legend>
		${Object.entries(copy.maps).map(([id, map]) => radio('map', id, map.title, map.detail, freeOptions.map, map.icon)).join('')}
		</fieldset><div class="free-aircraft">
			<label class="free-select">${copy.drone}<select id="free-drone">${aircraft}</select></label>
			<div class="free-model" aria-hidden="true"><div class="canvas-slot" id="canvas-slot"></div></div>
			<div class="free-drone-detail"><strong id="drone-kind"></strong><p id="drone-description"></p><p class="micro" id="drone-spec"></p>
				<a class="free-source" id="drone-source" target="_blank" rel="noopener noreferrer">${copy.specs}</a></div>
		</div><div class="free-flight-settings">
			<label class="free-select">${text.flight.mode}<select id="free-mode">
				${Object.entries(text.flight.modes).map(([id, label]) => `<option value="${id}" ${id === freeOptions.mode ? 'selected' : ''}>${label}</option>`).join('')}
			</select></label>
			<label class="free-select">${copy.camera}<select id="free-camera">
				${Object.entries(copy.cameras).map(([id, label]) => `<option value="${id}" ${id === freeOptions.camera ? 'selected' : ''}>${label}</option>`).join('')}
			</select></label>
		</div></div>`;
	mount(`<section class="free-page">
		<header class="free-header"><div><p class="micro">${text.brand}</p><h1 tabindex="-1">${title}</h1></div>
			<button type="button" class="button button-quiet icon-button" id="free-back" aria-label="${screen ? copy.back : text.toHub}" title="${screen ? copy.back : text.toHub}">${screen ? '‹' : '×'}</button>
		</header>
		${options ? optionsMarkup : block ? `<p>${copy.pickDifficulty}</p><fieldset class="free-difficulties"><legend class="sr-only">${copy.pickDifficulty}</legend>
			${difficulties.map((id, index) => radio('difficulty', id, text.difficulty[id].title, '', 'easy', ['▁', '▁▃', '▁▃▆'][index])).join('')}</fieldset>` :
			`<p>${copy.intro}</p><div class="free-blocks">${cards}</div>`}
		${screen ? `<div class="free-launch"><button type="button" class="button button-primary" id="free-start"><span aria-hidden="true">▶</span><span id="free-start-label">${copy.start}</span></button></div>` : ''}
	</section>`);
	bind_Click('#free-back', () => screen ? select(null) : exit(), signal);
	document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => select(button.dataset.screen), { signal }));
	function update_Start() {
		const level = options ? 'easy' : query('input[name="difficulty"]:checked').value;
		query('#free-start-label').textContent = hasSave(options ? 1 : current, level) ? copy.resume : copy.start;
	}
	if (screen) {
		bind_Click('#free-start', () => {
			if (options) start(1, 'easy');
			else start(current, query('input[name="difficulty"]:checked').value);
		}, signal);
		query('.free-page').addEventListener('change', update_Start, { signal });
		update_Start();
	}
	query('h1').focus({ preventScroll: true });
	if (!options) return null;

	const { drone: models, scene, camera } = create_Selection();
	const modelSelect = query('#free-drone');
	function show_Drone() {
		const drone = fleet[freeOptions.drone = modelSelect.value];
		for (const [key, model] of Object.entries(models)) model.visible = key === freeOptions.drone;
		query('#drone-kind').textContent = drone.kind;
		query('#drone-description').textContent = drone.description;
		query('#drone-spec').textContent = drone.spec;
		query('#drone-source').href = drone.source;
	}
	modelSelect.addEventListener('change', show_Drone, { signal });
	query('#free-mode').addEventListener('change', event => { freeOptions.mode = event.target.value; }, { signal });
	query('#free-camera').addEventListener('change', event => { freeOptions.camera = event.target.value; }, { signal });
	document.querySelectorAll('[name="map"]').forEach(input => input.addEventListener('change', () => { freeOptions.map = input.value; }, { signal }));
	show_Drone();
	const motion = matchMedia('(prefers-reduced-motion: no-preference)');
	return {
		scene, camera,
		resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
		update(delta) { if (motion.matches) models[freeOptions.drone].rotation.y += delta * .43; },
	};
}

function create_Selection() {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x2b3c35);
	const camera = new THREE.PerspectiveCamera(37, 1, .1, 24);
	camera.position.set(1.8, 2.0, -2.5);
	camera.lookAt(0, .1, 0);
	scene.add(new THREE.HemisphereLight(0xfaffec, 0x7eaaa4, 2.7));
	const light = new THREE.DirectionalLight(0xffead0, 3.1);
	light.position.set(-2, 6, -3);
	scene.add(light);
	const drone = {};
	for (const [key, kit] of Object.entries(fleet)) {
		const model = create_FleetModel(scene, key).drone;
		model.scale.setScalar(1.60 / kit.width);
		model.rotation.y = -.35;
		drone[key] = model;
	}
	return { scene, camera, drone };
}
