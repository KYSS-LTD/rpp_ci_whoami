import '../../../sdk/web/portal-bridge.js';
import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import { create_Sound } from './audio.js';
import { start_Assembly } from './assembly.js';
import { create_Coast } from './coast.js';
import { difficultySettings, normalize_Difficulty, retryPenalty } from './difficulty.js';
import { start_Flight } from './flight.js';
import { freeOptions, mount_FreeMenu } from './free-menu.js';
import { dispose_Scene } from './models.js';
import { debugEnabled, debug_Message } from './progress.js';
import { bind_Report, read_Record, report_Markup, track_Practice } from './report.js';
import { create_Renderer, resize_Frame } from './scenes.js';
import { start_Survey } from './survey.js';
import { text } from './text.js';
import { bind_Click, bind_Stage, glyphs, query, toggle_StageMenu } from './ui.js';

const app = query('#app');
const bridge = window.PortalBridge;
let difficulty;
const freeMode = new URLSearchParams(location.search).get('mode') === 'free';
let checkpoints = {};
let activeSlot = 'run';
let lastCheckpoint = '';
let measurePractice = null;
let nextCheckpoint = 0;
let storyCamera = 'fpv';
const run = { scores: [], attempts: 0, records: [null, null, null] };
const modes = [start_Assembly, start_Flight, start_Survey];

function free_Slot(index, level) {
	return index === 1
		? `flight-${freeOptions.map}-${freeOptions.drone}-${freeOptions.mode}`
		: `${text.stages[index].id}-${level}`;
}

function save_Checkpoint() {
	if (page.kind === 'stage' ? !mode?.checkpoint : freeMode || !['debrief', 'result'].includes(page.kind)) return;
	measurePractice?.();
	const data = { version: 1, page, run, storyCamera, state: mode?.checkpoint?.(),
		tutorial: Boolean(query('#stage-tutorial')?.open) };
	const serialized = JSON.stringify(data);
	if (lastCheckpoint === serialized) return;
	lastCheckpoint = serialized;
	checkpoints[activeSlot] = JSON.parse(serialized);
	bridge.saveCheckpoint(activeSlot, checkpoints[activeSlot]);
}

function clear_Checkpoint() {
	delete checkpoints[activeSlot];
	lastCheckpoint = '';
	bridge.saveCheckpoint(activeSlot, null);
}

function restore_Checkpoint() {
	const saved = checkpoints[activeSlot];
	if (saved?.version !== 1 || !saved.run || !saved.page || !Array.isArray(saved.run.records) || !Array.isArray(saved.run.scores)) return false;
	const { kind, index, score, summary } = saved.page;
	if (kind === 'stage' || kind === 'debrief') {
		if (!Number.isInteger(index) || index < 0 || index >= modes.length) return false;
	} else if (kind !== 'result') return false;
	run.attempts = Number.isSafeInteger(saved.run.attempts) && saved.run.attempts >= 0 ? saved.run.attempts : 0;
	run.records = modes.map((_, index) => read_Record(saved.run.records[index], index));
	run.scores = saved.run.scores.slice(0, 3).map(score => Number.isInteger(score) && score >= 0 && score <= 100 ? score : 0);
	storyCamera = saved.storyCamera === 'chase' ? 'chase' : 'fpv';
	if (kind === 'stage') show_Stage(index, saved.tutorial, '', saved.state);
	else if (kind === 'debrief') show_Debrief(index, Number.isInteger(score) ? score : 0, typeof summary === 'string' ? summary : '');
	else show_Result();
	return true;
}
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true');
let renderer;
let coast;
let mode;
let controller;
let page = { kind: 'loading' };
let lastFrame = null;
let frame = 0;
let dirty = true;
let graphicsLost = false;
let sceneVisible = true;
document.title = `${text.game} · ${text.brand}`;

app.innerHTML = `<main id="screen"><p class="boot-status" role="status">${text.loading}</p></main>`;
const screen = query('#screen');
const observation = new ResizeObserver(() => request_Frame());
const viewportObservation = new IntersectionObserver(([entry]) => {
	if (entry.target !== canvas.parentElement) return;
	sceneVisible = entry.isIntersecting;
	lastFrame = null;
	if (sceneVisible) request_Frame();
});

