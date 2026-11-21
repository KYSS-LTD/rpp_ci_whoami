// Мелкие помощники для работы с DOM в HUD. Запись в DOM только при изменении значения: частые снимки не вызывают лишних
// перерисовок (задача 7.1). Сами тексты сюда не попадают, они лежат в texts/hud.ts.

// Параметры создания элемента.
export interface ElementOptions {
	className?: string;
	text?: string;
	attributes?: Record<string, string>;
}

// Создаёт элемент с классом, текстом и атрибутами.
export function createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
	const element = document.createElement(tagName);
	if (options.className) {
		element.className = options.className;
	}
	if (options.text !== undefined) {
		element.textContent = options.text;
	}
	if (options.attributes) {
		for (const [name, value] of Object.entries(options.attributes)) {
			element.setAttribute(name, value);
		}
	}
	return element;
}

// Меняет текст элемента, только если он отличается.
export function setText(element: Element, text: string): void {
	if (element.textContent !== text) {
		element.textContent = text;
	}
}

// Меняет атрибут, только если значение отличается. null убирает атрибут.
export function setAttribute(element: Element, name: string, value: string | null): void {
	if (value === null) {
		if (element.hasAttribute(name)) {
			element.removeAttribute(name);
		}
		return;
	}
	if (element.getAttribute(name) !== value) {
		element.setAttribute(name, value);
	}
}

// Меняет пользовательское свойство CSS, только если значение отличается.
export function setCssVariable(element: HTMLElement, name: string, value: string): void {
	if (element.style.getPropertyValue(name) !== value) {
		element.style.setProperty(name, value);
	}
}

// Включает или выключает булев признак через атрибут data-*: "true" или отсутствие атрибута.
export function setFlag(element: Element, name: string, value: boolean): void {
	setAttribute(element, name, value ? "true" : null);
}

// Форматирует секунды как "м:сс" (остаток округляется вверх: 59.2 с показывается как 1:00, поэтому баннер "осталась минута"
// появляется ровно когда таймер показывает 1:00).
export function formatTimer(timeLeftSec: number): string {
	const totalSeconds = Math.max(0, Math.ceil(timeLeftSec - 1e-9));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Доля 0..1 в целые проценты 0..100.
export function toPercent(ratio: number): number {
	return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
