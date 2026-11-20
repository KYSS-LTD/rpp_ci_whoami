import '@fontsource-variable/manrope';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import { start_Assembly } from './assembly.js';
import { create_Coast } from './coast.js';
import { start_Flight } from './flight.js';
import { dispose_Scene } from './models.js';
import { debug_Message, publish_Result, read_Progress, save_Progress } from './progress.js';
import { create_Home, create_Renderer, resize_Frame } from './scenes.js';
import { start_Survey } from './survey.js';
import { text } from './text.js';
import { bind_Click, glyphs, query } from './ui.js';

const app = query('#app');
const progress = read_Progress();
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
const observation = new ResizeObserver(() => { dirty = true; schedule_Frame(); });
const viewportObservation = new IntersectionObserver(([entry]) => {
	if (entry.target !== canvas.parentElement) return;
	sceneVisible = entry.isIntersecting;
	lastFrame = null;
	if (sceneVisible) {
		dirty = true;
		schedule_Frame();
	}
});

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
		renderer.render(mode.scene, mode.camera);
	}
	if (animate) schedule_Frame();
}

function schedule_Frame() {
	if (!frame && mode && sceneVisible && !document.hidden && !graphicsLost) frame = requestAnimationFrame(render_Loop);
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
	controller = new AbortController();
	back.hidden = page.kind === 'home';
	best.hidden = !progress.best || page.kind !== 'home';
	best.textContent = `${text.best} · ${progress.best}`;
	dirty = true;
	window.scrollTo(0, 0);
	return controller.signal;
}

function focus_Heading() {
	query('h1')?.focus({ preventScroll: true });
}

function show_Home(focus = true) {
	const signal = open_Screen({ kind: 'home' });
	const next = Math.min(progress.scores.length, 2);
	mount(`<div class="home-content">
		<section class="hero">
			<div class="canvas-slot" id="canvas-slot"></div><div class="hero-shade"></div>
			<div class="hero-content">
				<p class="hero-tag"><span></span>${text.tag}</p>
				<h1 tabindex="-1">${text.headline[0]}<br><em>${text.headline[1]}</em></h1>
				<p class="hero-intro">${text.intro}</p>
				<button class="button button-primary hero-action" id="start" type="button"><i aria-hidden="true">▶</i>${progress.scores.length === 3 ? text.finish : progress.scores.length ? text.continue : text.start}</button>
			</div>
			<div class="hero-coordinate"><span>${text.regionCode}</span><strong>${text.region}</strong></div>
		</section>
		<section class="program"><div class="program-heading"><h2>${text.program}</h2><span class="micro">${text.totalMissions}</span></div>
			<div class="mission-cards" aria-label="${text.missionList}">${text.stages.map((stage, index) => {
				const score = progress.scores[index];
				return `<button type="button" class="mission-card card-${stage.id}" id="mission-${stage.id}" ${index > next ? 'disabled' : ''}>
					<span class="card-top"><span class="mission-icon" aria-hidden="true">${glyphs[stage.id]}</span><span class="micro">${score === undefined ? `0${index + 1} / ${stage.location}` : `${text.done} · ${score}/100`}</span></span>
					<strong>${stage.title}</strong><span class="card-summary">${stage.summary}</span>
				</button>`;
			}).join('')}</div>
		</section>
		<footer class="home-footer"><span>${text.fieldNote}</span><span>${text.brand} / ${text.regionCode}</span></footer>
	</div>`);
	mode = create_Home(coast);
	bind_Click('#start', () => progress.scores.length === 3 ? show_Result() : show_Stage(next), signal);
	text.stages.forEach((stage, index) => bind_Click(`#mission-${stage.id}`, () => show_Stage(index), signal));
	if (focus) focus_Heading();
	schedule_Frame();
}

function show_Stage(index) {
	const signal = open_Screen({ kind: 'stage', index });
	mode = modes[index]({ mount, coast, renderer, signal, complete: score => {
		progress.scores[index] = score;
		if (progress.scores.length === 3) {
			const total = progress.scores.reduce((sum, entry) => sum + entry, 0);
			progress.best = Math.max(progress.best, total);
			if (index === 2) publish_Result(progress.scores, total);
		}
		save_Progress(progress);
		show_Debrief(index, score);
	} });
	bind_Click('#restart', () => show_Stage(index), signal);
	focus_Heading();
	schedule_Frame();
}

function show_Debrief(index, score) {
	const signal = open_Screen({ kind: 'debrief', index, score });
	const current = text.stages[index];
	mount(`<section class="result-card">
		<div class="result-icon" aria-hidden="true">${glyphs[current.id]}</div>
		<p class="micro">${text.complete}</p><h1 tabindex="-1">${current.title}</h1>
		<div class="score-big">${score}<span> / 100</span></div><p class="result-lesson">${current.lesson}</p>
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
	const score = progress.scores.reduce((sum, entry) => sum + entry, 0);
	mount(`<section class="result-card"><div class="result-icon" aria-hidden="true">✦</div>
		<p class="micro">${text.resultLabel}</p><h1 tabindex="-1">${text.allComplete}</h1>
		<div class="score-big">${score}<span> / 300</span></div><p class="result-lesson">${text.resultIntro}</p>
		<ul class="score-list">${text.stages.map((stage, index) => `<li><span>${stage.skill}</span><strong>${progress.scores[index]} / 100</strong></li>`).join('')}</ul>
		<div class="result-actions"><button type="button" class="button button-primary" id="menu">${text.menu}</button><button type="button" class="button button-quiet" id="again">${text.repeat}</button></div>
	</section>`);
	bind_Click('#menu', () => show_Home(), signal);
	bind_Click('#again', () => {
		progress.scores = [];
		save_Progress(progress);
		show_Stage(0);
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
	} else {
		dirty = true;
		schedule_Frame();
	}
});
reducedMotion.addEventListener('change', () => { dirty = true; schedule_Frame(); });

function resume_Screen() {
	if (page.kind === 'stage') show_Stage(page.index);
	else if (page.kind === 'debrief') show_Debrief(page.index, page.score);
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
		screen.innerHTML = `<section class="result-card"><p role="alert">${text.graphicsLost}</p><button class="button button-primary" id="restore">${text.restore}</button></section>`;
		bind_Click('#restore', () => location.reload());
	});
	canvas.addEventListener('webglcontextrestored', () => {
		graphicsLost = false;
		resume_Screen();
	});
	show_Home(false);
} catch (error) {
	screen.innerHTML = `<p class="boot-status" role="alert">${text.unavailable}</p>`;
	debug_Message('Ошибка инициализации WebGL', error);
}
