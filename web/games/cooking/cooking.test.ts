import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateManifest } from "@/core/contract/validate";
import { gameRegistry } from "@/core/registry";
import { professionNames } from "@/texts/professions";
import { cookingGameModule } from "./index";
import { cookingManifest } from "./manifest";

// Папка public портала: тест запускается из папки web (npm run test).
const publicDirectory = resolve(process.cwd(), "public");

// Размеры изображения WebP по заголовку (форматы VP8, VP8L и VP8X): для проверки пропорций кадров без внешних библиотек.
function readWebpSize(filePath: string): { width: number; height: number } {
	const bytes = readFileSync(filePath);
	expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
	expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
	const chunk = bytes.toString("ascii", 12, 16);
	if (chunk === "VP8X") {
		return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
	}
	if (chunk === "VP8L") {
		const packed = bytes.readUInt32LE(21);
		return { width: 1 + (packed & 0x3fff), height: 1 + ((packed >> 14) & 0x3fff) };
	}
	return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

describe("манифест игры cooking", () => {
	it("проходит валидацию реестра", () => {
		const validation = validateManifest(cookingManifest);
		expect(validation.ok).toBe(true);
	});

	it("сценарий 'Игра регистрируется': в реестре три уровня, кадры превью и сборка во фрейме без компонентов уровней", () => {
		const registered = gameRegistry.games.find((game) => game.manifest.gameId === "cooking");
		expect(registered).toBeDefined();
		expect(registered?.manifest.levels.map((level) => level.id)).toEqual(["easy", "medium", "hard"]);
		expect(registered?.manifest.format).toBe("3d");
		expect(registered?.manifest.preview?.frames.length).toBeGreaterThanOrEqual(2);
		expect("levelComponents" in cookingGameModule).toBe(false);
	});

	it("кадры превью существуют в public", () => {
		for (const frame of cookingManifest.preview?.frames ?? []) {
			expect(existsSync(resolve(publicDirectory, frame.replace(/^\//, ""))), frame).toBe(true);
		}
	});

	it("кадры превью сняты из игры: WebP в пропорции 16:10 (1280x800), не временные SVG", () => {
		const frames = cookingManifest.preview?.frames ?? [];
		expect(frames.length).toBeGreaterThanOrEqual(2);
		for (const frame of frames) {
			expect(frame.endsWith(".webp"), frame).toBe(true);
			const size = readWebpSize(resolve(publicDirectory, frame.replace(/^\//, "")));
			expect(size.width / size.height, frame).toBeCloseTo(16 / 10, 5);
			expect(size.width, frame).toBeGreaterThanOrEqual(1280);
		}
	});

	it("сборка во фрейме лежит внутри /game-builds/cooking/ и ждёт готовность 60 секунд", () => {
		expect(cookingManifest.runtime?.kind).toBe("iframe");
		expect(cookingManifest.runtime?.entry.startsWith("/game-builds/cooking/")).toBe(true);
		expect(cookingManifest.runtime?.entry).toBe("/game-builds/cooking/index.html");
		expect(cookingManifest.runtime?.readyTimeoutSec).toBe(60);
	});

	it("сценарий 'Тег профессии в манифесте': ровно один тег cook с весом 1", () => {
		expect(cookingManifest.professionTags).toEqual([{ professionId: "cook", weight: 1 }]);
	});

	it("название профессии 'Повар' задано в текстах портала", () => {
		expect(professionNames.cook).toBe("Повар");
	});
});
