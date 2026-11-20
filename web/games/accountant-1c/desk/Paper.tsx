"use client";

// Бумага на столе (design.md, D11): лежит с лёгким наклоном, двигается за заголовок и поднимается наверх стопки.
// На узком экране бумаги идут столбиком без свободного положения (desk.module.css).
import type { CSSProperties, ReactNode } from "react";
import { useDrag } from "../ui/useDrag";
import { useDeskLayout, type PaperPosition } from "./contexts";
import styles from "./desk.module.css";

export type PaperVariant = "paper" | "form" | "card" | "note" | "newspaper" | "device" | "pad";

// Бумага, которую двигает перетаскивание: ближайший предок с атрибутом data-paper.
export function findMovingPaper(handle: HTMLElement): HTMLElement {
	return handle.closest<HTMLElement>("[data-paper]") ?? handle;
}

// Перетаскивание бумаги мимо целей ничего не находит: бумага остаётся там, где её отпустили.
const noTarget = () => null;

interface PaperProps {
	id: string;
	defaultPosition: PaperPosition;
	width?: number;
	title?: ReactNode;
	// За что двигать: за заголовок или никак (бумагу-кнопку двигает usePickAndDrop).
	handle?: "header" | "none";
	variant?: PaperVariant;
	tilt?: number;
	ariaLabel?: string;
	className?: string;
	// Бумага развёрнута (открытый справочник): CSS удерживает её целиком в пределах стола.
	isExpanded?: boolean;
	children?: ReactNode;
}

export function Paper({
	id,
	defaultPosition,
	width,
	title,
	handle = "header",
	variant = "paper",
	tilt = 0,
	ariaLabel,
	className,
	isExpanded = false,
	children,
}: PaperProps) {
	const layout = useDeskLayout();
	const position = layout?.getPosition(id, defaultPosition) ?? defaultPosition;
	const drag = useDrag({
		resolveTarget: noTarget,
		getMovingElement: findMovingPaper,
		onDrop(event) {
			layout?.moveBy(id, defaultPosition, event.offset.dx, event.offset.dy);
		},
	});

	const style = {
		"--x": `${position.x}px`,
		"--y": `${position.y}px`,
		"--tilt": `${tilt}deg`,
		"--paper-width": width ? `${width}px` : undefined,
		zIndex: layout?.getLayer(id) ?? 1,
	} as CSSProperties;

	return (
		<article
			className={`${styles.paper} ${className ?? ""}`}
			data-paper={id}
			data-variant={variant}
			data-expanded={isExpanded ? "true" : undefined}
			style={style}
			aria-label={ariaLabel}
			onPointerDownCapture={() => layout?.bringToFront(id)}
		>
			{title !== undefined ? (
				<header className={styles.paperHeader} {...(handle === "header" ? drag.getDragHandleProps(id) : {})} data-handle={handle}>
					{title}
				</header>
			) : null}
			{children}
		</article>
	);
}

// Оттиск штампа на бумаге: падает сверху и чуть поворачивается, при сниженном движении просто появляется.
export function StampMark({ label, tone = "red", className }: { label: string; tone?: "red" | "green" | "blue"; className?: string }) {
	return (
		<span className={`${styles.stampMark} ${className ?? ""}`} data-tone={tone} role="img" aria-label={label}>
			{label}
		</span>
	);
}
