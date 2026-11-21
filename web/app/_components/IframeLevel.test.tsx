import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bridgeProtocolVersion, gameMessageSource } from "@/core/bridge";
import type { LevelResult } from "@/core/contract/types";
import { commonTexts } from "@/texts/common";
import { IframeLevel } from "./IframeLevel";

// Имитация next/link: в тестах обычный тег a.
vi.mock("next/link", () => ({
	default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

const runtime = { kind: "iframe" as const, entry: "/game-builds/city-builder/index.html", readyTimeoutSec: 10 };
const level = { id: "medium" as const, title: "Средний" };

// Отрисовывает уровень и возвращает фрейм и подменённые обработчики.
function renderLevel() {
	const onFinish = vi.fn<(result: LevelResult) => void>();
	const onExitWithoutResult = vi.fn();
	render(
		<IframeLevel
			gameId="city-builder"
			gameTitle="Город будущего"
			level={level}
			runtime={runtime}
			onFinish={onFinish}
			onExitWithoutResult={onExitWithoutResult}
		/>,
	);
	const frame = screen.getByTitle("Город будущего") as HTMLIFrameElement;
	const frameWindow = frame.contentWindow as Window;
	const postMessageSpy = vi.spyOn(frameWindow, "postMessage").mockImplementation(() => undefined);
	return { frame, frameWindow, postMessageSpy, onFinish, onExitWithoutResult };
}

// Отправляет порталу сообщение игры от имени заданного окна.
function sendFromGame(source: Window, type: string, fields: Record<string, unknown> = {}) {
	act(() => {
		window.dispatchEvent(
			new MessageEvent("message", { data: { source: gameMessageSource, version: bridgeProtocolVersion, type, ...fields }, source }),
		);
	});
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("iframe-уровень: запуск", () => {
	it("открывает сборку в изолированном фрейме с уровнем в адресе", () => {
		const { frame } = renderLevel();
		expect(frame.getAttribute("src")).toBe("/game-builds/city-builder/index.html?level=medium");
		expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
		expect(screen.getByRole("status").textContent).toContain(commonTexts.levelLoading);
	});

	it("отправляет start только после ready и передаёт фокус фрейму", () => {
		const { frame, frameWindow, postMessageSpy } = renderLevel();
		expect(postMessageSpy).not.toHaveBeenCalled();
		sendFromGame(frameWindow, "ready");
		expect(postMessageSpy).toHaveBeenCalledWith(
			{ source: "portal", version: 1, type: "start", gameId: "city-builder", levelId: "medium" },
			"*",
		);
		expect(document.activeElement).toBe(frame);
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("игнорирует сообщения из другого окна", () => {
		const { postMessageSpy } = renderLevel();
		sendFromGame(window, "ready");
		expect(postMessageSpy).not.toHaveBeenCalled();
	});
});

describe("iframe-уровень: результат", () => {
	it("передаёт результат с идентификаторами запуска и временем портала", () => {
		const { frameWindow, onFinish } = renderLevel();
		sendFromGame(frameWindow, "ready");
		vi.advanceTimersByTime(95_000);
		sendFromGame(frameWindow, "level-result", { score: 8, maxScore: 10, completed: true, gameId: "other", levelId: "hard", durationSec: 1 });
		expect(onFinish).toHaveBeenCalledWith({
			gameId: "city-builder",
			levelId: "medium",
			score: 8,
			maxScore: 10,
			completed: true,
			durationSec: 95,
		});
	});

	it("принимает только один результат за запуск", () => {
		const { frameWindow, onFinish } = renderLevel();
		sendFromGame(frameWindow, "ready");
		sendFromGame(frameWindow, "level-result", { score: 8, maxScore: 10, completed: true });
		sendFromGame(frameWindow, "level-result", { score: 10, maxScore: 10, completed: true });
		expect(onFinish).toHaveBeenCalledTimes(1);
	});

	it("не принимает результат до ready", () => {
		const { frameWindow, onFinish } = renderLevel();
		sendFromGame(frameWindow, "level-result", { score: 8, maxScore: 10, completed: true });
		expect(onFinish).not.toHaveBeenCalled();
	});
});

describe("iframe-уровень: выход, ошибка и таймаут", () => {
	it("выход без результата сообщается наверх без сохранения", () => {
		const { frameWindow, onFinish, onExitWithoutResult } = renderLevel();
		sendFromGame(frameWindow, "ready");
		sendFromGame(frameWindow, "exit");
		expect(onExitWithoutResult).toHaveBeenCalledTimes(1);
		expect(onFinish).not.toHaveBeenCalled();
	});

	it("ошибка игры показывает запасной экран, а повтор пересоздаёт фрейм", () => {
		const { frame, frameWindow } = renderLevel();
		sendFromGame(frameWindow, "ready");
		sendFromGame(frameWindow, "error", { message: "WebGL недоступен" });
		expect(screen.getByRole("heading", { name: commonTexts.levelFailedTitle })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: commonTexts.levelFailedRetry }));
		const newFrame = screen.getByTitle("Город будущего");
		expect(newFrame).not.toBe(frame);
		expect(screen.getByRole("status").textContent).toContain(commonTexts.levelLoading);
	});

	it("после первого таймаута повторяет загрузку и принимает ready от нового фрейма", () => {
		const { frame, frameWindow } = renderLevel();
		act(() => { vi.advanceTimersByTime(10_000); });
		const retriedFrame = screen.getByTitle("Город будущего") as HTMLIFrameElement;
		expect(retriedFrame).not.toBe(frame);
		expect(retriedFrame.getAttribute("src")).toContain("&retry=1");
		sendFromGame(frameWindow, "ready");
		expect(screen.getByRole("status").textContent).toContain(commonTexts.levelRetrying);
		sendFromGame(retriedFrame.contentWindow as Window, "ready");
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("после второго таймаута показывает запасной экран", () => {
		renderLevel();
		act(() => { vi.advanceTimersByTime(10_000); });
		act(() => {
			vi.advanceTimersByTime(9_999);
		});
		expect(screen.queryByRole("heading", { name: commonTexts.levelFailedTitle })).toBeNull();
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(screen.getByRole("heading", { name: commonTexts.levelFailedTitle })).toBeTruthy();
	});

	it("кнопка выхода портала ведёт в библиотеку и не сохраняет результат", () => {
		const { onFinish, onExitWithoutResult } = renderLevel();
		const exitLink = screen.getByRole("link", { name: commonTexts.levelExit });
		expect(exitLink.getAttribute("href")).toBe("/games");
		fireEvent.click(exitLink);
		expect(onFinish).not.toHaveBeenCalled();
		expect(onExitWithoutResult).not.toHaveBeenCalled();
	});
});
