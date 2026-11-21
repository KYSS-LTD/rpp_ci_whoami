const soundKey = 'aerolab:uav-operator:sound';
export const debugEnabled = import.meta.env.VITE_DEBUG === 'true';

export function debug_Message(message, error) {
	if (debugEnabled) console.debug(`[aerolab] ${message}`, error || '');
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
