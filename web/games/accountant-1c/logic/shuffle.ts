// Перемешивание карточек (design.md, D4). Генератор случайных чисел внедряется, чтобы тесты не зависели от случайности.

// Генератор случайных чисел в диапазоне [0, 1), как Math.random.
export type RandomSource = () => number;

// Возвращает новый массив в случайном порядке (алгоритм Фишера - Йетса). Исходный массив не меняется.
export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
	const result = [...items];
	for (let index = result.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[result[index], result[swapIndex]] = [result[swapIndex], result[index]];
	}
	return result;
}

// Детерминированный генератор по зерну (mulberry32). Нужен тестам и воспроизводимым проверкам.
export function createSeededRandom(seed: number): RandomSource {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}
