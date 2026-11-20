import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseGameMessage } from "@/core/bridge";

// Текст скрипта SDK. Тест запускается из папки web (npm run test).
const bridgeSource = readFileSync(resolve(process.cwd(), "sdk/web/portal-bridge.js"), "utf8");

interface FakeBridge {
	isEmbedded: boolean;
	getLevelId: () => string;
	onStart: (callback: (start: { gameId: string; levelId: string }) => void) => void;
	finish: (result: { score: number; maxScore: number; completed?: boolean }) => boolean;
	exit: () => void;
	reportError: (message: string) => void;
}

// Поддельное окно игры: родитель с подменённым postMessage и ручная доставка событий message.
function loadBridge({ embedded = true, search = "?level=hard" } = {}) {
	const parentPostMessage = vi.fn();
	const listeners: Array<(event: { data: unknown; source: unknown }) => void> = [];
	const fakeWindow: Record<string, unknown> = {
		location: { search },
		addEventListener: (type: string, listener: (event: { data: unknown; source: unknown }) => void) => {
			if (type === "message") {
				listeners.push(listener);
			}
		},
	};
	fakeWindow.parent = embedded ? { postMessage: parentPostMessage } : fakeWindow;
	new Function("window", bridgeSource)(fakeWindow);
	const deliver = (data: unknown, source: unknown = fakeWindow.parent) => listeners.forEach((listener) => listener({ data, source }));
	return { bridge: fakeWindow.PortalBridge as FakeBridge, parentPostMessage, deliver };
}

// Сообщения, которые SDK отправил порталу.
function sentMessages(parentPostMessage: ReturnType<typeof vi.fn>) {
	return parentPostMessage.mock.calls.map((call) => call[0]);
}

describe("веб-SDK моста", () => {
	it("первый onStart отправляет ready, которое понимает портал", () => {
		const { bridge, parentPostMessage } = loadBridge();
		bridge.onStart(() => undefined);
		const [readyMessage] = sentMessages(parentPostMessage);
		expect(parseGameMessage(readyMessage)).toEqual({ ok: true, message: { type: "ready" } });
		expect(parentPostMessage.mock.calls[0][1]).toBe("*");
	});

	it("передаёт игре старт только от портала", () => {
		const { bridge, deliver } = loadBridge();
		const onStart = vi.fn();
		bridge.onStart(onStart);
		deliver({ source: "portal", version: 1, type: "start", gameId: "city-builder", levelId: "medium" }, { postMessage: vi.fn() });
		deliver({ source: "portal", version: 2, type: "start", gameId: "city-builder", levelId: "medium" });
		expect(onStart).not.toHaveBeenCalled();
		deliver({ source: "portal", version: 1, type: "start", gameId: "city-builder", levelId: "medium" });
		expect(onStart).toHaveBeenCalledWith({ gameId: "city-builder", levelId: "medium" });
	});

	it("finish отправляет level-result в формате протокола и только один раз", () => {
		const { bridge, parentPostMessage } = loadBridge();
		expect(bridge.finish({ score: 8, maxScore: 10 })).toBe(true);
		expect(bridge.finish({ score: 10, maxScore: 10 })).toBe(false);
		const resultMessages = sentMessages(parentPostMessage).filter((message) => message.type === "level-result");
		expect(resultMessages).toHaveLength(1);
		expect(parseGameMessage(resultMessages[0])).toEqual({
			ok: true,
			message: { type: "level-result", score: 8, maxScore: 10, completed: true },
		});
	});

	it("finish не отправляет неверный результат", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { bridge, parentPostMessage } = loadBridge();
		expect(bridge.finish({ score: 15, maxScore: 3 })).toBe(false);
		expect(sentMessages(parentPostMessage)).toEqual([]);
		errorSpy.mockRestore();
	});

	it("exit и reportError отправляют сообщения, которые понимает портал", () => {
		const { bridge, parentPostMessage } = loadBridge();
		bridge.reportError("нет WebGL");
		bridge.exit();
		const parsed = sentMessages(parentPostMessage).map((message) => parseGameMessage(message));
		expect(parsed).toEqual([
			{ ok: true, message: { type: "error", message: "нет WebGL" } },
			{ ok: true, message: { type: "exit" } },
		]);
	});

	it("без портала работает автономно: уровень из адреса, старт сразу", () => {
		const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
		const { bridge } = loadBridge({ embedded: false, search: "?level=medium" });
		const onStart = vi.fn();
		bridge.onStart(onStart);
		expect(bridge.isEmbedded).toBe(false);
		expect(onStart).toHaveBeenCalledWith({ gameId: "standalone", levelId: "medium" });
		expect(bridge.getLevelId()).toBe("medium");
		infoSpy.mockRestore();
	});
});
