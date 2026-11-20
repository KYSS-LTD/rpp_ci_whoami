import { text } from './text.js';

const storageKey = 'aerolab:uav-operator:v1';
const debug = import.meta.env.VITE_DEBUG === 'true';

export function debug_Message(message, error) {
	if (debug) console.debug(`[aerolab] ${message}`, error || '');
}

export function read_Progress() {
	const initial = { scores: [], best: 0 };
	try {
		const value = JSON.parse(localStorage.getItem(storageKey));
		if (!value || !Array.isArray(value.scores)) return initial;
		const scores = [];
		for (const score of value.scores.slice(0, text.stages.length)) {
			if (!Number.isInteger(score) || score < 0 || score > 100) break;
			scores.push(score);
		}
		const best = Number.isInteger(value.best) && value.best >= 0 && value.best <= 300 ? value.best : 0;
		return { scores, best };
	} catch (error) {
		debug_Message('Ошибка чтения прогресса', error);
		return initial;
	}
}

export function save_Progress(progress) {
	try {
		localStorage.setItem(storageKey, JSON.stringify(progress));
	} catch (error) {
		debug_Message('Ошибка сохранения прогресса', error);
	}
}

export function publish_Result(scores, score) {
	const origin = import.meta.env.VITE_PORTAL_ORIGIN;
	if (!origin || window.parent === window) return;
	try {
		const url = new URL(origin);
		if (!['http:', 'https:'].includes(url.protocol) || (origin !== url.origin && origin !== `${url.origin}/`)) {
			throw new Error('VITE_PORTAL_ORIGIN должен содержать только origin портала');
		}
		window.parent.postMessage({
			type: 'whoami:game-completed', version: 1, gameId: 'uav-operator', score, maxScore: 300,
			stages: text.stages.map((stage, index) => ({ id: stage.id, score: scores[index], maxScore: 100 })),
		}, url.origin);
	} catch (error) {
		debug_Message('Ошибка отправки результата порталу', error);
	}
}