function render_Loop(time) {
	frame = 0;
	if (document.hidden || !sceneVisible || !mode || graphicsLost) return;
	const elapsed = lastFrame === null ? 0 : (time - lastFrame) / 1000;
	const delta = Math.min(.07, elapsed);
	lastFrame = time;
	const activeMode = mode;
	const animate = mode.update;
	if (animate || dirty) {
		dirty = false;
		resize_Frame(renderer, mode);
		mode.update?.(delta, time / 1000, elapsed);
		if (activeMode !== mode) return;
		if (mode.render) mode.render(time / 1000);
		else renderer.render(mode.scene, mode.camera);
	}
	if (time >= nextCheckpoint) {
		nextCheckpoint = time + 750;
		save_Checkpoint();
	}
	if (animate) schedule_Frame();
}

function schedule_Frame() {
	if (!frame && mode && sceneVisible && !document.hidden && !graphicsLost) frame = requestAnimationFrame(render_Loop);
}

// Режимы вызывают эту функцию, когда статичная сцена изменилась и её нужно перерисовать.
function request_Frame() {
	dirty = true;
	schedule_Frame();
}

function stop_Mode() {
	controller?.abort();
	measurePractice = null;
	observation.disconnect();
	viewportObservation.disconnect();
	if (mode && mode.scene !== coast?.scene) dispose_Scene(mode.scene);
	mode = null;
	canvas.remove();
	cancelAnimationFrame(frame);
	frame = 0;
	lastFrame = null;
}

function mount(markup) {
	screen.innerHTML = markup;
	const canvasSlot = query('#canvas-slot');
	if (canvasSlot) {
		sceneVisible = true;
		canvasSlot.append(canvas);
		observation.observe(canvasSlot);
		viewportObservation.observe(canvasSlot);
	}
}

function open_Screen(nextPage) {
	stop_Mode();
	if (coast && (nextPage.kind !== 'stage' || nextPage.index !== 1 || (freeMode && freeOptions.map !== 'beach'))) {
		dispose_Scene(coast.scene);
		coast = null;
	}
	page = nextPage;
	app.classList.toggle('playing', page.kind === 'stage');
	controller = new AbortController();
	dirty = true;
	window.scrollTo(0, 0);
	return controller.signal;
}

function focus_Heading() {
	query('h1')?.focus({ preventScroll: true });
}

function show_Stage(index, showTutorial = true, resetMessage = '', restoredState) {
	const signal = open_Screen({ kind: 'stage', index });
	const sound = create_Sound(signal);
	const restart = message => show_Stage(index, false, typeof message === 'string' ? message : '');
	const record = run.records[index] ??= read_Record({}, index);
	if (index === 1 && (!freeMode || freeOptions.map === 'beach')) coast ??= create_Coast();
	const logAction = key => {
		record.events[key]++;
	};
	mode = modes[index]({ mount, coast, renderer, signal, difficulty, settings: difficultySettings[difficulty], sound, logAction, restart, restarting: !showTutorial, invalidate: request_Frame,
		freeMode, restoredState, practice: freeMode && index === 1 ? { ...freeOptions } : null, resetMessage, storyCamera,
		onCameraChange(camera) {
			if (freeMode) freeOptions.camera = camera;
			else storyCamera = camera;
		},
		attempts: run.attempts, onLaunch() {
			run.attempts++;
			if (run.attempts > 1 && run.scores.length >= 2) run.scores[1] = Math.max(0, run.scores[1] - retryPenalty);
			return run.attempts;
		},
	});
	const mute = query('#mute');
	mute.setAttribute('aria-pressed', String(sound.muted));
	bind_Click('#mute', () => mute.setAttribute('aria-pressed', String(sound.toggle())), signal);
	if (freeMode) {
		query('#stage-exit').setAttribute('aria-label', text.free.back);
		query('#stage-exit').title = text.free.back;
	}
	function submit() {
		const score = mode.score();
		const summary = mode.summary?.();
		if (freeMode) {
			measurePractice?.();
			const duration = mode.duration?.() ?? record.elapsed / 1000;
			const completed = mode.completed?.() ?? !query('#complete-prompt').hidden;
			clear_Checkpoint();
			show_PracticeResult(index, score, summary, completed, Math.round(duration));
		} else save_Stage(index, score, summary);
	}
	function exit() {
		if (!freeMode) exit_Level();
		else if (mode.completed?.()) submit();
		else {
			save_Checkpoint();
			show_FreeMenu();
		}
	}
	bind_Stage({ signal, restart: mode.restart ?? restart, showTutorial, exit, submit, focusScene: mode.focus });
	if (restoredState && index === 1 && !query('.mission-view dialog[open]')) toggle_StageMenu();
	measurePractice = track_Practice(record, signal, Boolean(restoredState) && !showTutorial);
	save_Checkpoint();
	schedule_Frame();
}

