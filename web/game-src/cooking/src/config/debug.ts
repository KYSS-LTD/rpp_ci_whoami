// Режим отладки игры: одна переменная NEXT_PUBLIC_DEBUG, общая с порталом (CodeStyle, п.3, design D16).
// Значение подставляется Vite при сборке; dev:cooking читает его на лету из .env папки web.

// true, если в .env задано NEXT_PUBLIC_DEBUG=true. Остальные значения и отсутствие переменной выключают отладку.
export const isDebugEnabled: boolean = import.meta.env.NEXT_PUBLIC_DEBUG === "true";

// Пишет отладочное сообщение в консоль, только если отладка включена. Тексты отладки в файлы текстов не выносятся.
export function debugLog(scope: string, ...details: unknown[]): void {
	if (isDebugEnabled) {
		console.debug(`[cooking:${scope}]`, ...details);
	}
}
