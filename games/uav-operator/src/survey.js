import { create_Photo } from './scenes.js';
import { bind_Click, query, scene_Frame, set_Status, stage_Shell } from './ui.js';
import { text } from './text.js';

function rectangle(first, second) {
	return { x: Math.min(first.x, second.x), y: Math.min(first.y, second.y),
		w: Math.abs(second.x - first.x), h: Math.abs(second.y - first.y) };
}

function place_Box(element, rect) {
	Object.assign(element.style, { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` });
}

function match_Quality(box, target) {
	const width = Math.max(0, Math.min(box.x + box.w, target.x + target.w) - Math.max(box.x, target.x));
	const height = Math.max(0, Math.min(box.y + box.h, target.y + target.h) - Math.max(box.y, target.y));
	const overlap = width * height;
	const targetArea = target.w * target.h;
	const boxArea = box.w * box.h;
	if (overlap < Math.min(targetArea, boxArea) * .47) return 0;
	return overlap / (targetArea + boxArea - overlap);
}

export function start_Survey({ mount, complete, signal }) {
	const photo = create_Photo();
	const copy = text.survey;
	const targetCount = photo.targets.length;
	const scene = scene_Frame(`<div id="annotations" tabindex="0" role="region" aria-label="${copy.view}" aria-describedby="photo-keys">
		<div class="photo-box" id="draft" hidden></div><div class="photo-hint" id="photo-hint" hidden></div>
		<div class="photo-cursor" id="photo-cursor" hidden></div>
		</div><span class="view-label">${copy.view}</span><span class="photo-count view-label">${copy.count} <b id="found-count">0 / ${targetCount}</b></span>`);
	const panel = `<div class="diagram"><p class="micro">${copy.legend}</p><ul class="photo-legend">
		${Object.entries(copy.kinds).map(([kind, entry]) => `<li><i aria-hidden="true" class="object-${kind}"></i><div><strong>${entry.title}</strong><span>${entry.detail}</span></div></li>`).join('')}
		</ul></div><div class="photo-actions">
		<label for="category">${copy.category}</label><select id="category" disabled><option value="">${copy.classify}</option>${Object.entries(copy.kinds).map(([kind, entry]) => `<option value="${kind}">${entry.title}</option>`).join('')}</select>
		<button class="button button-primary wide" id="confirm" type="button" disabled>${copy.confirm}</button>
		<div class="actions-row"><button class="button button-quiet" id="photo-help" type="button">${copy.hint}</button><button class="button button-quiet" id="photo-reset" type="button" disabled>${copy.cancel}</button></div>
		</div>`;
	mount(stage_Shell(2, scene, panel, `<p class="keyboard-note" id="photo-keys">${copy.keys}</p>`));
	const overlay = query('#annotations');
	const draft = query('#draft');
	const hint = query('#photo-hint');
	const cursor = query('#photo-cursor');
	const category = query('#category');
	const confirm = query('#confirm');
	const reset = query('#photo-reset');
	const found = new Set();
	let errors = 0;
	let hints = 0;
	let accuracy = 0;
	let active = null;
	let anchor = null;
	let selection = null;
	let keyboard = { x: .5, y: .5 };
	set_Status(copy.trace);

	function update_Controls() {
		category.disabled = !selection;
		confirm.disabled = !selection || !category.value;
		reset.disabled = !selection && !anchor;
	}

	function show_Draft(box) {
		draft.hidden = false;
		place_Box(draft, box);
	}

	function clear_Draft() {
		anchor = selection = null;
		draft.hidden = true;
		category.value = '';
		update_Controls();
	}

	function finish_Box(first, last) {
		const box = rectangle(first, last);
		if (box.w < .011 || box.h < .015) {
			anchor = first;
			show_Draft({ ...first, w: 0, h: 0 });
			set_Status(copy.trace);
		} else {
			selection = box;
			anchor = null;
			show_Draft(box);
			set_Status(copy.classify);
		}
		update_Controls();
	}

	const clamp = value => Math.max(0, Math.min(1, value));
	function pointer_Point(event) {
		const rect = overlay.getBoundingClientRect();
		return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
	}

	overlay.addEventListener('pointerdown', event => {
		if (event.button !== 0 || active) return;
		if (selection) clear_Draft();
		cursor.hidden = true;
		active = { id: event.pointerId, start: pointer_Point(event) };
		overlay.setPointerCapture(event.pointerId);
	}, { signal });
	overlay.addEventListener('pointermove', event => {
		if (active?.id === event.pointerId) show_Draft(rectangle(anchor || active.start, pointer_Point(event)));
	}, { signal });
	overlay.addEventListener('pointerup', event => {
		if (active?.id !== event.pointerId) return;
		finish_Box(anchor || active.start, pointer_Point(event));
		active = null;
	}, { signal });
	overlay.addEventListener('lostpointercapture', event => {
		if (active?.id !== event.pointerId) return;
		active = null;
		clear_Draft();
	}, { signal });
	overlay.addEventListener('keydown', event => {
		const offset = event.shiftKey ? .042 : .012;
		const shifts = { ArrowLeft: [-offset, 0], ArrowRight: [offset, 0], ArrowUp: [0, -offset], ArrowDown: [0, offset] };
		if (event.key in shifts) {
			event.preventDefault();
			const [dx, dy] = shifts[event.key];
			keyboard = { x: clamp(keyboard.x + dx), y: clamp(keyboard.y + dy) };
			cursor.hidden = false;
			cursor.style.left = `${keyboard.x * 100}%`;
			cursor.style.top = `${keyboard.y * 100}%`;
			if (anchor) show_Draft(rectangle(anchor, keyboard));
		} else if (event.key === 'Enter' && !event.repeat) {
			event.preventDefault();
			if (selection) clear_Draft();
			finish_Box(anchor || keyboard, keyboard);
		} else if (event.key === 'Escape') {
			clear_Draft();
			set_Status(copy.trace);
		}
	}, { signal });
	category.addEventListener('change', update_Controls, { signal });
	bind_Click('#photo-reset', () => {
		clear_Draft();
		overlay.focus({ preventScroll: true });
		set_Status(copy.trace);
	}, signal);
	bind_Click('#photo-help', () => {
		if (!hint.hidden) return;
		const target = photo.targets.find(item => !found.has(item));
		hints++;
		hint.hidden = false;
		place_Box(hint, { x: target.x + target.w / 2 - .052, y: target.y + target.h / 2 - .083, w: .104, h: .166 });
		set_Status(copy.hintShown);
	}, signal);
	bind_Click('#confirm', () => {
		const [best] = photo.targets.map(target => ({ target, quality: match_Quality(selection, target) })).sort((first, second) => second.quality - first.quality);
		if (best.quality < .20 || found.has(best.target) || best.target.kind !== category.value) {
			errors++;
			set_Status(best.quality < .20 ? copy.miss : found.has(best.target) ? copy.duplicate : copy.wrong, 'warn');
			return;
		}
		found.add(best.target);
		accuracy += best.quality;
		const label = document.createElement('div');
		label.className = 'photo-box accepted';
		label.setAttribute('aria-label', copy.kinds[category.value].title);
		place_Box(label, best.target);
		overlay.prepend(label);
		if (found.size === targetCount) {
			complete(Math.max(55, 88 + Math.round(12 * accuracy / targetCount) - errors * 5 - hints * 3));
			return;
		}
		query('#found-count').textContent = `${found.size} / ${targetCount}`;
		hint.hidden = true;
		clear_Draft();
		overlay.focus({ preventScroll: true });
		set_Status(copy.found, 'success');
	}, signal);
	return photo;
}
