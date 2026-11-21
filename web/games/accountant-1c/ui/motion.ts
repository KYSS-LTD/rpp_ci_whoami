// Анимации на Web Animations API (design.md, D7). При prefers-reduced-motion: reduce полёт и тряска заменяются появлением.

export type MoveAnimationKind = "fly" | "appear";
export type RejectAnimationKind = "return" | "shake" | "appear";

// Сдвиг элемента относительно его нового места, в пикселях.
export interface Offset {
	dx: number;
	dy: number;
}

const moveDurationMs = 320;
const rejectDurationMs = 360;

// Пользователь попросил меньше движения в настройках системы.
export function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

// Ветка анимации перемещения: полёт или появление на новом месте.
export function chooseMoveAnimation(reducedMotion: boolean): MoveAnimationKind {
	return reducedMotion ? "appear" : "fly";
}

// Ветка анимации отказа: возврат после перетаскивания, тряска после выбора нажатием, появление при сниженном движении.
export function chooseRejectAnimation(reducedMotion: boolean, wasDragged: boolean): RejectAnimationKind {
	if (reducedMotion) {
		return "appear";
	}
	return wasDragged ? "return" : "shake";
}

// Кадры анимации перемещения.
export function buildMoveKeyframes(kind: MoveAnimationKind, offset: Offset): Keyframe[] {
	if (kind === "appear") {
		return [{ opacity: 0 }, { opacity: 1 }];
	}
	return [
		{ transform: `translate(${offset.dx}px, ${offset.dy}px) scale(1.04)`, offset: 0 },
		{ transform: "translate(0, 0) scale(1)", offset: 1 },
	];
}

// Кадры анимации отказа.
export function buildRejectKeyframes(kind: RejectAnimationKind, offset: Offset): Keyframe[] {
	if (kind === "appear") {
		return [{ opacity: 0.3 }, { opacity: 1 }];
	}
	if (kind === "return") {
		return [{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }, { transform: "translate(0, 0)" }];
	}
	return [
		{ transform: "translateX(0)" },
		{ transform: "translateX(-8px)" },
		{ transform: "translateX(7px)" },
		{ transform: "translateX(-4px)" },
		{ transform: "translateX(0)" },
	];
}

// Проигрывает перемещение элемента со старого места на новое. Возвращает выбранную ветку.
export function playMove(element: HTMLElement | null, offset: Offset, reducedMotion = prefersReducedMotion()): MoveAnimationKind {
	const kind = chooseMoveAnimation(reducedMotion);
	if (element && typeof element.animate === "function") {
		element.animate(buildMoveKeyframes(kind, offset), { duration: moveDurationMs, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
	}
	return kind;
}

// Проигрывает возврат или тряску элемента при неверном выборе. Возвращает выбранную ветку.
export function playReject(
	element: HTMLElement | null,
	dragOffset: Offset | null,
	reducedMotion = prefersReducedMotion(),
): RejectAnimationKind {
	const kind = chooseRejectAnimation(reducedMotion, dragOffset !== null);
	if (element && typeof element.animate === "function") {
		element.animate(buildRejectKeyframes(kind, dragOffset ?? { dx: 0, dy: 0 }), { duration: rejectDurationMs, easing: "ease-out" });
	}
	return kind;
}
