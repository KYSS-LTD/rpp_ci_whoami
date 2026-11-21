import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformStorage, storageKeys } from "@/core/storage";
import { bridgeProtocolVersion, gameMessageSource } from "@/core/bridge";
import { commonTexts } from "@/texts/common";
import { diplomasTexts } from "@/texts/diplomas";
import { LevelRunner } from "./LevelRunner";

// Тестовая игра с одним компонентом уровня, который сразу сообщает результат.
vi.mock("@/core/registry", () => {
	const FakeLevel = ({ level, onFinish }: { level: { id: string }; onFinish: (result: unknown) => void }) => (
		<button
			type="button"
			onClick={() =>
				onFinish({ gameId: "demo", levelId: level.id, score: 8, maxScore: 10, completed: true, durationSec: 30 })
			}
		>
			Завершить уровень
		</button>
	);
	// Игра с ошибкой: сообщает очки больше максимума и результат для чужого уровня.
	const BrokenLevel = ({ level, onFinish }: { level: { id: string }; onFinish: (result: unknown) => void }) => (
		<>
			<button
				type="button"
				onClick={() => onFinish({ gameId: "broken", levelId: level.id, score: 15, maxScore: 3, completed: true, durationSec: 5 })}
			>
				Неверный результат
			</button>
			<button
				type="button"
				onClick={() => onFinish({ gameId: "broken", levelId: "hard", score: 1, maxScore: 3, completed: true, durationSec: 5 })}
			>
				Чужой уровень
			</button>
		</>
	);
	// Игра, которая падает, пока тест держит флаг shouldCrashLevel. React сам повторяет отрисовку один раз,
	// поэтому сбой должен повторяться, а не случаться однократно.
	const CrashingLevel = () => {
		if ((globalThis as { shouldCrashLevel?: boolean }).shouldCrashLevel) {
			throw new Error("Сбой отрисовки уровня");
		}
		return <p>Уровень после повтора</p>;
	};
	const levels = [
		{ id: "easy", title: "Лёгкий" },
		{ id: "medium", title: "Средний" },
		{ id: "hard", title: "Сложный" },
	];
	return {
		gameRegistry: {
			games: [
				{
					manifest: {
						gameId: "uav-operator",
						title: "Оператор БПЛА",
						levels,
						runtime: { kind: "iframe", entry: "/game-builds/uav-operator/index.html" },
					},
					module: { manifest: {} },
				},
				{
					manifest: {
						gameId: "frame-game",
						title: "Игра во фрейме",
						description: "",
						contractVersion: 1,
						levels,
						professionTags: [],
						runtime: { kind: "iframe", entry: "/game-builds/frame-game/index.html" },
					},
					module: { manifest: {} },
				},
				{
					manifest: { gameId: "crashing", title: "Падающая", description: "", contractVersion: 1, levels, professionTags: [] },
					module: { manifest: {}, levelComponents: { easy: CrashingLevel, medium: CrashingLevel, hard: CrashingLevel } },
				},
				{
					manifest: { gameId: "broken", title: "Сломанная", description: "", contractVersion: 1, levels, professionTags: [] },
					module: { manifest: {}, levelComponents: { easy: BrokenLevel, medium: BrokenLevel, hard: BrokenLevel } },
				},
				{
					manifest: {
						gameId: "demo",
						title: "Демо",
						description: "",
						contractVersion: 1,
						levels: [
							{ id: "easy", title: "Лёгкий" },
							{ id: "medium", title: "Средний" },
							{ id: "hard", title: "Сложный" },
						],
						professionTags: [],
					},
					module: { manifest: {}, levelComponents: { easy: FakeLevel, medium: FakeLevel, hard: FakeLevel } },
				},
			],
			rejected: [],
		},
	};
});