function show_FreeMenu(selection = null) {
	const signal = open_Screen({ kind: 'free', selection });
	mode = mount_FreeMenu({ mount, signal, screen: selection, select: show_FreeMenu, exit: exit_Level,
		hasSave: (index, level) => Boolean(checkpoints[free_Slot(index, level)]),
		start(index, level) {
			difficulty = level;
			run.attempts = 0;
			run.records.fill(null);
			activeSlot = free_Slot(index, level);
			lastCheckpoint = '';
			if (!restore_Checkpoint()) show_Stage(index);
		},
	});
	schedule_Frame();
}

function show_PracticeResult(index, score, summary, completed, durationSec) {
	const signal = open_Screen({ kind: 'practice-result', index, score, summary, completed, durationSec });
	const activity = index === 1 ? freeOptions.map : text.stages[index].id;
	const title = index === 1 ? text.free.maps[activity].title : text.stages[index].title;
	mount(`<section class="result-card"><div class="result-icon" aria-hidden="true">${glyphs[text.stages[index].id]}</div>
		<p class="micro">${completed ? text.complete : text.free.partial}</p><h1 tabindex="-1">${title}</h1>
		<div class="score-big">${score}<span> / 100</span></div>${summary ? '<p class="result-summary"></p>' : ''}
		<div class="result-actions">
			<button type="button" class="button button-quiet" id="practice-back"><span aria-hidden="true">‹</span> ${text.free.back}</button>
		</div></section>`);
	if (summary) query('.result-summary').textContent = summary;
	bind_Click('#practice-back', () => show_FreeMenu(), signal);
	if (completed && bridge.isEmbedded) {
		window.parent.postMessage({ source: 'portal-game', version: bridge.protocolVersion, type: 'practice-result', activity,
			difficulty: index === 1 ? null : difficulty === 'normal' ? 'medium' : difficulty, score, completed, durationSec }, '*');
	}
	focus_Heading();
}

function save_Stage(index, score, summary) {
	run.scores[index] = score;
	show_Debrief(index, score, summary);
}

function show_Debrief(index, score, summary = '') {
	const signal = open_Screen({ kind: 'debrief', index, score, summary });
	const current = text.stages[index];
	mount(`<section class="result-card">
		<div class="result-icon" aria-hidden="true">${glyphs[current.id]}</div>
		<p class="micro">${text.complete} · ${text.difficulty[difficulty].title}</p><h1 tabindex="-1">${current.title}</h1>
		<div class="score-big">${score}<span> / 100</span></div>${summary ? '<p class="result-summary"></p>' : ''}<p class="result-lesson">${current.lesson}</p>
		<div class="result-actions">
			<button type="button" class="button button-primary" id="next">${index === 2 ? text.finish : text.next}</button>
			<button type="button" class="button button-quiet" id="again">${text.repeat}</button>
			<button type="button" class="button button-quiet" id="save-exit">${text.saveExit}</button>
		</div>
	</section>`);
	if (summary) query('.result-summary').textContent = summary;
	save_Checkpoint();
	bind_Click('#next', () => index === 2 ? show_Result() : show_Stage(index + 1), signal);
	bind_Click('#again', () => show_Stage(index), signal);
	bind_Click('#save-exit', exit_Level, signal);
	focus_Heading();
}

