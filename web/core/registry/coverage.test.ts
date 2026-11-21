import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gameRegistry } from "./index";

// Папка games/ в корне web. Каждая папка игры должна быть подключена в реестр.
// Тест запускается из папки web (npm run test), поэтому путь берется от текущей папки.
const gamesDirectory = resolve(process.cwd(), "games");

// Возвращает имена папок игр, пропуская файлы вроде index.ts.
function listGameFolders(): string[] {
	return readdirSync(gamesDirectory).filter((entry) => statSync(join(gamesDirectory, entry)).isDirectory());
}

describe("покрытие реестра", () => {
	it("все игры подключены, демопримеры исключены", () => {
		const registeredIds = gameRegistry.games.map((game) => game.manifest.gameId);
		const examples = ["demo", "city-builder", "pixel-lab"];
		expect(registeredIds.filter((id) => examples.includes(id))).toEqual([]);
		const notRegistered = listGameFolders().filter((folder) => !examples.includes(folder)).filter((folderName) => !registeredIds.includes(folderName));
		expect(notRegistered).toEqual([]);
	});
});
