import { text } from './text.js';

const copy = text.report;
const successes = [['connected', 'secured'], ['captured', 'returned'], ['marked']];
const safeCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function read_Record(value, index) {
	if (!value || typeof value !== 'object') return null;
	const events = {};
	for (const key of Object.keys(copy.events[index])) events[key] = safeCount(value.events?.[key]);
	return { elapsed: safeCount(value.elapsed), starts: safeCount(value.starts), events,
		interest: [0, 1, 2].includes(value.interest) ? value.interest : null };
}

// Часы идут и при разметке в диалоге. Инструктаж, меню, подтверждение сдачи и скрытая вкладка исключены.
export function track_Practice(record, signal) {
	const tutorial = document.querySelector('#stage-tutorial');
	const orientation = document.querySelector('#flight-orientation');
	const menu = document.querySelector('#stage-menu');
	const confirm = document.querySelector('#stage-submit');
	let since = null;
	let started = false;
	function measure() {
		const now = performance.now();
		if (since !== null) record.elapsed += Math.round(now - since);
		const paused = document.hidden || orientation?.open || tutorial.open || confirm.open || (menu.showPopover ? menu.matches(':popover-open') : !menu.hidden);
		since = paused ? null : now;
		if (!paused && !started) {
			started = true;
			record.starts++;
		}
	}
	const observer = new MutationObserver(measure);
	for (const node of [tutorial, menu, confirm, orientation].filter(Boolean)) observer.observe(node, { attributes: true, attributeFilter: ['open', 'hidden'] });
	menu.addEventListener('toggle', measure, { signal });
	document.addEventListener('visibilitychange', measure, { signal });
	window.addEventListener('pagehide', measure, { signal });
	signal.addEventListener('abort', () => {
		measure();
		observer.disconnect();
	}, { once: true });
	measure();
}

function duration_Text(ms) {
	const seconds = Math.round(ms / 1000);
	return `${Math.floor(seconds / 60)} ${copy.minute} ${seconds % 60} ${copy.second}`;
}

function event_List(record, index, title, keys) {
	const rows = keys.filter(key => record.events[key]).map(key => `<li>${copy.events[index][key]} · ${record.events[key]}</li>`);
	return rows.length ? `<h4>${title}</h4><ul>${rows.join('')}</ul>` : '';
}

export function report_Markup(run) {
	const records = run.records;
	return `<section class="practice-report"><h2>${copy.title}</h2><p>${copy.history}</p>
		${records.some(Boolean) ? `<p>${copy.time} · ${duration_Text(records.reduce((sum, record) => sum + (record?.elapsed ?? 0), 0))}</p>` : ''}
		${text.stages.map((stage, index) => {
			const record = records[index];
			const rows = record ? event_List(record, index, copy.worked, successes[index])
				+ event_List(record, index, copy.practice, Object.keys(copy.events[index]).filter(key => !successes[index].includes(key) && key !== 'hint'))
				+ event_List(record, index, copy.help, ['hint']) : '';
			return `<article><h3>${stage.title}</h3><p>${copy.score} · ${run.scores[index]} / 100</p>
				${record ? `<p>${copy.time} · ${duration_Text(record.elapsed)} · ${copy.tries} · ${index === 1 ? run.attempts : record.starts}</p>${rows || `<p>${copy.noActions}</p>`}` : `<p>${copy.noData}</p>`}
				${record ? `<fieldset><legend>${copy.like}</legend>${copy.interests.map((label, value) => `<label><input type="radio" name="interest-${index}" data-stage="${index}" value="${value}" ${record.interest === value ? 'checked' : ''}>${label}</label>`).join('')}</fieldset>` : ''}
			</article>`;
		}).join('')}
		${records.every(Boolean) ? `<div id="match-report" aria-live="polite"></div><p>${copy.scale}</p>` : ''}
	</section>`;
}

export function bind_Report(run, signal) {
	const report = document.querySelector('.practice-report');
	const result = report.querySelector('#match-report');
	function refresh() {
		if (!result) return;
		if (run.records.some(record => record.interest === null)) {
			result.textContent = copy.prompt;
			return;
		}
		const skill = run.scores.reduce((sum, score) => sum + score, 0) / 3;
		const interest = run.records.reduce((sum, record) => sum + record.interest * 50, 0) / 3;
		const match = Math.round((skill + interest) / 2);
		result.innerHTML = `<h3>${copy.match} · ${match}%</h3><p>${copy.skill} · ${Math.round(skill)}% · ${copy.interest} · ${Math.round(interest)}%</p><p>${copy.advice[match >= 75 ? 2 : match >= 40 ? 1 : 0]}</p>`;
	}
	report.addEventListener('change', event => {
		const input = event.target;
		if (!input.matches('input[data-stage]')) return;
		run.records[Number(input.dataset.stage)].interest = Number(input.value);
		refresh();
	}, { signal });
	refresh();
}
