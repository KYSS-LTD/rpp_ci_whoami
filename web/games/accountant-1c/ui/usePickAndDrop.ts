// Ввод "выбрать элемент, затем цель" (design.md, D6): нажатием мыши, касанием, с клавиатуры и перетаскиванием.
// Клавиатура: Tab к элементу, Enter выбирает его и переводит фокус на цели, стрелки двигают по целям, Enter кладёт, Escape отменяет.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { playMove, playReject, type Offset } from "./motion";
import { useDrag, type DragHandleProps, type DropTargetResolver } from "./useDrag";

export interface UsePickAndDropOptions {
	targetIds: string[];
	tutorialTarget?: string;
	// Возвращает true, если элемент принят целью. При false элемент возвращается на место.
	onPlace: (itemId: string, targetId: string) => boolean;
	resolveTarget?: DropTargetResolver;
	// Элемент брошен мимо целей: на столе бумага просто остаётся там, куда её положили.
	// Без обработчика элемент возвращается на место.
	onFreeDrop?: (itemId: string, offset: Offset) => void;
	// Какой элемент двигать при перетаскивании (например, всю бумагу, а не только кнопку на ней).
	getMovingElement?: (handle: HTMLElement) => HTMLElement;
}

interface PendingFlight {
	itemId: string;
	rect: DOMRect | null;
}

// Что сфокусировать после перерисовки: первую цель после выбора с клавиатуры или следующий элемент после укладки.
type PendingFocus = { kind: "target"; targetId: string } | { kind: "item"; itemId: string } | { kind: "nextItem" } | null;

