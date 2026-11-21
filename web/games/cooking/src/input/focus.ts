// Сброс ввода при потере фокуса и скрытии вкладки (задача 3.3): нажатые клавиши и касания считаются отпущенными,
// иначе отпускание, случившееся в другом окне, оставило бы клавишу "залипшей". Владелец: SONNET-2 (geometry-control-nav).

// Подключает сброс. reset вызывается при blur окна, скрытии вкладки (visibilitychange) и уходе страницы (pagehide).
// Возвращает функцию отключения.
export function attachFocusReset(target: Window, reset: () => void): () => void {
	const onBlur = (): void => {
		reset();
	};
	const onVisibilityChange = (): void => {
		if (target.document.visibilityState === "hidden") {
			reset();
		}
	};
	target.addEventListener("blur", onBlur);
	target.addEventListener("pagehide", onBlur);
	target.document.addEventListener("visibilitychange", onVisibilityChange);
	return () => {
		target.removeEventListener("blur", onBlur);
		target.removeEventListener("pagehide", onBlur);
		target.document.removeEventListener("visibilitychange", onVisibilityChange);
	};
}
