// Перетаскивание на Pointer Events (design.md, D6): работает мышью, пером и касанием без библиотек.
// touch-action: none ставится только на перетаскиваемые элементы, чтобы остальная страница прокручивалась.

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import type { Offset } from "./motion";

// Находит цель под точкой отпускания: ближайший элемент с атрибутом data-drop-target, не считая самого перетаскиваемого.
export type DropTargetResolver = (clientX: number, clientY: number, draggedElement: HTMLElement) => string | null;

export const resolveDropTargetAtPoint: DropTargetResolver = (clientX, clientY, draggedElement) => {
	if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") {
		return null;
	}
	for (const element of document.elementsFromPoint(clientX, clientY)) {
		if (draggedElement.contains(element)) {
			continue;
		}
		const target = element.closest<HTMLElement>("[data-drop-target]");
		if (target && !draggedElement.contains(target)) {
			return target.dataset.dropTarget ?? null;
		}
	}
	return null;
};

export interface DropEvent {
	itemId: string;
	targetId: string | null;
	element: HTMLElement;
	// Сдвиг элемента в момент отпускания и его прямоугольник, чтобы анимировать возврат или полёт.
	offset: Offset;
	rect: DOMRect;
}

export interface UseDragOptions {
	onDrop: (event: DropEvent) => void;
	resolveTarget?: DropTargetResolver;
	// Сколько пикселей нужно сдвинуть указатель, чтобы нажатие стало перетаскиванием.
	threshold?: number;
	// Какой элемент двигать: по умолчанию тот, за который взяли. Бумага на столе двигается целиком за заголовок.
	getMovingElement?: (handle: HTMLElement) => HTMLElement;
}

interface DragSession {
	itemId: string;
	pointerId: number;
	startX: number;
	startY: number;
	element: HTMLElement;
	originalStyle: { transform: string; zIndex: string } | null;
}

export interface DragHandleProps {
	onPointerDown: (event: PointerEvent<HTMLElement>) => void;
	onPointerMove: (event: PointerEvent<HTMLElement>) => void;
	onPointerUp: (event: PointerEvent<HTMLElement>) => void;
	onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
	onClickCapture: (event: MouseEvent<HTMLElement>) => void;
	style: CSSProperties;
	"data-dragging"?: "true";
}

const defaultThreshold = 6;

export function useDrag(options: UseDragOptions) {
	const optionsRef = useRef(options);
	const sessionRef = useRef<DragSession | null>(null);
	// После перетаскивания браузер присылает click: его нужно погасить, чтобы не сработал выбор нажатием.
	const suppressClickRef = useRef(false);
	const [draggingId, setDraggingId] = useState<string | null>(null);

	useEffect(() => {
		optionsRef.current = options;
	});

	function resetElement({ element, originalStyle }: DragSession) {
		if (originalStyle) {
			element.style.transform = originalStyle.transform;
			element.style.zIndex = originalStyle.zIndex;
		}
	}

	function endSession() {
		sessionRef.current = null;
		setDraggingId(null);
	}

	function getDragHandleProps(itemId: string): DragHandleProps {
		return {
			onPointerDown(event) {
				// Только основная кнопка мыши; касание и перо проходят всегда.
				if (event.pointerType === "mouse" && event.button !== 0) {
					return;
				}
				const handle = event.currentTarget;
				const element = optionsRef.current.getMovingElement?.(handle) ?? handle;
				sessionRef.current = {
					itemId,
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					element,
					originalStyle: null,
				};
				// Новое нажатие: гасить больше нечего, даже если click после прошлого перетаскивания не пришёл.
				suppressClickRef.current = false;
				if (typeof handle.setPointerCapture === "function") {
					try {
						handle.setPointerCapture(event.pointerId);
					} catch {
						// Захват указателя недоступен (например, в тестовой среде): перетаскивание работает и без него.
					}
				}
			},
			onPointerMove(event) {
				const session = sessionRef.current;
				if (!session || session.pointerId !== event.pointerId) {
					return;
				}
				const dx = event.clientX - session.startX;
				const dy = event.clientY - session.startY;
				const threshold = optionsRef.current.threshold ?? defaultThreshold;
				if (!session.originalStyle) {
					if (Math.hypot(dx, dy) < threshold) {
						return;
					}
					session.originalStyle = { transform: session.element.style.transform, zIndex: session.element.style.zIndex };
					setDraggingId(session.itemId);
				}
				session.element.style.transform = `translate(${dx}px, ${dy}px)`;
				session.element.style.zIndex = "30";
			},
			onPointerUp(event) {
				const session = sessionRef.current;
				if (!session || session.pointerId !== event.pointerId) {
					return;
				}
				if (!session.originalStyle) {
					// Короткое нажатие без сдвига: дальше сработает обычный click.
					endSession();
					return;
				}
				const offset = { dx: event.clientX - session.startX, dy: event.clientY - session.startY };
				const rect = session.element.getBoundingClientRect();
				const resolveTarget = optionsRef.current.resolveTarget ?? resolveDropTargetAtPoint;
				const targetId = resolveTarget(event.clientX, event.clientY, session.element);
				resetElement(session);
				// click приходит в той же задаче, что и pointerup. Если элемент уже убран из разметки, click не придёт,
				// поэтому флаг снимается после текущей задачи и не съедает следующее нажатие.
				suppressClickRef.current = true;
				window.setTimeout(() => {
					suppressClickRef.current = false;
				}, 0);
				endSession();
				optionsRef.current.onDrop({ itemId: session.itemId, targetId, element: session.element, offset, rect });
			},
			onPointerCancel() {
				const session = sessionRef.current;
				if (session) {
					resetElement(session);
				}
				endSession();
			},
			onClickCapture(event) {
				if (suppressClickRef.current) {
					suppressClickRef.current = false;
					event.preventDefault();
					event.stopPropagation();
				}
			},
			style: { touchAction: "none" },
			...(draggingId === itemId ? { "data-dragging": "true" as const } : {}),
		};
	}

	return { draggingId, getDragHandleProps };
}
