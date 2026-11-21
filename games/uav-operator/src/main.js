import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import { create_Sound } from './audio.js';
import { start_Assembly } from './assembly.js';
import { create_Coast } from './coast.js';
import { difficultyIds, difficultySettings, read_UrlDifficulty, retryPenalty } from './difficulty.js';
import { start_Flight } from './flight.js';
import { dispose_Scene } from './models.js';
import { debugEnabled, debug_Message, publish_Result, read_Progress, save_Progress } from './progress.js';
import { bind_Report, read_Record, report_Markup, track_Practice } from './report.js';
import { create_Home, create_Renderer, resize_Frame } from './scenes.js';
import { start_Survey } from './survey.js';
import { text } from './text.js';
import { bind_Click, bind_Stage, glyphs, query } from './ui.js';

const app = query('#app');
const progress = read_Progress();
const urlDifficulty = read_UrlDifficulty();
if (urlDifficulty) {
	progress.difficulty = urlDifficulty;
	progress.chosen = true;
}
const modes = [start_Assembly, start_Flight, start_Survey];
const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
let coast;
let mode;
let controller;
let page = { kind: 'home' };
let lastFrame = null;
let frame = 0;
let dirty = true;
let graphicsLost = false;
let sceneVisible = true;
document.title = `${text.game} · ${text.brand}`;

app.innerHTML = `<header class="site-header"><div class="topbar">
	<button class="brand" id="home" type="button"><span class="brand-icon" aria-hidden="true"><i></i></span>
	<span><b>${text.brand}</b><small>${text.brandNote}</small></span></button>
	<div class="header-right"><span class="header-score" id="best" hidden></span><button type="button" id="back" class="button button-quiet" hidden>${text.toHub}</button></div>
</div></header><main id="screen"><p class="boot-status" role="status">${text.loading}</p></main>`;

const screen = query('#screen');
const best = query('#best');
const back = query('#back');
const observation = new ResizeObserver(() => request_Frame());
const viewportObservation = new IntersectionObserver(([entry]) => {
	if (entry.target !== canvas.parentElement) return;
	sceneVisible = entry.isIntersecting;
	lastFrame = null;
	if (sceneVisible) request_Frame();
});

function current_Run() {
	return progress.runs[progress.difficulty];
}

