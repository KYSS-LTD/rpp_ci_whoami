import { defaultDifficulty, difficultyIds } from './difficulty.js';
import { read_Record } from './report.js';
import { text } from './text.js';

const storageKey = 'aerolab:uav-operator:v2';
const legacyKey = 'aerolab:uav-operator:v1';
const soundKey = 'aerolab:uav-operator:sound';
export const debugEnabled = import.meta.env.VITE_DEBUG === 'true';

export function debug_Message(message, error) {
	if (debugEnabled) console.debug(`[aerolab] ${message}`, error || '');
}

// Проверяет сохранённый прогресс одного уровня сложности: очки этапов и рекорд.
function read_Run(value) {
	const run = { scores: [], best: 0, attempts: 0, records: [null, null, null] };
	if (!value || !Array.isArray(value.scores)) return run;
	for (const score of value.scores.slice(0, text.stages.length)) {
		if (!Number.isInteger(score) || score < 0 || score > 100) break;
		run.scores.push(score);
	}
	run.attempts = Number.isSafeInteger(value.attempts) && value.attempts >= 0 ? value.attempts : Number(run.scores.length >= 2);
	run.records = text.stages.map((_, index) => read_Record(value.records?.[index], index));
	run.best = Number.isInteger(value.best) && value.best >= 0 && value.best <= 300 ? value.best : 0;
	return run;
}

export function read_Progress() {
	const progress = { difficulty: defaultDifficulty, chosen: false, runs: {} };
	for (const id of difficultyIds) progress.runs[id] = read_Run(null);
	try {
		const value = JSON.parse(localStorage.getItem(storageKey));
		if (value && typeof value === 'object') {
			if (difficultyIds.includes(value.difficulty)) {
				progress.difficulty = value.difficulty;
				progress.chosen = true;
			}
			for (const id of difficultyIds) progress.runs[id] = read_Run(value.runs?.[id]);
			return progress;
		}
		// Прогресс первой версии игры относится к обычной сложности.
		const legacy = JSON.parse(localStorage.getItem(legacyKey));
		if (legacy) {
			progress.runs.normal = read_Run(legacy);
			progress.chosen = true;
		}
	} catch (error) {
		debug_Message('Ошибка чтения прогресса', error);
	}
	return progress;
}

export function save_Progress(progress) {
	try {
		localStorage.setItem(storageKey, JSON.stringify(progress));
	} catch (error) {
		debug_Message('Ошибка сохранения прогресса', error);
	}
}

export function read_SoundEnabled() {
	try {
		return localStorage.getItem(soundKey) !== 'off';
	} catch {
		return true;
	}
}

export function save_SoundEnabled(enabled) {
	try {
		localStorage.setItem(soundKey, enabled ? 'on' : 'off');
	} catch (error) {
		debug_Message('Ошибка сохранения настройки звука', error);
	}
}

export function publish_Result(scores, score, difficulty, attempts) {
	const origin = import.meta.env.VITE_PORTAL_ORIGIN;
	if (!origin || window.parent === window) return;
	try {
		const url = new URL(origin);
		if (!['http:', 'https:'].includes(url.protocol) || (origin !== url.origin && origin !== `${url.origin}/`)) {
			throw new Error('VITE_PORTAL_ORIGIN должен содержать только origin портала');
		}
		window.parent.postMessage({
			type: 'whoami:game-completed', version: 1, gameId: 'uav-operator', score, maxScore: 300, difficulty, attempts,
			stages: text.stages.map((stage, index) => ({ id: stage.id, score: scores[index], maxScore: 100 })),
		}, url.origin);
	} catch (error) {
		debug_Message('Ошибка отправки результата порталу', error);
	}
}
