// @vitest-environment node
// Тесты списка моделей (задача 1.6): все файлы из списка лежат в public/models, glTF ссылаются на существующие .bin и атлас,
// каждой паре предмета, блюду и ящику сопоставлена модель из списка, а тестовый уровень использует только модели списка.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DISH_IDS, ITEM_CATALOG } from "../contracts";
import { createTestLevel } from "../sim/testing/testLevel";
import {
	ATLAS_FILE_NAME,
	assetModelNames,
	coreModelNames,
	crateModelNames,
	dishModelNames,
	getAssetFileNames,
	getItemModelName,
	getModelUrl,
	reserveModelNames,
	stationBaseModelNames,
	stationTopModelNames,
} from "./assets";

// Папка моделей игры: web/game-src/cooking/public/models.
const modelsDirectory = fileURLToPath(new URL("../../public/models/", import.meta.url));

// Читает .gltf как JSON.
function readGltf(modelName: string): { buffers: { uri: string }[]; images?: { uri: string }[] } {
	return JSON.parse(readFileSync(join(modelsDirectory, `${modelName}.gltf`), "utf8"));
}

describe("список моделей игры", () => {
	it("все файлы из списка существуют", () => {
		const missing = getAssetFileNames().filter((fileName) => !existsSync(join(modelsDirectory, fileName)));
		expect(missing).toEqual([]);
	});

	it("в списке нет повторов, основные и запасные модели не пересекаются", () => {
		expect(new Set(assetModelNames).size).toBe(assetModelNames.length);
		const reserve = new Set<string>(reserveModelNames);
		expect(coreModelNames.filter((name) => reserve.has(name))).toEqual([]);
	});

	it("каждый glTF ссылается на существующий .bin и общий атлас", () => {
		for (const modelName of assetModelNames) {
			const gltf = readGltf(modelName);
			expect(gltf.buffers.map((buffer) => buffer.uri)).toEqual([`${modelName}.bin`]);
			for (const image of gltf.images ?? []) {
				expect(image.uri).toBe(ATLAS_FILE_NAME);
			}
		}
	});

	it("адрес модели относительный", () => {
		expect(getModelUrl("wall")).toBe("models/wall.gltf");
	});

	it("рядом с моделями лежит заметка о лицензии пака", () => {
		expect(existsSync(join(modelsDirectory, "LICENSE-NOTE.txt"))).toBe(true);
	});
});

describe("сопоставление игровых сущностей моделям", () => {
	const known = new Set<string>(assetModelNames);

	it("каждой паре ITEM_CATALOG соответствует модель из списка", () => {
		for (const spec of ITEM_CATALOG) {
			const modelName = getItemModelName(spec);
			expect(modelName, `${spec.kind}:${spec.state}`).not.toBeNull();
			expect(known.has(modelName as string)).toBe(true);
		}
	});

	it("для пары вне каталога модели нет", () => {
		expect(getItemModelName({ kind: "steak", state: "burnt" })).toBeNull();
	});

	it("у каждого блюда, ящика и станции модель из списка", () => {
		for (const dish of DISH_IDS) {
			expect(known.has(dishModelNames[dish])).toBe(true);
		}
		for (const modelName of Object.values(crateModelNames)) {
			expect(known.has(modelName)).toBe(true);
		}
		for (const modelName of Object.values(stationBaseModelNames)) {
			if (modelName !== null) {
				expect(known.has(modelName)).toBe(true);
			}
		}
		for (const modelName of Object.values(stationTopModelNames)) {
			expect(known.has(modelName)).toBe(true);
		}
	});

	it("тестовый уровень использует только модели из списка", () => {
		const level = createTestLevel();
		const used = new Set<string>();
		level.props.forEach((prop) => prop.model !== null && used.add(prop.model));
		level.stations.forEach((station) => station.model !== undefined && used.add(station.model));
		level.tables.forEach((table) => {
			used.add(table.model);
			table.seats.forEach((seat) => used.add(seat.chairModel));
		});
		const unknown = [...used].filter((name) => !known.has(name));
		expect(unknown).toEqual([]);
	});
});