function show_Result() {
	const signal = open_Screen({ kind: 'result' });
	const score = run.scores.reduce((sum, entry) => sum + entry, 0);
	mount(`<section class="result-card"><div class="result-icon" aria-hidden="true">✦</div>
		<p class="micro">${text.resultLabel} · ${text.difficulty[difficulty].title}</p><h1 tabindex="-1">${text.allComplete}</h1>
		<div class="score-big">${score}<span> / 300</span></div><p class="result-lesson">${text.resultIntro}</p>
		<p>${text.flight.attempts} · ${run.attempts}</p><ul class="score-list">${text.stages.map((stage, index) => `<li><span>${stage.skill}</span><strong>${run.scores[index]} / 100</strong></li>`).join('')}</ul>
		${report_Markup(run)}
		<div class="result-actions">
			<button type="button" class="button button-primary" id="menu">${text.menu}</button>
			<button type="button" class="button button-quiet" id="save-exit">${text.saveExit}</button>
		</div>
	</section>`);
	bind_Report(run, signal);
	save_Checkpoint();
	bind_Click('#save-exit', exit_Level, signal);
	bind_Click('#menu', () => {
		bridge.finish({ score, maxScore: 300, completed: true });
		if (!bridge.isEmbedded) location.reload();
	}, signal);
	focus_Heading();
}

function exit_Level() {
	if (bridge.isEmbedded) bridge.exit();
	else location.reload();
}

bridge.onSaveCheckpoint(save_Checkpoint);
let checkpointQueued = false;
function schedule_Checkpoint() {
	if (checkpointQueued) return;
	checkpointQueued = true;
	setTimeout(() => {
		checkpointQueued = false;
		save_Checkpoint();
	}, 0);
}
for (const type of ['click', 'change', 'keydown', 'pointerup', 'close']) {
	document.addEventListener(type, schedule_Checkpoint, true);
}
document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		cancelAnimationFrame(frame);
		frame = 0;
		lastFrame = null;
	} else request_Frame();
});

function resume_Screen() {
	if (page.kind === 'stage') restore_Checkpoint();
	else if (page.kind === 'debrief') show_Debrief(page.index, page.score, page.summary);
	else if (page.kind === 'result') show_Result();
	else if (page.kind === 'free') show_FreeMenu(page.selection);
	else if (page.kind === 'practice-result') show_PracticeResult(page.index, page.score, page.summary, page.completed, page.durationSec);
}

try {
	renderer = create_Renderer(canvas);
	canvas.addEventListener('webglcontextlost', event => {
		event.preventDefault();
		graphicsLost = true;
		save_Checkpoint();
		stop_Mode();
		app.classList.remove('playing');
		screen.innerHTML = `<section class="result-card"><p role="alert">${text.graphicsLost}</p><button class="button button-primary" id="restore">${text.restore}</button></section>`;
		bind_Click('#restore', () => bridge.isEmbedded ? bridge.reportError(text.graphicsLost) : location.reload());
	});
	canvas.addEventListener('webglcontextrestored', () => {
		graphicsLost = false;
		if (coast) coast.sun.shadow.needsUpdate = true;
		resume_Screen();
	});
	bridge.onStart(({ levelId, checkpoints: saved }) => {
		try {
			checkpoints = saved ?? {};
			if (freeMode) return show_FreeMenu();
			difficulty = normalize_Difficulty(levelId);
			if (!difficulty) return bridge.reportError(text.unavailable);
			if (!restore_Checkpoint()) show_Stage(0);
		} catch (error) {
			stop_Mode();
			screen.innerHTML = `<p class="boot-status" role="alert">${text.unavailable}</p>`;
			bridge.reportError(text.unavailable);
			debug_Message('Ошибка запуска уровня', error);
		}
	});
	// В режиме отладки состояние игры доступно из консоли: window.aerolab.mode, window.aerolab.coast.
	if (debugEnabled) window.aerolab = { get mode() { return mode; }, get coast() { return coast; }, renderer, run, show_Stage };
} catch (error) {
	screen.innerHTML = `<p class="boot-status" role="alert">${text.unavailable}</p>`;
	bridge.reportError(text.unavailable);
	debug_Message('Ошибка инициализации WebGL', error);
}
