// Отправка итога порталу (задачи 6.8 и 7.6). Единственная точка, через которую уходит результат или выход: порталу
// уходит не больше одного сообщения за запуск, а main узнаёт через onClosed, что игру пора остановить.
import type { PortalBridgeApi, ResultReporter, ShiftResult } from "../contracts";

// Создаёт отправитель итога поверх моста.
export function createResultReporter(bridge: PortalBridgeApi, onClosed: () => void): ResultReporter {
	let closed = false;

	return {
		get isClosed() {
			return closed;
		},
		reportResult(result: ShiftResult): boolean {
			if (closed) {
				return false;
			}
			// Мост сам отклоняет неверные числа и повторную отправку: тогда игра остаётся открытой, а не закрывается молча.
			const sent = bridge.finish({ score: result.score, maxScore: result.maxScore, completed: result.completed });
			if (!sent) {
				return false;
			}
			closed = true;
			onClosed();
			return true;
		},
		reportExit(): boolean {
			if (closed) {
				return false;
			}
			closed = true;
			bridge.exit();
			onClosed();
			return true;
		},
	};
}