function render_Loop(time) {
	frame = 0;
	if (document.hidden || !sceneVisible || !mode || graphicsLost) return;
	const delta = lastFrame === null ? 0 : Math.min(.07, (time - lastFrame) / 1000);
	lastFrame = time;
	const activeMode = mode;
	const animate = mode.update && !(page.kind === 'home' && reducedMotion.matches);
	if (animate || dirty) {
		dirty = false;
		resize_Frame(renderer, mode);
		mode.update?.(delta, time / 1000);
		if (activeMode !== mode) return;
		if (mode.render) mode.render(time / 1000);
		else renderer.render(mode.scene, mode.camera);
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
	page = nextPage;
	app.classList.toggle('playing', page.kind === 'stage');
	controller = new AbortController();
	back.hidden = page.kind === 'home';
	update_Best();
	dirty = true;
	window.scrollTo(0, 0);
	return controller.signal;
}

function update_Best() {
	const run = current_Run();
	best.hidden = !run.best || page.kind !== 'home';
	best.textContent = `${text.best} · ${text.difficulty[progress.difficulty].title} · ${run.best}`;
}

function focus_Heading() {
	query('h1')?.focus({ preventScroll: true });
}

function difficulty_Markup() {
	return `<fieldset class="difficulty-picker"><legend class="micro">${text.difficultyLabel}</legend>
		<div class="difficulty-options">${difficultyIds.map(id => `<label class="difficulty-option difficulty-${id}">
			<input type="radio" name="difficulty" value="${id}" ${progress.chosen && id === progress.difficulty ? 'checked' : ''}>
			<span><b>${text.difficulty[id].title}</b><small>${text.difficulty[id].short}</small></span>
		</label>`).join('')}</div>
		<p class="difficulty-note" id="difficulty-note" ${progress.chosen ? '' : 'hidden'} aria-live="polite">${text.difficulty[progress.difficulty].detail}</p>
	</fieldset>`;
}

function missions_Markup() {
	const scores = current_Run().scores;
	const next = Math.min(scores.length, 2);
	return text.stages.map((stage, index) => {
		const score = scores[index];
		return `<button type="button" class="mission-card card-${stage.id}" id="mission-${stage.id}" ${!progress.chosen || index > next ? 'disabled' : ''}>
			<span class="card-top"><span class="mission-icon" aria-hidden="true">${glyphs[stage.id]}</span><span class="micro">${score === undefined ? `0${index + 1} / ${stage.location}` : `${text.done} · ${score}/100`}</span></span>
			<strong>${stage.title}</strong><span class="card-summary">${stage.summary}</span>
			${progress.chosen ? `<span class="card-level">${text.difficulty[progress.difficulty].stages[stage.id]}</span>` : ''}
		</button>`;
	}).join('');
}

function start_Label() {
	const count = current_Run().scores.length;
	return count === 3 ? text.finish : count ? text.continue : text.start;
}

function show_Home(focus = true) {
	const signal = open_Screen({ kind: 'home' });
	mount(`<div class="home-content">
		<section class="hero">
			<div class="canvas-slot" id="canvas-slot"></div><div class="hero-shade"></div>
			<div class="hero-content">
				<p class="hero-tag"><span></span>${text.tag}</p>
				<h1 tabindex="-1">${text.headline[0]}<br><em>${text.headline[1]}</em></h1>
				<p class="hero-intro">${text.intro}</p>
				${difficulty_Markup()}
				<button class="button button-primary hero-action" id="start" ${progress.chosen ? '' : 'disabled'} type="button"><i aria-hidden="true">▶</i><span id="start-label">${start_Label()}</span></button>
			</div>
			<div class="hero-coordinate"><span>${text.regionCode}</span><strong>${text.region}</strong></div>
		</section>
		<section class="program"><div class="program-heading"><h2>${text.program}</h2><span class="micro" id="program-level">${text.totalMissions}${progress.chosen ? ` · ${text.difficulty[progress.difficulty].title}` : ''}</span></div>
			<div class="mission-cards" id="mission-cards" aria-label="${text.missionList}">${missions_Markup()}</div>
		</section>
		<footer class="home-footer"><span>${text.fieldNote}</span><span>${text.brand} / ${text.regionCode}</span></footer>
	</div>`);
	mode = create_Home(coast);
	const bind_Missions = () => text.stages.forEach((stage, index) => bind_Click(`#mission-${stage.id}`, () => show_Stage(index), signal));
	bind_Click('#start', () => {
		const run = current_Run();
		if (run.scores.length === 3) show_Result();
		else show_Stage(Math.min(run.scores.length, 2));
	}, signal);
	query('.difficulty-options').addEventListener('change', event => {
		if (!difficultyIds.includes(event.target.value)) return;
		progress.difficulty = event.target.value;
		progress.chosen = true;
		query('#start').disabled = false;
		query('#difficulty-note').hidden = false;
		save_Progress(progress);
		query('#difficulty-note').textContent = text.difficulty[progress.difficulty].detail;
		query('#program-level').textContent = `${text.totalMissions} · ${text.difficulty[progress.difficulty].title}`;
		query('#start-label').textContent = start_Label();
		query('#mission-cards').innerHTML = missions_Markup();
		bind_Missions();
		update_Best();
	}, { signal });
	bind_Missions();
	if (focus) focus_Heading();
	schedule_Frame();
}

function show_Stage(index, showTutorial = true) {
	const signal = open_Screen({ kind: 'stage', index });
	const difficulty = progress.difficulty;
	const sound = create_Sound(signal);
	const run = current_Run();
	const restart = () => show_Stage(index, false);
	const record = run.records[index] ??= read_Record({}, index);
	const logAction = key => {
		record.events[key]++;
		save_Progress(progress);
	};
	mode = modes[index]({ mount, coast, renderer, signal, difficulty, settings: difficultySettings[difficulty], sound, logAction, restart, restarting: !showTutorial, invalidate: request_Frame,
		attempts: run.attempts, onLaunch() {
			run.attempts++;
			if (run.attempts > 1 && run.scores.length >= 2) run.scores[1] = Math.max(0, run.scores[1] - retryPenalty);
			save_Progress(progress);
			return run.attempts;
		},
	});
	const mute = query('#mute');
	mute.setAttribute('aria-pressed', String(sound.muted));
	bind_Click('#mute', () => mute.setAttribute('aria-pressed', String(sound.toggle())), signal);
	bind_Stage({ signal, restart, showTutorial, exit: open_Home, focusScene: mode.focus,
		submit: () => save_Stage(index, mode.score(), mode.summary?.()),
	});
	track_Practice(record, signal, () => save_Progress(progress));
	schedule_Frame();
}

function save_Stage(index, score, summary) {
	const run = current_Run();
	run.scores[index] = score;
	if (run.scores.length === 3) {
		const total = run.scores.reduce((sum, entry) => sum + entry, 0);
		run.best = Math.max(run.best, total);
		if (index === 2) publish_Result(run.scores, total, progress.difficulty, run.attempts);
	}
	save_Progress(progress);
	show_Debrief(index, score, summary);
}

function show_Debrief(index, score, summary = '') {
	const signal = open_Screen({ kind: 'debrief', index, score, summary });
	const current = text.stages[index];
	mount(`<section class="result-card">
		<div class="result-icon" aria-hidden="true">${glyphs[current.id]}</div>
		<p class="micro">${text.complete} · ${text.difficulty[progress.difficulty].title}</p><h1 tabindex="-1">${current.title}</h1>
		<div class="score-big">${score}<span> / 100</span></div>${summary ? `<p class="result-summary">${summary}</p>` : ''}<p class="result-lesson">${current.lesson}</p>
		<div class="result-actions">
			<button type="button" class="button button-primary" id="next">${index === 2 ? text.finish : text.next}</button>
			<button type="button" class="button button-quiet" id="again">${text.repeat}</button>
		</div>
	</section>`);
	bind_Click('#next', () => index === 2 ? show_Result() : show_Stage(index + 1), signal);
	bind_Click('#again', () => show_Stage(index), signal);
	focus_Heading();
}

function show_Result() {
	const signal = open_Screen({ kind: 'result' });
	const run = current_Run();
	const score = run.scores.reduce((sum, entry) => sum + entry, 0);
	mount(`<section class="result-card"><div class="result-icon" aria-hidden="true">✦</div>
		<p class="micro">${text.resultLabel} · ${text.difficulty[progress.difficulty].title}</p><h1 tabindex="-1">${text.allComplete}</h1>
		<div class="score-big">${score}<span> / 300</span></div><p class="result-lesson">${text.resultIntro}</p>
		<p>${text.flight.attempts} · ${run.attempts}</p><ul class="score-list">${text.stages.map((stage, index) => `<li><span>${stage.skill}</span><strong>${run.scores[index]} / 100</strong></li>`).join('')}</ul>
		${report_Markup(run)}
		<div class="result-actions"><button type="button" class="button button-primary" id="menu">${text.menu}</button><button type="button" class="button button-quiet" id="again">${text.repeat}</button></div>
	</section>`);
	bind_Report(run, signal, () => save_Progress(progress));
	bind_Click('#menu', () => show_Home(), signal);
	bind_Click('#again', () => {
		run.scores = [];
		run.attempts = 0;
		run.records = [null, null, null];
		save_Progress(progress);
		show_Home();
	}, signal);
	focus_Heading();
}

function open_Home() {
	if (renderer && !graphicsLost) show_Home();
}

bind_Click('#home', open_Home);
bind_Click('#back', open_Home);
document.addEventListener('visibilitychange', () => {
	if (document.hidden) {
		cancelAnimationFrame(frame);
		frame = 0;
		lastFrame = null;
	} else request_Frame();
});
reducedMotion.addEventListener('change', request_Frame);

function resume_Screen() {
	if (page.kind === 'stage') show_Stage(page.index);
	else if (page.kind === 'debrief') show_Debrief(page.index, page.score, page.summary);
	else if (page.kind === 'result') show_Result();
	else show_Home(false);
}

try {
	renderer = create_Renderer(canvas);
	coast = create_Coast();
	canvas.addEventListener('webglcontextlost', event => {
		event.preventDefault();
		graphicsLost = true;
		stop_Mode();
		app.classList.remove('playing');
		screen.innerHTML = `<section class="result-card"><p role="alert">${text.graphicsLost}</p><button class="button button-primary" id="restore">${text.restore}</button></section>`;
		bind_Click('#restore', () => location.reload());
	});
	canvas.addEventListener('webglcontextrestored', () => {
		graphicsLost = false;
		coast.sun.shadow.needsUpdate = true;
		resume_Screen();
	});
	show_Home(false);
	// В режиме отладки состояние игры доступно из консоли: window.aerolab.mode, window.aerolab.coast.
	if (debugEnabled) window.aerolab = { get mode() { return mode; }, coast, renderer, progress, show_Stage };
} catch (error) {
	screen.innerHTML = `<p class="boot-status" role="alert">${text.unavailable}</p>`;
	debug_Message('Ошибка инициализации WebGL', error);
}
