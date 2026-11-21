import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { TutorialStep } from "../data/tutorials";
import { findTutorialTargets, useTutorialGeometry, type TutorialController } from "../hooks/useTutorial";
import { accountantTexts } from "../texts";
import { tutorialTexts } from "../texts/tutorial";
import { fontVariables } from "../ui/fonts";
import { PixelCharacter } from "../ui/pixel";
import styles from "./TutorialOverlay.module.css";

const padding = 8;
const focusable = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';

interface OverlayProps {
	rootRef: RefObject<HTMLElement | null>;
	tutorial: TutorialController;
	step: TutorialStep;
	appOpen: boolean;
	onShowApp: (open: boolean) => void;
}

function cutout(box: DOMRect) {
	return { x: box.x - padding, y: box.y - padding, width: box.width + padding * 2, height: box.height + padding * 2, rx: 9 };
}

export function TutorialOverlay({ rootRef, tutorial, step, appOpen, onShowApp }: OverlayProps) {
	const maskId = useId();
	const arrowId = useId();
	const noteRef = useRef<HTMLElement>(null);
	const { width, height, noteWidth, noteHeight, targets } = useTutorialGeometry(rootRef, noteRef, step, appOpen);
	const actionsRef = useRef(tutorial);
	const [lastShownId, setLastShownId] = useState("");
	const visible = targets.filter(({ rect }) => rect.width > 0 && rect.height > 0);
	const first = visible.find(({ id }) => id === step.targets[0])?.rect;
	const second = visible.find(({ id }) => id === step.targets[1])?.rect;
	const arrow = step.showArrow && first && second ? {
		x1: first.x + first.width / 2,
		y1: first.y + first.height / 2,
		x2: second.x + second.width / 2,
		y2: second.y + second.height / 2,
	} : null;
	const intersection = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
	const margin = 12;
	const bottom = Math.max(margin, height - noteHeight - margin);
	const vertical = [bottom, margin, ...visible.flatMap(({ rect }) => [rect.bottom + padding + margin, rect.top - padding - noteHeight - margin])]
		.filter((y) => y >= margin && y <= bottom);
	const horizontal = [Math.max(margin, width - noteWidth - margin), margin];
	const candidates = vertical.flatMap((top) => horizontal.map((left) => ({ top, left })));
	const overlap = ({ top, left }: { top: number; left: number }) =>
		visible.reduce((total, { rect }, index) => total +
			intersection(rect.left - padding, rect.right + padding, left, left + noteWidth) *
			intersection(rect.top - padding, rect.bottom + padding, top, top + noteHeight) * (index === 0 ? 2 : 1), 0);
	const notePosition = candidates.reduce((best, candidate) => overlap(candidate) < overlap(best) ? candidate : best);

	useEffect(() => {
		actionsRef.current = tutorial;
	}, [tutorial]);

	useEffect(() => {
		const root = rootRef.current;
		if (root && step.action !== "next") {
			const target = findTutorialTargets(root, step)[0];
			if (target) onShowApp(!!target.closest('[data-accounting-app]'));
		}
	}, [rootRef, onShowApp, step]);

	useEffect(() => {
		const note = noteRef.current;
		const root = rootRef.current;
		if (!note || !root) {
			return;
		}
		const previous = document.activeElement;
		note.focus({ preventScroll: true });
		const targets = () => findTutorialTargets(root, step);
		const allowed = (element: EventTarget | null) =>
			element instanceof Element && (note.contains(element) || element.closest('[data-tutorial-switch]') || targets().some((target) => target.contains(element)));

		function blockBackground(event: Event) {
			if (!allowed(event.target)) {
				event.preventDefault();
				event.stopPropagation();
			}
		}

		function handleKey(event: KeyboardEvent) {
			if (event.key === "Escape") {
				if (event.target instanceof Element && event.target.closest('[data-accounting-app]')) return;
				event.preventDefault();
				event.stopPropagation();
				actionsRef.current.skip();
				return;
			}
			if (event.key === "Tab") {
				const switches = [...root!.querySelectorAll<HTMLElement>('[data-tutorial-switch]')];
				const elements = [...new Set([note!, ...targets(), ...switches].flatMap((element) => [
					...(element.matches(focusable) ? [element] : []),
					...element.querySelectorAll<HTMLElement>(focusable),
				]))].filter((element) => !element.closest('[inert], [hidden]') && element.getClientRects().length > 0);
				if (elements.length) {
					const active = elements.indexOf(document.activeElement as HTMLElement);
					const next = active < 0 ? (event.shiftKey ? elements.length - 1 : 0) : (active + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
					event.preventDefault();
					elements[next].focus();
				}
				return;
			}
			if (event.key === "Enter" || event.key === " ") {
				blockBackground(event);
			}
		}

		document.addEventListener("click", blockBackground, true);
		document.addEventListener("pointerdown", blockBackground, true);
		document.addEventListener("keydown", handleKey, true);
		return () => {
			document.removeEventListener("click", blockBackground, true);
			document.removeEventListener("pointerdown", blockBackground, true);
			document.removeEventListener("keydown", handleKey, true);
			if (note.contains(document.activeElement) || document.activeElement === document.body) {
				const restore = previous instanceof HTMLElement && previous !== document.body && previous.isConnected
					? previous
					: root.querySelector<HTMLElement>("[data-tutorial-help]");
				restore?.focus({ preventScroll: true });
			}
		};
	}, [rootRef, step]);

	const lastShown = step.targets.indexOf(lastShownId);
	const missing = [...targets.slice(lastShown + 1), ...targets.slice(0, lastShown + 1)].find(({ hidden }) => hidden);

	function showTarget(id: string) {
		const root = rootRef.current;
		if (root) {
			const target = findTutorialTargets(root, step).find((element) => element.dataset.tutorialId === id);
			if (!target) return;
			setLastShownId(id);
			onShowApp(!!target.closest('[data-accounting-app]'));
			window.requestAnimationFrame(() => {
				const animations = target.closest('[data-accounting-app]')?.getAnimations?.() ?? [];
				void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
					if (target.isConnected && !target.closest('[inert]')) target.scrollIntoView?.({ block: "center", inline: "nearest" });
				});
			});
		}
	}

	return createPortal(
		<div className={`${styles.overlay} ${fontVariables}`}>
			<svg className={styles.shade} width={width} height={height} aria-hidden="true">
				<defs>
					<mask id={maskId}>
						<rect width={width} height={height} fill="white" />
						{visible.map(({ id, rect }) => <rect key={id} {...cutout(rect)} fill="black" />)}
					</mask>
					<marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
						<path d="M 0 0 L 10 5 L 0 10 Z" fill="#ffdc57" />
					</marker>
				</defs>
				<rect width={width} height={height} fill="rgba(22, 12, 10, 0.76)" mask={`url(#${maskId})`} />
				{visible.map(({ id, rect }) => <rect key={id} className={styles.ring} {...cutout(rect)} />)}
				{arrow ? (
					<path
						className={styles.arrow}
						d={`M ${arrow.x1} ${arrow.y1} Q ${(arrow.x1 + arrow.x2) / 2} ${(arrow.y1 + arrow.y2) / 2 - 42} ${arrow.x2} ${arrow.y2}`}
						markerEnd={`url(#${arrowId})`}
					/>
				) : first && step.targets.length === 1 && step.action !== "next" ? (
					<circle className={styles.ring} cx={first.right - 6} cy={first.top + 6} r={9} />
				) : null}
			</svg>
			<section ref={noteRef} className={styles.note} style={notePosition} tabIndex={-1} data-tutorial-step={step.id} aria-label={accountantTexts.characters.chief}>
				<header className={styles.noteHeader}>
					<PixelCharacter character="chief" label={accountantTexts.characters.chief} className={styles.portrait} />
					<strong>{accountantTexts.characters.chief}</strong>
					<span>{tutorial.index + 1}/{tutorial.count}</span>
				</header>
				<p>{tutorialTexts.steps[step.textKey]}</p>
				{tutorial.failed ? <p className={styles.retry} role="status">{tutorialTexts.retry}</p> : null}
				<div className={styles.buttons}>
					<button type="button" onClick={tutorial.skip}>{tutorialTexts.skip}</button>
					{missing ? (
						<button type="button" onClick={() => showTarget(missing.id)}>
							{step.showArrow && missing.id === step.targets[0] ? tutorialTexts.showSource : tutorialTexts.showTarget}
						</button>
					) : null}
					{step.action === "next" ? <button type="button" onClick={tutorial.next}>{tutorialTexts.next}</button> : null}
				</div>
			</section>
		</div>,
		document.body,
	);
}
