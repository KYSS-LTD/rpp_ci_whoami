// Тесты цикла кадров (задача 6.8) с ручным планировщиком кадров.
import { describe, expect, it, vi } from "vitest";
import { createFrameLoop } from "./frameLoop";

// Ручной планировщик: кадр выполняется вызовом runFrame.
function createManualScheduler() {
	let nextHandle = 1;
	let pending: { handle: number; callback: (nowMs: number) => void } | null = null;
	const cancel = vi.fn((handle: number) => {
		if (pending && pending.handle === handle) {
			pending = null;
		}
	});
	return {
		scheduler: {
			request(callback: (nowMs: number) => void) {
				const handle = nextHandle;
				nextHandle += 1;
				pending = { handle, callback };
				return handle;
			},
			cancel,
		},
		cancel,
		hasPending: () => pending !== null,
		runFrame(nowMs: number) {
			const current = pending;
			pending = null;
			current?.callback(nowMs);
		},
	};
}

describe("createFrameLoop", () => {
	it("вызывает onFrame с временем кадра, первый кадр даёт нулевое время", () => {
		const manual = createManualScheduler();
		const frames: number[] = [];
		const loop = createFrameLoop({ onFrame: (dt) => frames.push(dt), scheduler: manual.scheduler });
		loop.start();
		manual.runFrame(1000);
		manual.runFrame(1016);
		manual.runFrame(1050);
		expect(frames[0]).toBe(0);
		expect(frames[1]).toBeCloseTo(0.016);
		expect(frames[2]).toBeCloseTo(0.034);
		expect(loop.isRunning).toBe(true);
	});

	it("ограничивает время кадра после скачка (скрытая вкладка)", () => {
		const manual = createManualScheduler();
		const frames: number[] = [];
		const loop = createFrameLoop({ onFrame: (dt) => frames.push(dt), maxFrameDtSec: 0.1, scheduler: manual.scheduler });
		loop.start();
		manual.runFrame(0);
		manual.runFrame(30000);
		expect(frames[1]).toBe(0.1);
	});

	it("повторный start игнорируется: кадр планируется один раз", () => {
		const manual = createManualScheduler();
		const onFrame = vi.fn();
		const loop = createFrameLoop({ onFrame, scheduler: manual.scheduler });
		loop.start();
		loop.start();
		manual.runFrame(0);
		expect(onFrame).toHaveBeenCalledTimes(1);
	});

	it("stop отменяет запланированный кадр и onFrame больше не вызывается", () => {
		const manual = createManualScheduler();
		const onFrame = vi.fn();
		const loop = createFrameLoop({ onFrame, scheduler: manual.scheduler });
		loop.start();
		manual.runFrame(0);
		loop.stop();
		expect(loop.isRunning).toBe(false);
		expect(manual.cancel).toHaveBeenCalled();
		expect(manual.hasPending()).toBe(false);
		manual.runFrame(16);
		expect(onFrame).toHaveBeenCalledTimes(1);
	});

	it("остановка изнутри onFrame не оставляет запланированных кадров", () => {
		const manual = createManualScheduler();
		const loopRef: { current: ReturnType<typeof createFrameLoop> | null } = { current: null };
		const onFrame = vi.fn(() => loopRef.current?.stop());
		loopRef.current = createFrameLoop({ onFrame, scheduler: manual.scheduler });
		loopRef.current.start();
		manual.runFrame(0);
		expect(onFrame).toHaveBeenCalledTimes(1);
		expect(manual.hasPending()).toBe(false);
		expect(loopRef.current.isRunning).toBe(false);
	});

	it("после stop цикл можно запустить снова", () => {
		const manual = createManualScheduler();
		const onFrame = vi.fn();
		const loop = createFrameLoop({ onFrame, scheduler: manual.scheduler });
		loop.start();
		loop.stop();
		loop.start();
		manual.runFrame(100);
		expect(onFrame).toHaveBeenCalledTimes(1);
	});
});
