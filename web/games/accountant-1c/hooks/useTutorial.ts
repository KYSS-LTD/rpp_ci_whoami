import { useEffect, useState, type RefObject } from "react";
import type { TutorialStep } from "../data/tutorials";

export function useTutorial(enabled: boolean, steps: readonly TutorialStep[], onClose?: () => void) {
	const [run, setRun] = useState({ steps, index: 0, failed: false });
	const current = enabled ? run.steps[run.index] : undefined;

	function close() {
		setRun((previous) => ({ ...previous, index: previous.steps.length }));
		onClose?.();
	}

	function advance() {
		if (run.index + 1 >= run.steps.length) {
			close();
		} else {
			setRun((previous) => ({ ...previous, index: previous.index + 1, failed: false }));
		}
	}

	return {
		enabled,
		current,
		index: run.index,
		count: run.steps.length,
		failed: run.failed,
		replay: () => setRun({ steps, index: 0, failed: false }),
		skip: close,
		next() {
			if (current?.action === "next") {
				advance();
			}
		},
		// Проверяем до записи ответа и начисления очков.
		accept(action: TutorialStep["action"], valid: boolean) {
			if (!current) {
				return true;
			}
			if (current.action !== action || !valid) {
				setRun((previous) => ({ ...previous, failed: true }));
				return false;
			}
			advance();
			return true;
		},
	};
}

export type TutorialController = ReturnType<typeof useTutorial>;

export function findTutorialTargets(root: HTMLElement, step: TutorialStep): HTMLElement[] {
	return step.targets.flatMap((id) => {
		const element = root.querySelector<HTMLElement>(`[data-tutorial-id="${id}"]`);
		return element ? [element] : [];
	});
}

function measureTarget(element: HTMLElement, width: number, height: number) {
	const bounds = element.getBoundingClientRect();
	let left = Math.max(0, bounds.left);
	let top = Math.max(0, bounds.top);
	let right = Math.min(width, bounds.right);
	let bottom = Math.min(height, bounds.bottom);

	for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
		const style = window.getComputedStyle(parent);
		if (style.overflowX === "visible" && style.overflowY === "visible") {
			continue;
		}
		const clip = parent.getBoundingClientRect();
		if (style.overflowX !== "visible") {
			left = Math.max(left, clip.left + parent.clientLeft);
			right = Math.min(right, clip.left + parent.clientLeft + parent.clientWidth);
		}
		if (style.overflowY !== "visible") {
			top = Math.max(top, clip.top + parent.clientTop);
			bottom = Math.min(bottom, clip.top + parent.clientTop + parent.clientHeight);
		}
	}

	const rect = new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
	const hidden = rect.width === 0 || rect.height === 0 ||
		rect.width < Math.min(bounds.width, width) * 0.6 || rect.height < Math.min(bounds.height, height) * 0.6;
	return { id: element.dataset.tutorialId!, rect, hidden };
}

export function useTutorialGeometry(rootRef: RefObject<HTMLElement | null>, noteRef: RefObject<HTMLElement | null>, step: TutorialStep) {
	const [geometry, setGeometry] = useState({ width: 0, height: 0, noteWidth: 0, noteHeight: 0, targets: [] as ReturnType<typeof measureTarget>[] });

	useEffect(() => {
		const root = rootRef.current;
		const note = noteRef.current;
		if (!root || !note) {
			return;
		}
		const targets = findTutorialTargets(root, step);
		let frame = 0;
		let pointerId: number | undefined;

		function measure() {
			const width = window.innerWidth;
			const height = window.visualViewport?.height ?? window.innerHeight;
			const measured = targets.map((element) => measureTarget(element, width, height));
			const noteWidth = note?.offsetWidth ?? 0;
			const noteHeight = note?.offsetHeight ?? 0;
			setGeometry((previous) =>
				width === previous.width && height === previous.height && noteWidth === previous.noteWidth && noteHeight === previous.noteHeight &&
				measured.length === previous.targets.length && measured.every(({ id, rect, hidden }, index) => {
					const prior = previous.targets[index];
					return id === prior.id && hidden === prior.hidden && rect.x === prior.rect.x &&
						rect.y === prior.rect.y && rect.width === prior.rect.width && rect.height === prior.rect.height;
				}) ? previous : { width, height, noteWidth, noteHeight, targets: measured },
			);
		}

		function tick() {
			frame = 0;
			measure();
			if (pointerId !== undefined) {
				schedule();
			}
		}

		function schedule() {
			if (!frame) {
				frame = window.requestAnimationFrame(tick);
			}
		}

		function start(event: PointerEvent) {
			if (targets.some((target) => target.contains(event.target as Node))) {
				pointerId = event.pointerId;
				schedule();
			}
		}

		function stop(event: PointerEvent) {
			if (pointerId === event.pointerId) {
				pointerId = undefined;
				schedule();
			}
		}

		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
		for (const element of [root, note, ...targets]) {
			observer?.observe(element);
		}
		window.addEventListener("resize", schedule);
		window.visualViewport?.addEventListener("resize", schedule);
		window.addEventListener("scroll", schedule, true);
		window.addEventListener("pointerdown", start, true);
		window.addEventListener("pointerup", stop, true);
		window.addEventListener("pointercancel", stop, true);
		const first = targets[0];
		if (first) {
			const box = first.getBoundingClientRect();
			if (box.top < 12 || box.bottom > window.innerHeight - 12 || measureTarget(first, window.innerWidth, window.innerHeight).hidden) {
				first.scrollIntoView?.({ block: "center", inline: "nearest" });
			}
		}
		measure();
		return () => {
			observer?.disconnect();
			window.cancelAnimationFrame(frame);
			window.removeEventListener("resize", schedule);
			window.visualViewport?.removeEventListener("resize", schedule);
			window.removeEventListener("scroll", schedule, true);
			window.removeEventListener("pointerdown", start, true);
			window.removeEventListener("pointerup", stop, true);
			window.removeEventListener("pointercancel", stop, true);
		};
	}, [rootRef, noteRef, step]);

	return geometry;
}
