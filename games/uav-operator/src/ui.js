import { text } from './text.js';

export const glyphs = { assembly: '◈', flight: '✣', survey: '⌗' };

export function query(selector) {
	return document.querySelector(selector);
}

export function set_Status(message, state = '') {
	const status = query('#stage-status');
	if (status.textContent !== message) status.textContent = message;
	status.dataset.state = state;
}

export function bind_Click(selector, handle, signal) {
	query(selector).addEventListener('click', handle, { signal });
}

export function scene_Frame(content = '') {
	return `<div class="scene-frame" id="scene-frame">
		<div class="canvas-slot" id="canvas-slot"></div>${content}
	</div>`;
}

export function stage_Shell(index, scene, panel, footer = '', statusUnderScene = false) {
	const mission = text.stages[index];
	const status = '<p class="stage-status" id="stage-status" role="status"></p>';
	return `<div class="mission-view ${mission.id}-view">
		<div class="mission-heading">
			<div><p class="micro">0${index + 1} / ${mission.location}</p><h1 tabindex="-1">${mission.title}</h1></div>
			<button class="button button-quiet" id="restart" type="button">${text.restart}</button>
		</div>
		<div class="mission-layout">
			<div class="scene-column">${scene}${footer}${statusUnderScene ? status : ''}</div>
			<aside class="control-panel">
				<p class="mission-guide">${mission.guide}</p>
				${panel}
				${statusUnderScene ? '' : status}
			</aside>
		</div>
	</div>`;
}