export interface PickItemProps extends DragHandleProps {
	type: "button";
	"aria-pressed": boolean;
	"data-item-id": string;
	"data-tutorial-id": string;
	onClick: (event: MouseEvent<HTMLElement>) => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	onKeyUp: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface PickTargetProps {
	role: "button";
	tabIndex: number;
	"aria-disabled": boolean;
	"data-drop-target": string;
	"data-tutorial-id": string;
	"data-active"?: "true";
	onClick: () => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

// Ищет элемент по атрибуту внутри контейнера, а без контейнера во всём документе: на рабочем месте
// бумаги лежат на столе, а цели и журналы бывают на мониторе. Идентификаторы в игре из латинских букв и цифр.
function findInside(container: HTMLElement | null, attribute: string, value: string): HTMLElement | null {
	const root: ParentNode | null = container ?? (typeof document === "undefined" ? null : document);
	return root?.querySelector<HTMLElement>(`[${attribute}="${value}"]`) ?? null;
}

export function usePickAndDrop({ targetIds, tutorialTarget, onPlace, resolveTarget, onFreeDrop, getMovingElement }: UsePickAndDropOptions) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
	const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
	const pendingFlightRef = useRef<PendingFlight | null>(null);
	const pendingFocusRef = useRef<PendingFocus>(null);

	// После перерисовки: полёт уложенного элемента на новое место и перенос фокуса.
	useLayoutEffect(() => {
		const container = containerRef.current;
		const flight = pendingFlightRef.current;
		if (flight) {
			pendingFlightRef.current = null;
			const placedElement = findInside(container, "data-placed-id", flight.itemId);
			if (placedElement && flight.rect) {
				const newRect = placedElement.getBoundingClientRect();
				playMove(placedElement, { dx: flight.rect.left - newRect.left, dy: flight.rect.top - newRect.top });
			}
		}
		const focus = pendingFocusRef.current;
		if (focus) {
			pendingFocusRef.current = null;
			if (focus.kind === "target") {
				findInside(container, "data-drop-target", focus.targetId)?.focus();
			} else if (focus.kind === "item") {
				findInside(container, "data-item-id", focus.itemId)?.focus();
			} else {
				(container ?? document).querySelector<HTMLElement>("[data-item-id]:not(:disabled)")?.focus();
			}
		}
	});

	// Кладёт элемент в цель. Отказ проигрывает возврат (после перетаскивания) или тряску (после выбора нажатием).
	function place(itemId: string, targetId: string, dragged: { offset: Offset; rect: DOMRect } | null, fromKeyboard: boolean): boolean {
		const handleElement = findInside(containerRef.current, "data-item-id", itemId);
		// Анимируется то, что двигается при перетаскивании: вся бумага, а не только кнопка на ней.
		const itemElement = handleElement && getMovingElement ? getMovingElement(handleElement) : handleElement;
		const rect = dragged?.rect ?? itemElement?.getBoundingClientRect() ?? null;
		const accepted = onPlace(itemId, targetId);
		setSelectedItemId(null);
		setActiveTargetId(null);
		if (accepted) {
			pendingFlightRef.current = { itemId, rect };
			if (fromKeyboard) {
				pendingFocusRef.current = { kind: "nextItem" };
			}
		} else {
			playReject(itemElement, dragged?.offset ?? null);
			if (fromKeyboard) {
				pendingFocusRef.current = { kind: "item", itemId };
			}
		}
		return accepted;
	}

	const drag = useDrag({
		resolveTarget,
		getMovingElement,
		onDrop(event) {
			if (event.targetId === null || !targetIds.includes(event.targetId)) {
				if (tutorialTarget) {
					place(event.itemId, "", { offset: event.offset, rect: event.rect }, false);
					return;
				}
				if (onFreeDrop && event.targetId === null) {
					onFreeDrop(event.itemId, event.offset);
					return;
				}
				playReject(event.element, event.offset);
				return;
			}
			place(event.itemId, event.targetId, { offset: event.offset, rect: event.rect }, false);
		},
	});

	function selectItem(itemId: string, fromKeyboard: boolean) {
		if (selectedItemId === itemId) {
			setSelectedItemId(null);
			setActiveTargetId(null);
			return;
		}
		setSelectedItemId(itemId);
		const firstTargetId = tutorialTarget ?? targetIds[0] ?? null;
		setActiveTargetId(firstTargetId);
		if (fromKeyboard && firstTargetId) {
			pendingFocusRef.current = { kind: "target", targetId: firstTargetId };
		}
	}

	function cancelSelection() {
		const itemId = selectedItemId;
		setSelectedItemId(null);
		setActiveTargetId(null);
		if (itemId) {
			pendingFocusRef.current = { kind: "item", itemId };
		}
	}

	function getItemProps(itemId: string): PickItemProps {
		return {
			...drag.getDragHandleProps(itemId),
			type: "button",
			"aria-pressed": selectedItemId === itemId,
			"data-item-id": itemId,
			"data-tutorial-id": `item-${itemId}`,
			onClick(event) {
				// detail = 0 у нажатия без мыши (например, экранным диктором): тогда фокус тоже переходит на цели.
				selectItem(itemId, event.detail === 0);
			},
			// Enter и пробел обрабатываются сами, а действие кнопки по умолчанию отменяется, чтобы выбор не сработал дважды.
			onKeyDown(event) {
				if (event.key === "Enter") {
					event.preventDefault();
					selectItem(itemId, true);
				} else if (event.key === " ") {
					event.preventDefault();
				} else if (event.key === "Escape") {
					cancelSelection();
				}
			},
			onKeyUp(event) {
				if (event.key === " ") {
					event.preventDefault();
					selectItem(itemId, true);
				}
			},
		};
	}

	function moveActiveTarget(step: number) {
		if (tutorialTarget || targetIds.length === 0) {
			return;
		}
		const currentIndex = activeTargetId ? targetIds.indexOf(activeTargetId) : 0;
		const nextIndex = (currentIndex + step + targetIds.length) % targetIds.length;
		const nextTargetId = targetIds[nextIndex];
		setActiveTargetId(nextTargetId);
		pendingFocusRef.current = { kind: "target", targetId: nextTargetId };
	}

	function getTargetProps(targetId: string): PickTargetProps {
		const isActive = selectedItemId !== null && activeTargetId === targetId;
		return {
			role: "button",
			tabIndex: isActive ? 0 : -1,
			"aria-disabled": selectedItemId === null,
			"data-drop-target": targetId,
			"data-tutorial-id": `target-${targetId}`,
			...(isActive ? { "data-active": "true" as const } : {}),
			onClick() {
				if (selectedItemId) {
					place(selectedItemId, targetId, null, false);
				}
			},
			onKeyDown(event) {
				if (event.key === "ArrowDown" || event.key === "ArrowRight") {
					event.preventDefault();
					moveActiveTarget(1);
				} else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
					event.preventDefault();
					moveActiveTarget(-1);
				} else if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					if (selectedItemId) {
						place(selectedItemId, targetId, null, true);
					}
				} else if (event.key === "Escape") {
					event.preventDefault();
					cancelSelection();
				}
			},
		};
	}

	return {
		containerRef,
		selectedItemId,
		activeTargetId,
		draggingId: drag.draggingId,
		getItemProps,
		getTargetProps,
		cancelSelection,
	};
}
