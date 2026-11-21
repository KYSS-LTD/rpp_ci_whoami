// Генератор псевдослучайных чисел по seed (задача 2.1, design D2). Алгоритм mulberry32: один seed всегда даёт одну и ту же
// последовательность, поэтому расписание дня воспроизводимо. Контракт: Rng и RngFactory в contracts.ts. Владелец: SONNET-1.
import type { Rng } from "../../contracts";

// Модуль 2^32: mulberry32 выдаёт целые беззнаковые 32 бита, из которых делается число в [0, 1).
const UINT32_RANGE = 4294967296;

// Создаёт генератор по seed. Нецелый, отрицательный или нечисловой seed приводится к беззнаковому 32-битному целому.
export function createRng(seed: number): Rng {
	let state = seed >>> 0;

	// Число в [0, 1).
	function next(): number {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = state;
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
	}

	// Целое в [min, max] включительно.
	function nextInt(min: number, max: number): number {
		const low = Math.ceil(min);
		const high = Math.floor(max);
		if (!(high >= low)) {
			throw new RangeError(`createRng.nextInt: пустой диапазон [${min}, ${max}]`);
		}
		return low + Math.floor(next() * (high - low + 1));
	}

	// Вещественное в [min, max).
	function nextRange(min: number, max: number): number {
		return min + next() * (max - min);
	}

	// Случайный элемент непустого массива.
	function pick<T>(items: readonly T[]): T {
		if (items.length === 0) {
			throw new RangeError("createRng.pick: пустой массив");
		}
		return items[nextInt(0, items.length - 1)];
	}

	// Индекс по весам: вероятность индекса пропорциональна его весу. Вес 0 никогда не выпадает.
	function weightedIndex(weights: readonly number[]): number {
		let total = 0;
		weights.forEach((weight) => {
			if (!(weight >= 0)) {
				throw new RangeError(`createRng.weightedIndex: недопустимый вес ${weight}`);
			}
			total += weight;
		});
		if (!(total > 0)) {
			throw new RangeError("createRng.weightedIndex: сумма весов должна быть больше 0");
		}
		let remaining = next() * total;
		let lastPositive = 0;
		for (let index = 0; index < weights.length; index += 1) {
			if (weights[index] <= 0) {
				continue;
			}
			lastPositive = index;
			if (remaining < weights[index]) {
				return index;
			}
			remaining -= weights[index];
		}
		// Защита от накопленной погрешности вещественных чисел: последний индекс с положительным весом.
		return lastPositive;
	}

	return { next, nextInt, nextRange, pick, weightedIndex };
}
