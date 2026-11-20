// Режим отладки. Включается одной переменной NEXT_PUBLIC_DEBUG=true в файле .env.
// Next.js подставляет NEXT_PUBLIC_* при сборке, поэтому переменная читается и на сервере, и в браузере.

// Проверяет значение переменной окружения. Включено только при точном значении "true".
export function isDebugEnabled(rawValue: string | undefined = process.env.NEXT_PUBLIC_DEBUG): boolean {
	return rawValue?.trim().toLowerCase() === "true";
}

// Пишет отладочное сообщение в консоль с меткой модуля. При выключенной отладке ничего не делает.
export function debugLog(scope: string, ...details: unknown[]): void {
	if (!isDebugEnabled()) {
		return;
	}
	console.debug(`[debug:${scope}]`, ...details);
}
