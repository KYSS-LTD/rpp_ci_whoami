// Помощники для нативных диалогов <dialog> (руководство modern-web-guidance: dialog). Модальный диалог открывается через
// showModal(): браузер сам даёт инертную страницу, удержание фокуса, слой top layer, ::backdrop и возврат фокуса.
// Если showModal недоступен (тестовое окружение jsdom), диалог открывается атрибутом open: тестам этого достаточно.

// Открыт ли диалог.
export function isModalOpen(dialog: HTMLDialogElement): boolean {
	return dialog.hasAttribute("open");
}

// Открывает диалог как модальный. Повторное открытие игнорируется (showModal на открытом диалоге бросает исключение).
// Возвращает true, если диалог был открыт именно этим вызовом.
export function openModal(dialog: HTMLDialogElement): boolean {
	if (isModalOpen(dialog) || !dialog.isConnected) {
		return false;
	}
	if (typeof dialog.showModal === "function") {
		dialog.showModal();
	} else {
		dialog.setAttribute("open", "");
	}
	return true;
}

// Закрывает диалог.
export function closeModal(dialog: HTMLDialogElement): void {
	if (!isModalOpen(dialog)) {
		return;
	}
	if (typeof dialog.close === "function") {
		dialog.close();
	} else {
		dialog.removeAttribute("open");
	}
}
