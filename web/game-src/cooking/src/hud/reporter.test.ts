// Тесты отправителя итога (задачи 6.8 и 7.6) с подменой моста: один результат за запуск, выход без результата,
// остановка цикла кадров и снятие обработчиков ввода после закрытия ("Игра завершена", "Повторная передача исключена").
import { describe, expect, it, vi, type Mock } from "vitest";
import type { PortalBridgeApi, ShiftResult } from "../contracts";
import { createFrameLoop } from "../render/frameLoop";
import { createResultReporter } from "./reporter";

// Мост с подсчётом вызовов. finish принимает числа так же, как настоящий мост: 0 <= score <= maxScore, maxScore > 0, один раз.
interface FakeBridge extends PortalBridgeApi {
	finish: Mock<PortalBridgeApi["finish"]>;
	exit: Mock<PortalBridgeApi["exit"]>;
	reportError: Mock<PortalBridgeApi["reportError"]>;
}

function createFakeBridge(): FakeBridge {
	let finished = false;
	return {
		protocolVersion: 1,
		isEmbedded: true,
		getLevelId: () => "easy",
		onStart: vi.fn<PortalBridgeApi["onStart"]>(),
		finish: vi.fn<PortalBridgeApi["finish"]>((result) => {
			if (finished || result.maxScore <= 0 || result.score < 0 || result.score > result.maxScore) {
				return false;
			}
			finished = true;
			return true;
		}),
		exit: vi.fn<PortalBridgeApi["exit"]>(),
		reportError: vi.fn<PortalBridgeApi["reportError"]>(),
	};
}

const failedResult: ShiftResult = { completed: false, score: 12, maxScore: 80, reason: "failed" };
const successResult: ShiftResult = { completed: true, score: 70, maxScore: 80, reason: "allServed" };

describe("createResultReporter", () => {
	it("Игрок подтвердил провал: портал получает completed=false и набранный score", () => {
		const bridge = createFakeBridge();
		const onClosed = vi.fn();
		const reporter = createResultReporter(bridge, onClosed);
		expect(reporter.reportResult(failedResult)).toBe(true);
		expect(bridge.finish).toHaveBeenCalledWith({ score: 12, maxScore: 80, completed: false });
		expect(onClosed).toHaveBeenCalledTimes(1);
		expect(reporter.isClosed).toBe(true);
	});

	it("Результат передан один раз: успешная смена уходит с completed=true", () => {
		const bridge = createFakeBridge();
		const reporter = createResultReporter(bridge, vi.fn());
		expect(reporter.reportResult(successResult)).toBe(true);
		expect(bridge.finish).toHaveBeenCalledTimes(1);
		expect(bridge.finish).toHaveBeenCalledWith({ score: 70, maxScore: 80, completed: true });
	});

	it("Повторная передача исключена: ни второй результат, ни выход после результата не уходят", () => {
		const bridge = createFakeBridge();
		const onClosed = vi.fn();
		const reporter = createResultReporter(bridge, onClosed);
		reporter.reportResult(failedResult);
		expect(reporter.reportResult(failedResult)).toBe(false);
		expect(reporter.reportExit()).toBe(false);
		expect(bridge.finish).toHaveBeenCalledTimes(1);
		expect(bridge.exit).not.toHaveBeenCalled();
		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it("Игрок вышел посреди смены: уходит выход без результата, повторно нет", () => {
		const bridge = createFakeBridge();
		const onClosed = vi.fn();
		const reporter = createResultReporter(bridge, onClosed);
		expect(reporter.reportExit()).toBe(true);
		expect(bridge.exit).toHaveBeenCalledTimes(1);
		expect(bridge.finish).not.toHaveBeenCalled();
		expect(reporter.reportExit()).toBe(false);
		expect(reporter.reportResult(successResult)).toBe(false);
		expect(bridge.exit).toHaveBeenCalledTimes(1);
		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it("мост отклонил числа: игра не закрывается и повторить можно", () => {
		const bridge = createFakeBridge();
		const onClosed = vi.fn();
		const reporter = createResultReporter(bridge, onClosed);
		expect(reporter.reportResult({ completed: false, score: 5, maxScore: 0, reason: "failed" })).toBe(false);
		expect(reporter.isClosed).toBe(false);
		expect(onClosed).not.toHaveBeenCalled();
		expect(reporter.reportResult(failedResult)).toBe(true);
	});
});

describe("Игра завершена", () => {
	// Подменённый ввод: слушает клавиши на document, как настоящий слой ввода, и снимает обработчик в dispose.
	function createFakeInput() {
		const state = { keyPresses: 0 };
		const listener = () => {
			state.keyPresses += 1;
		};
		document.addEventListener("keydown", listener);
		return {
			state,
			dispose: () => document.removeEventListener("keydown", listener),
		};
	}

	it("после результата цикл остановлен, обработчики ввода сняты, нажатия на игру не влияют", () => {
		const bridge = createFakeBridge();
		const input = createFakeInput();
		let pendingFrame: ((nowMs: number) => void) | null = null;
		const onFrame = vi.fn();
		const loop = createFrameLoop({
			onFrame,
			scheduler: {
				request: (callback) => {
					pendingFrame = callback;
					return 1;
				},
				cancel: () => {
					pendingFrame = null;
				},
			},
		});
		// Как в main: reporter закрывается, цикл останавливается и ввод освобождается.
		const reporter = createResultReporter(bridge, () => {
			loop.stop();
			input.dispose();
		});

		loop.start();
		(pendingFrame as ((nowMs: number) => void) | null)?.(0);
		document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
		expect(input.state.keyPresses).toBe(1);
		expect(onFrame).toHaveBeenCalledTimes(1);

		reporter.reportResult(successResult);

		expect(loop.isRunning).toBe(false);
		expect(pendingFrame).toBeNull();
		document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
		expect(input.state.keyPresses).toBe(1);
		expect(onFrame).toHaveBeenCalledTimes(1);
		// Кнопки интерфейса тоже не отправляют ничего второй раз.
		expect(reporter.reportResult(failedResult)).toBe(false);
		expect(bridge.finish).toHaveBeenCalledTimes(1);
	});
});
