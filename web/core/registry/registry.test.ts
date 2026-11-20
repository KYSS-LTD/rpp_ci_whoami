import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRegistry } from "./registry";
import { supportedContractVersion } from "../contract/types";

function createManifest(gameId: string, overrides: Record<string, unknown> = {}) {
	return {
		gameId,
		title: `Игра ${gameId}`,
		description: "Описание",
		contractVersion: supportedContractVersion,
		levels: [
			{ id: "easy", title: "Лёгкий" },
			{ id: "medium", title: "Средний" },
			{ id: "hard", title: "Сложный" },
		],
		professionTags: [],
		...overrides,
	};
}

describe("реестр игр", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it("невалидная игра не попадает в список и причина записана в журнал", () => {
		const result = buildRegistry([{ manifest: createManifest("broken", { gameId: "" }) }, { manifest: createManifest("good") }]);
		expect(result.games.map((game) => game.manifest.gameId)).toEqual(["good"]);
		expect(result.rejected).toHaveLength(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("отсутствует gameId"));
	});

	it("повторный gameId отбрасывается второй игра", () => {
		const result = buildRegistry([{ manifest: createManifest("dup") }, { manifest: createManifest("dup") }]);
		expect(result.games).toHaveLength(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("повторный gameId: dup"));
	});

	it("игра с несовместимой версией контракта не регистрируется", () => {
		const result = buildRegistry([{ manifest: createManifest("old", { contractVersion: 0 }) }]);
		expect(result.games).toHaveLength(0);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("несовместимая версия контракта"));
	});

	it("iframe-игра регистрируется без компонентов уровней", () => {
		const result = buildRegistry([
			{ manifest: createManifest("unity-game", { runtime: { kind: "iframe", entry: "/game-builds/unity-game/index.html" } }) },
		]);
		expect(result.games.map((game) => game.manifest.gameId)).toEqual(["unity-game"]);
		expect("levelComponents" in result.games[0].module).toBe(false);
	});

	it("iframe-игра со сборкой вне своей папки не регистрируется", () => {
		const result = buildRegistry([
			{ manifest: createManifest("unity-game", { runtime: { kind: "iframe", entry: "https://example.com/index.html" } }) },
		]);
		expect(result.games).toHaveLength(0);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("путь к сборке должен вести внутрь /game-builds/unity-game/"));
	});
});
