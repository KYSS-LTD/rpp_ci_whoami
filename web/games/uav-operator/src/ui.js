import { text } from './text.js';

export const glyphs = { assembly: '◈', flight: '✣', survey: '⌗' };
export const coarsePointer = matchMedia('(any-pointer: coarse)');
let statusTimer;
let portraitDismissed = false;

export function query(selector) {
	return document.querySelector(selector);
}

export function set_Status(message, state = '', repeat = false) {
	const status = query('#stage-status');
	const content = query('#stage-status-text');
	if (!repeat && content.textContent === message && status.dataset.state === state) return;
	content.textContent = message;
	const prefix = query('#stage-status-prefix');
	if (prefix) prefix.textContent = state === 'warn' ? text.flight.osdWarning : state === 'success' ? text.flight.osdSuccess : text.flight.osdNotice;
	status.dataset.state = state;
	status.dataset.visible = Boolean(message);
	clearTimeout(statusTimer);
	statusTimer = setTimeout(() => { status.dataset.visible = false; }, 5600);
}

export function bind_Click(selector, handle, signal) {
	query(selector).addEventListener('click', handle, { signal });
}

// Короткий виброотклик на телефонах. На компьютерах и в браузерах без поддержки ничего не делает.
export function vibrate_Device(pattern) {
	if (coarsePointer.matches && navigator.vibrate) navigator.vibrate(pattern);
}

export function scene_Frame(content = '') {
	return `<div class="scene-frame" id="scene-frame">
		<div class="canvas-slot" id="canvas-slot"></div>${content}
	</div>`;
}

export function close_StageMenu() {
	const menu = query('#stage-menu');
	if (menu.hidePopover) menu.hidePopover();
	else if (!menu.hidden) {
		menu.hidden = true;
		query('#stage-menu-button').setAttribute('aria-expanded', 'false');
	}
}

export function toggle_StageMenu() {
	if (query('#flight-orientation')?.open) return;
	const dialog = query('.mission-view dialog[open]');
	if (dialog) {
		dialog.close();
		return;
	}
	const menu = query('#stage-menu');
	if (menu.matches('[popover]') && menu.matches(':popover-open') || !menu.hasAttribute('popover') && !menu.hidden) {
		close_StageMenu();
		query('#scene-frame')?.focus({ preventScroll: true });
	} else query('#stage-menu-button').click();
}

export function stage_OverlayOpen() {
	const menu = query('#stage-menu');
	return Boolean(query('.mission-view dialog[open]') || (menu.showPopover ? menu.matches(':popover-open') : !menu.hidden));
}

// Плашка выполненного этапа: кнопка сдачи выводится прямо на экран, чтобы не искать её в меню.
export function show_CompletePrompt(message) {
	const prompt = query('#complete-prompt');
	if (!prompt) return;
	const description = query('#complete-message');
	description.textContent = message ?? description.dataset.initial;
	if (!prompt.hidden) return;
	prompt.hidden = false;
	vibrate_Device([30, 60, 30]);
	if (!stage_OverlayOpen()) query('#complete-submit').focus({ preventScroll: true });
}

export function hide_CompletePrompt() {
	const prompt = query('#complete-prompt');
	if (prompt) prompt.hidden = true;
}

// tools - разметка дополнительных кнопок рядом с кнопкой меню (например, переключатель звука).
export function stage_Shell(index, scene, panel, controls = '', tutorial = '', tools = '', override = {}) {
	const mission = text.stages[index];
	const title = override.title ?? mission.title;
	const submit = override.freeMode ? text.free.finish : text.submit;
	const submitQuestion = override.freeMode ? text.free.finishQuestion : text.submitQuestion;
	const submitNotice = override.freeMode ? text.free.finishNotice : text.submitNotice;
	const completeNotice = override.freeMode ? text.free.completeNotice : text.completeNotice;
	const statusPrefix = '<span id="stage-status-prefix" aria-hidden="true"></span>';
	return `<section class="mission-view ${mission.id}-view" aria-label="${title}">
		${scene}${controls}
		<p class="stage-status" id="stage-status" role="status">${statusPrefix}<span id="stage-status-text"></span></p>
		${index === 1 && override.freeMode ? '<p class="complete-prompt flight-complete-notice" id="flight-complete-notice" role="status"></p>' : `<div class="complete-prompt" id="complete-prompt" role="region" aria-labelledby="complete-title" hidden>
			<div><p class="micro" id="complete-title">${text.completeTitle}</p><p id="complete-message" data-initial="${completeNotice}"></p></div>
			<button class="button button-primary" id="complete-submit" type="button">${submit}</button>
		</div>`}
		<div class="stage-tools">${tools}
			<button class="button button-quiet stage-menu-button${index === 1 ? ' osd-button' : ''}" id="stage-menu-button" type="button" popovertarget="stage-menu" aria-label="${text.stageMenu}" title="${text.stageMenu}"><span aria-hidden="true">☰</span></button>
		</div>
		<aside id="stage-menu" class="stage-menu" popover aria-labelledby="stage-menu-title">
			<div class="overlay-heading"><h2 id="stage-menu-title">${title}</h2><button class="button button-quiet close-overlay" type="button" id="close-menu" aria-label="${text.close}">×</button></div>
			<div class="actions-row"><button class="button button-quiet icon-button" id="mute" type="button" title="${text.mute}" aria-label="${text.mute}">♫</button><button class="button button-quiet icon-button" id="tutorial-again" type="button" title="${text.tutorial}" aria-label="${text.tutorial}">?</button><button class="button button-quiet icon-button" id="restart" type="button" title="${text.restart}" aria-label="${text.restart}">↻</button><button class="button button-quiet icon-button" id="stage-exit" type="button" title="${override.exit ?? text.toHub}" aria-label="${override.exit ?? text.toHub}">×</button></div>
			<button class="button button-primary" id="submit-stage" type="button">${submit}</button>
			${panel}
		</aside>
		<dialog class="stage-dialog" id="stage-tutorial" aria-labelledby="tutorial-title">
			<h2 id="tutorial-title" tabindex="-1">${title}</h2>
			<div class="stage-instructions" tabindex="0" role="region" aria-label="${text.tutorial}">
				${override.guide ? '' : `<video class="lesson-video" controls playsinline preload="none" aria-label="${title}"
				poster="${new URL(`./assets/${mission.id}-lesson.jpg`, import.meta.url).href}"
				src="${new URL(`./assets/${mission.id}-lesson.mp4`, import.meta.url).href}"></video>`}
				<p>${override.guide ?? mission.guide}</p>${tutorial}
			</div>
			<div class="dialog-actions"><button type="button" class="button button-primary" id="begin-stage"><span aria-hidden="true">▶</span>${text.beginStage}</button></div>
		</dialog>
		<dialog class="stage-dialog" id="stage-submit" aria-labelledby="submit-title" aria-describedby="submit-notice">
			<h2 id="submit-title">${submitQuestion}</h2><p id="submit-notice">${submitNotice}</p>
			<div class="dialog-actions"><button type="button" class="button button-quiet" id="cancel-submit">${text.keepPlaying}</button><button type="button" class="button button-primary" id="confirm-submit">${submit}</button></div>
		</dialog>
		${index === 1 ? `<dialog class="stage-dialog orientation-dialog" id="flight-orientation" aria-labelledby="orientation-title">
			<h2 id="orientation-title">${text.flight.rotatePhone}</h2><p>${text.flight.rotateDetail}</p>
			<button type="button" class="button button-quiet" id="keep-portrait">${text.flight.keepPortrait}</button>
		</dialog>` : ''}
	</section>`;
}

