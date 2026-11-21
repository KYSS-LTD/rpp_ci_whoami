// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SIM_STEP_SEC } from "../../contracts";
import { createFixedStepLoop } from "./loop";
import { createRng } from "./rng";

// Скармливает циклу последовательность кадров и возвращает общее число шагов.
function runFrames(frames: readonly number[], maxStepsPerAdvance = 100000): number {
	let stepCount = 0;
	const loop = createFixedStepLoop({ onStep: () => (stepCount += 1), maxStepsPerAdvance });
	frames.forEach((frameDtSec) => loop.advance(frameDtSec));
	return stepCount;
}

describe("цикл с фиксированным шагом", () => {
	it("шаг по умолчанию равен SIM_STEP_SEC и передаётся в onStep", () => {
		const received: number[] = [];
		const loop = createFixedStepLoop({ onStep: (dtSec) => received.push(dtSec) });
		expect(loop.advance(SIM_STEP_SEC * 3)).toBe(3);
		expect(received).toEqual([SIM_STEP_SEC, SIM_STEP_SEC, SIM_STEP_SEC]);
	});

	it("неполный шаг копится между кадрами", () => {
		const loop = createFixedStepLoop({ onStep: () => undefined });
		expect(loop.advance(SIM_STEP_SEC * 0.6)).toBe(0);
		expect(loop.advance(SIM_STEP_SEC * 0.6)).toBe(1);
		expect(loop.advance(SIM_STEP_SEC * 0.8)).toBe(1);
	});

	it("результат не зависит от размера dt: то же суммарное время даёт то же число шагов", () => {
		// 10.005 секунд ровно 600.3 шага: любая нарезка на кадры даёт 600 шагов.
		const totalSec = 10.005;
		const splits: Array<{ name: string; frameDtSec: number }> = [
			{ name: "60 Гц", frameDtSec: 1 / 60 },
			{ name: "30 Гц", frameDtSec: 1 / 30 },
			{ name: "144 Гц", frameDtSec: 1 / 144 },
			{ name: "20 Гц", frameDtSec: 0.05 },
			{ name: "странный dt", frameDtSec: 0.0137 },
		];
		splits.forEach(({ name, frameDtSec }) => {
			const frameCount = Math.floor(totalSec / frameDtSec);
			const frames = Array.from({ length: frameCount }, () => frameDtSec);
			frames.push(totalSec - frameCount * frameDtSec);
			expect(runFrames(frames), name).toBe(600);
		});
	});

	it("случайные размеры кадров дают то же число шагов, что и ровные", () => {
		const rng = createRng(99);
		const frames: number[] = [];
		let spentSec = 0;
		const totalSec = 20.005;
		while (spentSec < totalSec) {
			const frameDtSec = Math.min(rng.nextRange(0.001, 0.09), totalSec - spentSec);
			frames.push(frameDtSec);
			spentSec += frameDtSec;
		}
		expect(runFrames(frames)).toBe(1200);
	});

	it("шестьдесят кадров по 1/60 с дают ровно шестьдесят шагов, без потери из-за погрешности", () => {
		expect(runFrames(Array.from({ length: 60 }, () => 1 / 60))).toBe(60);
		expect(runFrames(Array.from({ length: 6000 }, () => 1 / 60))).toBe(6000);
	});

	it("ограничивает число шагов за кадр и отбрасывает остаток сверх лимита", () => {
		let stepCount = 0;
		const loop = createFixedStepLoop({ onStep: () => (stepCount += 1) });
		expect(loop.advance(1)).toBe(5);
		expect(stepCount).toBe(5);
		// Остаток отброшен: пустой кадр шагов не даёт.
		expect(loop.advance(0)).toBe(0);
		expect(loop.advance(SIM_STEP_SEC)).toBe(1);
	});

	it("свой лимит и свой шаг учитываются", () => {
		let stepCount = 0;
		const loop = createFixedStepLoop({ onStep: () => (stepCount += 1), stepSec: 0.1, maxStepsPerAdvance: 2 });
		expect(loop.advance(0.5)).toBe(2);
		expect(stepCount).toBe(2);
	});

	it("reset сбрасывает накопитель", () => {
		const loop = createFixedStepLoop({ onStep: () => undefined });
		loop.advance(SIM_STEP_SEC * 0.9);
		loop.reset();
		expect(loop.advance(SIM_STEP_SEC * 0.2)).toBe(0);
	});

	it("нулевое, отрицательное и нечисловое время кадра игнорируется", () => {
		let stepCount = 0;
		const loop = createFixedStepLoop({ onStep: () => (stepCount += 1) });
		expect(loop.advance(0)).toBe(0);
		expect(loop.advance(-1)).toBe(0);
		expect(loop.advance(Number.NaN)).toBe(0);
		expect(loop.advance(Number.POSITIVE_INFINITY)).toBe(0);
		expect(stepCount).toBe(0);
	});

	it("недопустимые параметры отвергаются", () => {
		expect(() => createFixedStepLoop({ onStep: () => undefined, stepSec: 0 })).toThrow(RangeError);
		expect(() => createFixedStepLoop({ onStep: () => undefined, maxStepsPerAdvance: 0 })).toThrow(RangeError);
	});
});
