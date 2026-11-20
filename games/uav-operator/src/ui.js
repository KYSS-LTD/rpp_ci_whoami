import { text } from './text.js';

export const glyphs = { assembly: '◈', flight: '✣', survey: '⌗' };
let statusTimer;

export function query(selector) {
	return document.querySelector(selector);
}

export function set_Status(message, state = '', repeat = false) {
	const status = query('#stage-status');
	if (!repeat && status.textContent === message && status.dataset.state === state) return;
	status.textContent = message;
	status.dataset.state = state;
	status.dataset.visible = Boolean(message);
	clearTimeout(statusTimer);
	statusTimer = setTimeout(() => { status.dataset.visible = false; }, 5600);
}

export function bind_Click(selector, handle, signal) {
	query(selector).addEventListener('click', handle, { signal });
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

export function stage_OverlayOpen() {
	const menu = query('#stage-menu');
	return Boolean(query('.mission-view dialog[open]') || (menu.showPopover ? menu.matches(':popover-open') : !menu.hidden));
}

export function stage_Shell(index, scene, panel, controls = '', tutorial = '') {
	const mission = text.stages[index];
	return `<section class="mission-view ${mission.id}-view" aria-label="${mission.title}">
		${scene}${controls}
		<p class="stage-status" id="stage-status" role="status"></p>
		<button class="button button-quiet stage-menu-button" id="stage-menu-button" type="button" popovertarget="stage-menu" aria-label="${text.stageMenu}"><span aria-hidden="true">☰</span></button>
		<aside id="stage-menu" class="stage-menu" popover aria-labelledby="stage-menu-title">
			<div class="overlay-heading"><h2 id="stage-menu-title">${mission.title}</h2><button class="button button-quiet close-overlay" type="button" id="close-menu" aria-label="${text.close}">×</button></div>
			<button class="button button-primary" id="submit-stage" type="button">${text.submit}</button>
			${panel}
			<div class="actions-row"><button class="button button-quiet" id="tutorial-again" type="button">${text.tutorial}</button><button class="button button-quiet" id="restart" type="button">${text.restart}</button><button class="button button-quiet" id="stage-exit" type="button">${text.toHub}</button></div>
		</aside>
		<dialog class="stage-dialog" id="stage-tutorial" aria-labelledby="tutorial-title">
			<h2 id="tutorial-title">${mission.title}</h2><p>${mission.guide}</p>${tutorial}
			<form method="dialog" class="dialog-actions"><button class="button button-primary" autofocus>${text.beginStage}</button></form>
		</dialog>
		<dialog class="stage-dialog" id="stage-submit" aria-labelledby="submit-title" aria-describedby="submit-notice">
			<h2 id="submit-title">${text.submitQuestion}</h2><p id="submit-notice">${text.submitNotice}</p>
			<form method="dialog" class="dialog-actions"><button class="button button-quiet" value="cancel" autofocus>${text.keepPlaying}</button><button class="button button-primary" value="submit">${text.submit}</button></form>
		</dialog>
	</section>`;
}

export function bind_Stage({ signal, restart, exit, submit, focusScene }) {
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
	bind_Click('#tutorial-again', () => { close_StageMenu(); tutorial.showModal(); }, signal);
	bind_Click('#submit-stage', () => { close_StageMenu(); confirmation.showModal(); }, signal);
	bind_Click('#restart', restart, signal);
	bind_Click('#stage-exit', exit, signal);
	confirmation.addEventListener('close', () => {
		const confirmed = confirmation.returnValue === 'submit';
		confirmation.returnValue = '';
		if (confirmed) submit();
		else (focusScene ?? (() => menuButton.focus()))();
	}, { signal });
	tutorial.addEventListener('close', () => focusScene?.(), { signal });
	tutorial.showModal();
}
