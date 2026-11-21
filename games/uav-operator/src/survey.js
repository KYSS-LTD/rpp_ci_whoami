import { dispose_Scene } from './models.js';
import { count_Targets, create_Photo } from './photo.js';
import { bind_Click, close_StageMenu, query, scene_Frame, set_Status, show_CompletePrompt, stage_Shell, vibrate_Device } from './ui.js';
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

function best_Match(selection, items) {
	return items.map(item => ({ item, quality: match_Quality(selection, item) })).sort((first, second) => second.quality - first.quality)[0] ?? { item: null, quality: 0 };
}

export function start_Survey({ mount, signal, settings, invalidate }) {
	const { photos: layoutIds, kinds, decoys: withDecoys } = settings.survey;
	const copy = text.survey;
	const totalTargets = layoutIds.reduce((sum, id) => sum + count_Targets(id, kinds), 0);
	const multiple = layoutIds.length > 1;
	const scene = scene_Frame(`<div id="annotations" tabindex="0" role="region" aria-label="${copy.view}" aria-describedby="photo-keys">
		<div class="photo-box" id="draft" hidden></div><div class="photo-hint" id="photo-hint" hidden></div>
		<div class="photo-cursor" id="photo-cursor" hidden></div>
		</div>${multiple ? `<p class="photo-badge" id="photo-badge"></p>` : ''}
		<div class="next-photo" id="next-photo-prompt" hidden><button class="button button-primary" id="next-photo-button" type="button">${copy.nextPhoto} →</button></div>`);
	const panel = `<div class="diagram"><p class="micro">${copy.count} <b id="found-count">0 / ${totalTargets}</b></p><p class="micro">${copy.legend}</p><ul class="photo-legend">
		${kinds.map(kind => `<li><i aria-hidden="true" class="object-${kind}"></i><div><strong>${copy.kinds[kind].title}</strong><span>${copy.kinds[kind].detail}</span></div></li>`).join('')}
		</ul></div><button class="button button-quiet" id="photo-help" type="button">${copy.hint}</button>
		${multiple ? `<button class="button button-quiet" id="skip-photo" type="button">${copy.nextPhoto}</button>` : ''}`;
	const controls = `<dialog class="stage-dialog" id="classify-photo" aria-labelledby="classify-title">
		<h2 id="classify-title">${copy.classifyTitle}</h2><div class="photo-actions">
		<label for="category">${copy.category}</label><select id="category" autofocus disabled><option value="">${copy.classify}</option>${kinds.map(kind => `<option value="${kind}">${copy.kinds[kind].title}</option>`).join('')}</select>
		<p id="classification-feedback" role="status"></p></div><form method="dialog" class="dialog-actions">
		<button class="button button-quiet" value="cancel">${copy.cancel}</button><button class="button button-primary" id="confirm" type="button" disabled>${copy.confirm}</button>
		</form></dialog>`;
	mount(stage_Shell(2, scene, panel, controls, `<p class="keyboard-note" id="photo-keys">${copy.keys}</p>`));
	const overlay = query('#annotations');
	const draft = query('#draft');
	const hint = query('#photo-hint');
	const cursor = query('#photo-cursor');
	const category = query('#category');
	const confirm = query('#confirm');
	const classification = query('#classify-photo');
	const feedback = query('#classification-feedback');
	const nextPrompt = query('#next-photo-prompt');
	let photoIndex = 0;
	let photo = create_Photo(layoutIds[0], kinds, withDecoys);
	let found = new Set();
	let foundTotal = 0;
	let errors = 0;
	let hints = 0;
	let accuracy = 0;
	let active = null;
	let anchor = null;
	let selection = null;
	let keyboard = { x: .5, y: .5 };
	set_Status(copy.trace);

	// Объект режима для главного цикла: сцена и камера меняются при переходе к следующему снимку.
	const view = { scene: photo.scene, camera: photo.camera };
	function watch_Texture() {
		view.update = () => {
			if (photo.ready()) delete view.update;
		};
		invalidate();
	}
	watch_Texture();

	const photoDone = () => found.size === photo.targets.length;
	const lastPhoto = () => photoIndex === layoutIds.length - 1;

	function update_Counters() {
		query('#found-count').textContent = `${foundTotal} / ${totalTargets}`;
		if (multiple) query('#photo-badge').textContent = `${copy.photo} ${photoIndex + 1} / ${layoutIds.length} · ${found.size} / ${photo.targets.length}`;
		query('#photo-help').disabled = photoDone();
		const skip = query('#skip-photo');
		if (skip) skip.disabled = lastPhoto();
	}

	function update_Controls() {
		category.disabled = !selection;
		confirm.disabled = !selection || !category.value;
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

	function open_NextPhoto() {
		if (lastPhoto()) return;
		close_StageMenu();
		const previous = photo.scene;
		photoIndex++;
		photo = create_Photo(layoutIds[photoIndex], kinds, withDecoys);
		view.scene = photo.scene;
		view.camera = photo.camera;
		dispose_Scene(previous);
		found = new Set();
		for (const label of overlay.querySelectorAll('.photo-box.accepted')) label.remove();
		hint.hidden = true;
		nextPrompt.hidden = true;
		clear_Draft();
		update_Counters();
		watch_Texture();
		overlay.focus({ preventScroll: true });
		set_Status(copy.photoOpened, '', true);
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
			feedback.textContent = '';
			update_Controls();
			classification.showModal();
			return;
		}
		update_Controls();
	}

	const clamp = value => Math.max(0, Math.min(1, value));
	function pointer_Point(event) {
		const rect = overlay.getBoundingClientRect();
		return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
	}

	overlay.addEventListener('pointerdown', event => {
		if (event.button !== 0 || active || photoDone()) return;
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
		if (photoDone()) return;
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
	classification.addEventListener('close', () => {
		if (classification.returnValue !== 'accepted') {
			clear_Draft();
			set_Status(copy.trace);
		}
		classification.returnValue = '';
	}, { signal });
	bind_Click('#photo-help', () => {
		close_StageMenu();
		if (!hint.hidden || photoDone()) return;
		const target = photo.targets.find(item => !found.has(item));
		hints++;
		hint.hidden = false;
		place_Box(hint, { x: target.x + target.w / 2 - .052, y: target.y + target.h / 2 - .083, w: .104, h: .166 });
		set_Status(copy.hintShown);
	}, signal);
	bind_Click('#next-photo-button', open_NextPhoto, signal);
	if (multiple) bind_Click('#skip-photo', open_NextPhoto, signal);
	bind_Click('#confirm', () => {
		const best = best_Match(selection, photo.targets);
		const decoy = best_Match(selection, photo.decoys);
		// Рамка точнее легла на обманку, чем на мусор: подсказываем, что это за предмет.
		if (decoy.item && decoy.quality >= .2 && decoy.quality > best.quality) {
			errors++;
			vibrate_Device([20, 40, 20]);
			feedback.textContent = `${copy.decoy} ${copy.decoys[decoy.item.kind]}. ${copy.decoyTail}`;
			return;
		}
		if (best.quality < .20 || found.has(best.item) || best.item.kind !== category.value) {
			errors++;
			vibrate_Device([20, 40, 20]);
			feedback.textContent = best.quality < .20 ? copy.miss : found.has(best.item) ? copy.duplicate : copy.wrong;
			return;
		}
		found.add(best.item);
		foundTotal++;
		accuracy += best.quality;
		vibrate_Device(15);
		const label = document.createElement('div');
		label.className = 'photo-box accepted';
		label.setAttribute('aria-label', copy.kinds[category.value].title);
		place_Box(label, best.item);
		overlay.prepend(label);
		hint.hidden = true;
		clear_Draft();
		classification.close('accepted');
		overlay.focus({ preventScroll: true });
		update_Counters();
		if (!photoDone()) set_Status(copy.found, 'success');
		else if (!lastPhoto()) {
			set_Status(copy.photoDone, 'success');
			nextPrompt.hidden = false;
			query('#next-photo-button').focus({ preventScroll: true });
		} else {
			set_Status(copy.allFound, 'success');
			show_CompletePrompt(copy.completeNotice);
		}
	}, signal);
	update_Counters();
	view.score = () => Math.max(0, Math.round((88 * foundTotal + 12 * accuracy) / totalTargets) - errors * 5 - hints * 3);
	view.summary = () => `${copy.summary} ${foundTotal} / ${totalTargets} · ${copy.summaryErrors} ${errors}`;
	view.focus = () => overlay.focus({ preventScroll: true });
	return view;
}