describe("запуск уровня и ввод имени", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		platformStorage.write(storageKeys.playerName, "");
	});

	afterEach(() => {
		cleanup();
	});

	it("сразу запускает уровень и запрашивает ФИО на экране результата", () => {
		render(<LevelRunner gameId="demo" levelId="easy" />);
		expect(screen.queryByLabelText(diplomasTexts.result.name)).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Завершить уровень" }));
		expect(screen.getByLabelText(diplomasTexts.result.name)).toBeTruthy();
		expect(screen.getByText(diplomasTexts.ratings.gold)).toBeTruthy();
		expect(platformStorage.read(storageKeys.playerName, "")).toBe("");
		expect(platformStorage.read<unknown[]>(storageKeys.diplomas, [])).toEqual([]);
	});

	it("после завершения уровня сохраняет результат", () => {
		platformStorage.write(storageKeys.playerName, "Анна");
		render(<LevelRunner gameId="demo" levelId="hard" />);
		fireEvent.click(screen.getByRole("button", { name: "Завершить уровень" }));
		expect(screen.getByRole("heading", { name: commonTexts.levelCompletedTitle })).toBeTruthy();
		expect(platformStorage.read<unknown[]>(storageKeys.levelResults, [])).toHaveLength(1);
	});

	it("неизвестный уровень показывает страницу не найдено", () => {
		platformStorage.write(storageKeys.playerName, "Анна");
		render(<LevelRunner gameId="demo" levelId="expert" />);
		expect(screen.getByRole("heading", { name: commonTexts.notFoundTitle })).toBeTruthy();
	});
});

describe("проверка результата в запуске уровня", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		platformStorage.write(storageKeys.playerName, "Анна");
	});

	afterEach(() => {
		cleanup();
	});

	it("неверный результат не сохраняется и показывает сообщение", () => {
		render(<LevelRunner gameId="broken" levelId="easy" />);
		fireEvent.click(screen.getByRole("button", { name: "Неверный результат" }));
		expect(screen.getByRole("heading", { name: commonTexts.levelRejectedTitle })).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toBe(commonTexts.levelRejectedBody);
		expect(platformStorage.read<unknown[]>(storageKeys.levelResults, [])).toEqual([]);
		expect(platformStorage.read<unknown[]>(storageKeys.diplomas, [])).toEqual([]);
	});

	it("результат для другого уровня не сохраняется", () => {
		render(<LevelRunner gameId="broken" levelId="easy" />);
		fireEvent.click(screen.getByRole("button", { name: "Чужой уровень" }));
		expect(platformStorage.read<unknown[]>(storageKeys.levelResults, [])).toEqual([]);
		expect(screen.getByRole("button", { name: "Чужой уровень" })).toBeTruthy();
	});
});

describe("сбой уровня React-игры", () => {
	beforeEach(() => {
		platformStorage.write(storageKeys.playerName, "Анна");
	});

	afterEach(() => {
		cleanup();
	});

	it("исключение при отрисовке даёт запасной экран, а повтор монтирует уровень заново", () => {
		// React пишет перехваченную ошибку в console.error, в тесте это ожидаемо.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const crashFlag = globalThis as { shouldCrashLevel?: boolean };
		crashFlag.shouldCrashLevel = true;
		render(<LevelRunner gameId="crashing" levelId="easy" />);
		expect(screen.getByRole("heading", { name: commonTexts.levelFailedTitle })).toBeTruthy();
		crashFlag.shouldCrashLevel = false;
		fireEvent.click(screen.getByRole("button", { name: commonTexts.levelFailedRetry }));
		expect(screen.getByText("Уровень после повтора")).toBeTruthy();
		errorSpy.mockRestore();
	});
});

