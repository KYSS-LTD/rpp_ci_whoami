// Профиль выбирается до построения карты. Масштаб кадра меняется уже во время полёта.
export const compactGraphics = globalThis.matchMedia?.('(pointer: coarse)').matches === true
	|| globalThis.navigator?.deviceMemory <= 4;

const scales = [1, .85, .7, .58];

export function create_FlightResolution() {
	let level = 0;
	let sampleTime = 0;
	let frames = 0;
	let fastWindows = 0;

	function resetSample() {
		sampleTime = 0;
		frames = 0;
		fastWindows = 0;
	}

	return {
		get scale() { return scales[level]; },
		resetSample,
		sample(elapsed) {
			if (elapsed <= 0) return false;
			// Один долгий кадр загрузки не должен менять качество всей сцены.
			sampleTime += Math.min(elapsed, .1);
			frames++;
			if (sampleTime < 1.2) return false;
			const average = sampleTime / frames;
			sampleTime = frames = 0;
			fastWindows = average < .019 ? fastWindows + 1 : 0;
			const previous = level;
			if (average > .024 && level < scales.length - 1) level++;
			else if (fastWindows >= 8 && level > 0) level--;
			if (level === previous) return false;
			fastWindows = 0;
			return true;
		},
	};
}
