import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gamesTexts } from "@/texts/games";
import { GamePreview } from "./GamePreview";

const frames = ["/game-previews/demo/frame-1.svg", "/game-previews/demo/frame-2.svg"];

// Время показа одного кадра в GamePreview, мс.
const frameDurationMs = 4500;

// Номер активного кадра по атрибуту data-active.
function activeFrameIndex(container: HTMLElement): number {
	return Array.from(container.querySelectorAll("[data-active]")).findIndex((frame) => frame.getAttribute("data-active") === "true");
}

// Подмена matchMedia: jsdom её не реализует. reducedMotion - ответ на запрос prefers-reduced-motion: reduce.
function mockMatchMedia(reducedMotion: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			matches: reducedMotion && query.includes("prefers-reduced-motion: reduce"),
			media: query,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
		})),
	);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("превью игры в карточке", () => {
	it("кадры сменяются сами через время показа кадра", () => {
		mockMatchMedia(false);
		const { container } = render(<GamePreview frames={frames} title="Демо" variant="stage" />);
		expect(activeFrameIndex(container)).toBe(0);
		act(() => {
			vi.advanceTimersByTime(frameDurationMs);
		});
		expect(activeFrameIndex(container)).toBe(1);
		act(() => {
			vi.advanceTimersByTime(frameDurationMs);
		});
		expect(activeFrameIndex(container)).toBe(0);
	});

	it("кадр переключается точкой под превью", () => {
		mockMatchMedia(false);
		const { container } = render(<GamePreview frames={frames} title="Демо" variant="stage" />);
		const secondDot = screen.getByRole("button", { name: `${gamesTexts.previewFrameLabel} 2` });
		fireEvent.click(secondDot);
		expect(activeFrameIndex(container)).toBe(1);
		expect(secondDot.getAttribute("aria-pressed")).toBe("true");
	});

	it("при уменьшении движения кадры не сменяются сами", () => {
		mockMatchMedia(true);
		const { container } = render(<GamePreview frames={frames} title="Демо" variant="stage" />);
		act(() => {
			vi.advanceTimersByTime(frameDurationMs * 3);
		});
		expect(activeFrameIndex(container)).toBe(0);
		fireEvent.click(screen.getByRole("button", { name: `${gamesTexts.previewFrameLabel} 2` }));
		expect(activeFrameIndex(container)).toBe(1);
	});

	it("без кадров показывает обложку-заглушку с названием игры", () => {
		mockMatchMedia(false);
		const { container } = render(<GamePreview frames={[]} title="Демо" variant="stage" />);
		expect(screen.getByRole("img", { name: "Демо" })).toBeTruthy();
		expect(container.querySelector("[data-active]")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
	});
});