describe("запуск iframe-игры", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		platformStorage.write(storageKeys.playerName, "Анна");
	});

	afterEach(() => {
		cleanup();
	});

	it("игра с runtime без компонентов уровней показывает фрейм сборки", () => {
		render(<LevelRunner gameId="frame-game" levelId="easy" />);
		const frame = screen.getByTitle("Игра во фрейме");
		expect(frame.getAttribute("src")).toBe("/game-builds/frame-game/index.html?level=easy");
		expect(screen.queryByText(commonTexts.levelMissingComponent)).toBeNull();
	});

	it.each([
		{ activity: "race", award: "gate-streak" },
		{ activity: "field", award: "field-explorer" },
		{ activity: "beach", award: null },
	])("завершённый свободный полёт ($activity) показывает диплом и сохраняет результат", ({ activity, award }) => {
		render(<LevelRunner gameId="uav-operator" levelId="free" />);
		const frameWindow = (screen.getByTitle("Оператор БПЛА") as HTMLIFrameElement).contentWindow as Window;
		vi.spyOn(frameWindow, "postMessage").mockImplementation(() => undefined);
		for (const message of [
			{ type: "ready" },
			{ type: "practice-result", activity, difficulty: null, score: 88, completed: true, durationSec: 29 },
		]) {
			act(() => {
				window.dispatchEvent(new MessageEvent("message", {
					source: frameWindow,
					data: { source: gameMessageSource, version: bridgeProtocolVersion, ...message },
				}));
			});
		}
		expect(screen.getByRole("heading", { name: commonTexts.levelCompletedTitle })).toBeTruthy();
		expect(screen.getByLabelText(diplomasTexts.result.name)).toBeTruthy();
		expect(platformStorage.read<unknown[]>(storageKeys.levelResults, [])).toEqual([]);
		expect(platformStorage.read<unknown[]>(storageKeys.practiceResults, [])).toEqual([
			expect.objectContaining({ activity, score: 88, completed: true, durationSec: 29 }),
		]);
		expect(platformStorage.read<{ id: string }[]>(storageKeys.achievements, []).map(({ id }) => id)).toEqual(award ? [award] : []);
	});

	it("выход из игры без результата показывает экран незавершённого уровня и ничего не сохраняет", () => {
		render(<LevelRunner gameId="frame-game" levelId="easy" />);
		const frameWindow = (screen.getByTitle("Игра во фрейме") as HTMLIFrameElement).contentWindow as Window;
		vi.spyOn(frameWindow, "postMessage").mockImplementation(() => undefined);
		for (const type of ["ready", "exit"]) {
			act(() => {
				window.dispatchEvent(
					new MessageEvent("message", { data: { source: gameMessageSource, version: bridgeProtocolVersion, type }, source: frameWindow }),
				);
			});
		}
		expect(screen.getByRole("heading", { name: commonTexts.levelAbandonedTitle })).toBeTruthy();
		expect(screen.getByText(commonTexts.levelExitedBody)).toBeTruthy();
		expect(platformStorage.read<unknown[]>(storageKeys.levelResults, [])).toEqual([]);
	});

	it("результат iframe-игры сохраняется через общую проверку", () => {
		render(<LevelRunner gameId="frame-game" levelId="easy" />);
		const frameWindow = (screen.getByTitle("Игра во фрейме") as HTMLIFrameElement).contentWindow as Window;
		vi.spyOn(frameWindow, "postMessage").mockImplementation(() => undefined);
		const messages = [{ type: "ready" }, { type: "level-result", score: 3, maxScore: 3, completed: true }];
		for (const message of messages) {
			act(() => {
				window.dispatchEvent(
					new MessageEvent("message", {
						data: { source: gameMessageSource, version: bridgeProtocolVersion, ...message },
						source: frameWindow,
					}),
				);
			});
		}
		expect(screen.getByRole("heading", { name: commonTexts.levelCompletedTitle })).toBeTruthy();
		expect(platformStorage.read<unknown[]>(storageKeys.levelResults, [])).toEqual([
			expect.objectContaining({ gameId: "frame-game", levelId: "easy", score: 3, maxScore: 3, completed: true }),
		]);
	});
});