export function bind_Stage({ signal, restart, exit, submit, focusScene, showTutorial = true }) {
	const menu = query('#stage-menu');
	const menuButton = query('#stage-menu-button');
	const tutorial = query('#stage-tutorial');
	const confirmation = query('#stage-submit');
	if (!menu.showPopover) {
		menu.removeAttribute('popover');
		menu.hidden = true;
		menuButton.setAttribute('aria-expanded', 'false');
		menuButton.addEventListener('click', () => {
			menu.hidden = !menu.hidden;
			menuButton.setAttribute('aria-expanded', String(!menu.hidden));
		}, { signal });
		document.addEventListener('click', event => {
			if (!menu.contains(event.target) && !menuButton.contains(event.target)) close_StageMenu();
		}, { signal });
		document.addEventListener('keydown', event => {
			if (event.key === 'Escape' && !menu.hidden) {
				close_StageMenu();
				menuButton.focus();
			}
		}, { signal });
	}
	bind_Click('#close-menu', () => { close_StageMenu(); menuButton.focus(); }, signal);
	if (!query('.flight-view')) window.addEventListener('keydown', event => {
		if (event.code === 'KeyP' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey
			&& !event.target.closest?.('input, select, textarea, [contenteditable="true"]')) {
			event.preventDefault();
			toggle_StageMenu();
		}
	}, { signal });
	function open_Tutorial() {
		tutorial.showModal();
		query('#tutorial-title').focus();
	}
	bind_Click('#tutorial-again', () => { close_StageMenu(); open_Tutorial(); }, signal);
	bind_Click('#begin-stage', () => tutorial.close(), signal);
	bind_Click('#cancel-submit', () => confirmation.close(), signal);
	bind_Click('#confirm-submit', () => confirmation.close('submit'), signal);
	bind_Click('#submit-stage', () => {
		close_StageMenu();
		confirmation.showModal();
		query('#cancel-submit').focus();
	}, signal);
	// Этап выполнен полностью, поэтому кнопка на плашке сдаёт работу без лишнего подтверждения.
	query('#complete-submit')?.addEventListener('click', submit, { signal });
	bind_Click('#restart', () => { close_StageMenu(); restart(); }, signal);
	bind_Click('#stage-exit', exit, signal);
	confirmation.addEventListener('close', () => {
		const confirmed = confirmation.returnValue === 'submit';
		confirmation.returnValue = '';
		if (confirmed) submit();
		else (focusScene ?? (() => menuButton.focus()))();
	}, { signal });
	tutorial.addEventListener('close', () => {
		tutorial.querySelector('video')?.pause();
		focusScene?.();
	}, { signal });
	if (showTutorial) open_Tutorial();
	else focusScene?.();
	const orientation = query('#flight-orientation');
	if (orientation) {
		const portrait = matchMedia('(pointer: coarse) and (orientation: portrait) and (max-width: 700px)');
		function sync_Orientation() {
			if (portrait.matches && !portraitDismissed && !orientation.open) orientation.showModal();
			else if (!portrait.matches && orientation.open) orientation.close();
		}
		portrait.addEventListener('change', sync_Orientation, { signal });
		orientation.addEventListener('cancel', () => { portraitDismissed = true; }, { signal });
		bind_Click('#keep-portrait', () => { portraitDismissed = true; orientation.close(); }, signal);
		sync_Orientation();
	}
}
