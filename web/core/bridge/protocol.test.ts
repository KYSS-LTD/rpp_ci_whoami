import { describe, expect, it } from "vitest";
import { bridgeProtocolVersion, buildLevelUrl, buildStartMessage, gameMessageSource, parseGameMessage } from "./protocol";

// Сообщение игры в правильном формате с заданным типом и полями.
function gameMessage(type: string, fields: Record<string, unknown> = {}) {
	return { source: gameMessageSource, version: bridgeProtocolVersion, type, ...fields };
}

describe("разбор сообщений игры", () => {
	it("принимает ready, exit и error", () => {
		expect(parseGameMessage(gameMessage("ready"))).toEqual({ ok: true, message: { type: "ready" } });
		expect(parseGameMessage(gameMessage("exit"))).toEqual({ ok: true, message: { type: "exit" } });
		expect(parseGameMessage(gameMessage("error", { message: "нет WebGL" }))).toEqual({
			ok: true,
			message: { type: "error", message: "нет WebGL" },
		});
	});

	it("принимает level-result и не берёт из него gameId и levelId", () => {
		const parsed = parseGameMessage(gameMessage("level-result", { score: 8, maxScore: 10, completed: true, gameId: "x", levelId: "hard" }));
		expect(parsed).toEqual({ ok: true, message: { type: "level-result", score: 8, maxScore: 10, completed: true } });
	});

	it("игнорирует неизвестную версию протокола", () => {
		const parsed = parseGameMessage({ ...gameMessage("ready"), version: 2 });
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) {
			expect(parsed.reason).toContain("версия");
		}
	});

	it("игнорирует сообщения без метки и с чужой меткой", () => {
		expect(parseGameMessage({ version: bridgeProtocolVersion, type: "ready" }).ok).toBe(false);
		expect(parseGameMessage({ ...gameMessage("ready"), source: "react-devtools" }).ok).toBe(false);
		expect(parseGameMessage("ready").ok).toBe(false);
		expect(parseGameMessage(null).ok).toBe(false);
	});

	it("игнорирует неизвестный тип и level-result с неверными полями", () => {
		expect(parseGameMessage(gameMessage("pause")).ok).toBe(false);
		expect(parseGameMessage(gameMessage("level-result", { score: "8", maxScore: 10, completed: true })).ok).toBe(false);
		expect(parseGameMessage(gameMessage("level-result", { score: 8, maxScore: 10 })).ok).toBe(false);
	});
});

describe("сообщения портала", () => {
	it("сообщение о старте содержит метку, версию и идентификаторы", () => {
		expect(buildStartMessage("city-builder", "medium")).toEqual({
			source: "portal",
			version: 1,
			type: "start",
			gameId: "city-builder",
			levelId: "medium",
		});
	});

	it("адрес сборки получает параметр уровня", () => {
		expect(buildLevelUrl("/game-builds/x/index.html", "easy")).toBe("/game-builds/x/index.html?level=easy");
		expect(buildLevelUrl("/game-builds/x/index.html?lang=ru", "hard")).toBe("/game-builds/x/index.html?lang=ru&level=hard");
	});
});
