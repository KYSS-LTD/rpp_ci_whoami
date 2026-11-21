// Цикл симуляции с фиксированным шагом (задача 2.1, design D2): накопитель времени кадра, целые шаги по 1/60 с,
// ограничение числа шагов за кадр. Контракт: FixedStepLoop и FixedStepLoopFactory в contracts.ts. Владелец: SONNET-1.
import { SIM_STEP_SEC, type FixedStepLoop, type FixedStepLoopOptions } from "../../contracts";

// Сколько шагов за один advance разрешено по умолчанию (защита от "спирали смерти" после долгой паузы кадра).
const DEFAULT_MAX_STEPS_PER_ADVANCE = 5;

// Допуск на накопленную погрешность вещественного сложения: 60 кадров по 1/60 с дают ровно 60 шагов, а не 59.
const TIME_EPSILON_SEC = 1e-9;

// Создаёт цикл. onStep вызывается с dtSec, всегда равным stepSec.
export function createFixedStepLoop(options: FixedStepLoopOptions): FixedStepLoop {
	const stepSec = options.stepSec ?? SIM_STEP_SEC;
	const maxSteps = options.maxStepsPerAdvance ?? DEFAULT_MAX_STEPS_PER_ADVANCE;
	if (!(stepSec > 0)) {
		throw new RangeError(`createFixedStepLoop: шаг должен быть больше 0, получено ${stepSec}`);
	}
	if (!(maxSteps >= 1)) {
		throw new RangeError(`createFixedStepLoop: лимит шагов должен быть не меньше 1, получено ${maxSteps}`);
	}
	// Накопленное, но ещё не потраченное время, секунды. Всегда меньше одного шага после advance.
	let accumulatorSec = 0;

	return {
		advance(frameDtSec: number): number {
			// Нулевое, отрицательное и нечисловое время кадра игнорируется.
			if (!Number.isFinite(frameDtSec) || frameDtSec <= 0) {
				return 0;
			}
			accumulatorSec += frameDtSec;
			let stepsDone = 0;
			while (accumulatorSec + TIME_EPSILON_SEC >= stepSec && stepsDone < maxSteps) {
				accumulatorSec -= stepSec;
				stepsDone += 1;
				options.onStep(stepSec);
			}
			// Остаток сверх лимита отбрасывается: остаётся только неполная доля шага.
			if (accumulatorSec + TIME_EPSILON_SEC >= stepSec) {
				const fractionSec = accumulatorSec % stepSec;
				// Остаток от деления вещественных чисел может оказаться почти целым шагом: это тоже "ноль".
				accumulatorSec = fractionSec + TIME_EPSILON_SEC >= stepSec ? 0 : fractionSec;
			}
			return stepsDone;
		},
		reset(): void {
			accumulatorSec = 0;
		},
	};
}
