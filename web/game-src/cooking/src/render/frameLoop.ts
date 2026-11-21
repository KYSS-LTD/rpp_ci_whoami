// Цикл кадров (задача 6.8): requestAnimationFrame с ограничением времени кадра. Main запускает его после загрузки и
// останавливает после результата или выхода (по onClosed отправителя итога): после stop() onFrame больше не вызывается.
import type { FrameLoop, FrameLoopOptions } from "../contracts";

// Верхняя граница времени кадра по умолчанию, секунды: защита от скачка времени после скрытой вкладки.
const defaultMaxFrameDtSec = 0.1;

// Создаёт цикл кадров.
export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
	const maxFrameDtSec = options.maxFrameDtSec ?? defaultMaxFrameDtSec;
	const scheduler = options.scheduler ?? {
		request: (callback: (nowMs: number) => void) => requestAnimationFrame(callback),
		cancel: (handle: number) => cancelAnimationFrame(handle),
	};

	let running = false;
	let handle: number | null = null;
	let lastFrameMs: number | null = null;

	function tick(nowMs: number): void {
		if (!running) {
			return;
		}
		const rawDtSec = lastFrameMs === null ? 0 : (nowMs - lastFrameMs) / 1000;
		lastFrameMs = nowMs;
		const frameDtSec = Math.min(Math.max(rawDtSec, 0), maxFrameDtSec);
		// Следующий кадр планируется до onFrame: если onFrame остановит цикл, запланированный кадр отменится.
		handle = scheduler.request(tick);
		options.onFrame(frameDtSec, nowMs);
	}

	return {
		start() {
			if (running) {
				return;
			}
			running = true;
			lastFrameMs = null;
			handle = scheduler.request(tick);
		},
		stop() {
			running = false;
			if (handle !== null) {
				scheduler.cancel(handle);
				handle = null;
			}
			lastFrameMs = null;
		},
		get isRunning() {
			return running;
		},
	};
}
