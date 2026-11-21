import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requiredLevelIds } from "@/core/contract/types";
import { validateManifest } from "@/core/contract/validate";
import { computeProfessionScores } from "@/core/analysis";
import { debugLog } from "@/core/debug";
import { gameRegistry } from "@/core/registry";
import { platformStorage, storageKeys } from "@/core/storage";
import { professionNames } from "@/texts/professions";
import { LevelRunner } from "@/app/_components/LevelRunner";
import { accountantGameModule } from "./index";
import { accountantManifest } from "./manifest";
import { AccountantLevel } from "./levels/AccountantLevel";
import { accountantTexts } from "./texts";

// Папка игры: тест запускается из папки web (npm run test).
const gameDirectory = resolve(process.cwd(), "games/accountant-1c");

// Все файлы исходников игры, кроме текстов и тестов.
function listSourceFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory)) {
		const fullPath = join(directory, entry);
		if (statSync(fullPath).isDirectory()) {
			if (entry !== "texts") {
				files.push(...listSourceFiles(fullPath));
			}
		} else if ([".ts", ".tsx", ".css"].includes(extname(entry)) && !entry.includes(".test.")) {
			files.push(fullPath);
		}
	}
	return files;
}

// Убирает комментарии, чтобы искать русский текст только в коде и строках.
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

afterEach(() => {
	cleanup();
	window.localStorage.clear();
});

describe("регистрация игры «Закрытие квартала»", () => {
	it("манифест валиден и все поля заполнены", () => {
		expect(validateManifest(accountantManifest).ok).toBe(true);
		expect(accountantManifest.gameId).toBe("accountant-1c");
		expect(accountantManifest.format).toBe("simulation");
		expect(accountantManifest.levels.map((level) => level.id)).toEqual([...requiredLevelIds]);
		expect(accountantManifest.levels.every((level) => level.title.length > 0)).toBe(true);
		expect(accountantManifest.professionTags).toEqual([
			{ professionId: "accountant", weight: 1.0 },
			{ professionId: "analyst", weight: 0.4 },
		]);
		expect(accountantManifest.preview?.frames).toEqual([
			"/game-previews/accountant-1c/frame-1.svg",
			"/game-previews/accountant-1c/frame-2.svg",
		]);
		expect(accountantManifest.estimatedMinutes).toBeGreaterThan(0);
		expect(accountantManifest.summary).toBeTruthy();
		expect(accountantManifest.inDevelopment).toBeUndefined();
	});

	it("кадры превью лежат в public", () => {
		for (const frame of accountantManifest.preview?.frames ?? []) {
			expect(statSync(resolve(process.cwd(), `public${frame}`)).isFile()).toBe(true);
		}
	});

	it("профессия accountant называется «Бухгалтер 1С»", () => {
		expect(professionNames.accountant).toBe("Бухгалтер 1С");
	});

	it("реестр находит игру по gameId", () => {
		const game = gameRegistry.games.find((registered) => registered.manifest.gameId === "accountant-1c");
		expect(game).toBeDefined();
		expect(game?.module).toBe(accountantGameModule);
	});

	it("один компонент уровня на все три уровня", () => {
		for (const levelId of requiredLevelIds) {
			expect(accountantGameModule.levelComponents?.[levelId]).toBe(AccountantLevel);
		}
	});

	it("название игры в texts совпадает с манифестом", () => {
		expect(accountantManifest.title).toBe(accountantTexts.title);
		expect(accountantManifest.title).toBe("Закрытие квартала");
		expect(accountantManifest.levels.map((level) => level.title)).toEqual([
			accountantTexts.levelTitles.easy,
			accountantTexts.levelTitles.medium,
			accountantTexts.levelTitles.hard,
		]);
	});

	it("завершённый уровень попадает в анализ профессий с весами accountant 1.0 и analyst 0.4", () => {
		const scores = computeProfessionScores(
			[accountantManifest],
			[{ gameId: "accountant-1c", levelId: "easy", score: 16, maxScore: 20, completed: true, durationSec: 200 }],
			{ "accountant-1c": 5 },
		);
		const byProfession = Object.fromEntries((scores ?? []).map((score) => [score.professionId, score.score]));
		expect(Object.keys(byProfession).sort()).toEqual(["accountant", "analyst"]);
		expect(byProfession.accountant).toBeCloseTo(0.8);
	});
});

describe("LevelRunner запускает игру", () => {
	beforeEach(() => {
		platformStorage.write(storageKeys.playerName, "Тестер");
	});

	it.each(requiredLevelIds)("уровень %s показывает вступление в окне программы", (levelId) => {
		render(<LevelRunner gameId="accountant-1c" levelId={levelId} />);
		expect(screen.getByRole("heading", { name: accountantTexts.intros[levelId].subject })).toBeTruthy();
		expect(screen.getByText(accountantTexts.window.appTitle)).toBeTruthy();
	});

	it("досрочный выход сохраняется порталом как незавершённый уровень", () => {
		render(<LevelRunner gameId="accountant-1c" levelId="easy" />);
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.window.exitEarly }));
		const saved = platformStorage.read<Array<{ gameId: string; completed: boolean; score: number }>>(storageKeys.levelResults, []);
		expect(saved).toEqual([expect.objectContaining({ gameId: "accountant-1c", completed: false, score: 0 })]);
	});
});

describe("тексты и код игры", () => {
	it("в модулях игры нет русских строк вне texts/", () => {
		const offenders: string[] = [];
		for (const filePath of listSourceFiles(gameDirectory)) {
			const code = stripComments(readFileSync(filePath, "utf8"));
			code.split("\n").forEach((line, index) => {
				// Текст отладки можно не выносить в тексты (CodeStyle.md, п.7).
				if (/[А-Яа-яЁё]/.test(line) && !line.includes("debugLog(")) {
					offenders.push(`${relative(gameDirectory, filePath)}:${index + 1}: ${line.trim()}`);
				}
			});
		}
		expect(offenders).toEqual([]);
	});

	it("в текстах нет длинного и короткого тире", () => {
		const source = readFileSync(join(gameDirectory, "texts/index.ts"), "utf8");
		expect(source).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`));
	});

	it("интерфейс не называет чужую учётную программу", () => {
		const serialized = JSON.stringify(accountantTexts);
		expect(serialized).not.toMatch(/1С:Предприятие|1C:Enterprise/);
		// Название профессии с "1С" живёт только в texts/professions, внутри игры его нет.
		expect(serialized).not.toMatch(/1С|1C/);
	});
});

describe("режим отладки", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("при NEXT_PUBLIC_DEBUG=true игра пишет подробный журнал", () => {
		vi.stubEnv("NEXT_PUBLIC_DEBUG", "true");
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		const onFinish = vi.fn();
		render(<AccountantLevel level={accountantManifest.levels[0]} onFinish={onFinish} />);
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.start }));
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.window.exitEarly }));
		expect(debugSpy).toHaveBeenCalledWith("[debug:accountant-1c]", "фаза", "easy", "gameA");
		expect(debugSpy).toHaveBeenCalledWith("[debug:accountant-1c]", "результат уровня", expect.objectContaining({ completed: false }));
	});

	it("при выключенной отладке логов нет", () => {
		vi.stubEnv("NEXT_PUBLIC_DEBUG", "false");
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
		render(<AccountantLevel level={accountantManifest.levels[0]} onFinish={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.start }));
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.window.exitEarly }));
		debugLog("accountant-1c", "проверка");
		expect(debugSpy).not.toHaveBeenCalled();
	});
});
