import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { storageKeys, platformStorage } from "@/core/storage";
import { hasCheckpoint, writeCheckpoint } from "@/core/progress/checkpoints";
import { commonTexts } from "@/texts/common";
import { gamesTexts } from "@/texts/games";
import { landingTexts } from "@/texts/landing";
import LandingPage from "../page";
import { GamesList } from "./GamesList";
import { NameForm } from "./NameForm";
import { SiteHeader } from "./SiteHeader";
import { StorageWarning } from "./StorageWarning";
import type { GameManifest } from "@/core/contract/types";

// В jsdom нет нативного верхнего слоя диалогов.
beforeEach(() => {
	Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
		configurable: true, value(this: HTMLDialogElement) { this.open = true; },
	});
	Object.defineProperty(HTMLDialogElement.prototype, "close", {
		configurable: true, value(this: HTMLDialogElement) { this.open = false; },
	});
});

afterEach(() => {
	cleanup();
});

// Имитация next/link: в тестах обычный тег a.
vi.mock("next/link", () => ({
	default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
	...await importOriginal<typeof import("next/navigation")>(),
	useRouter: () => router,
}));

const demoGame: GameManifest = {
	gameId: "demo",
	title: "Демо",
	description: "Демонстрационная игра",
	contractVersion: 1,
	levels: [
		{ id: "easy", title: "Лёгкий" },
		{ id: "medium", title: "Средний" },
		{ id: "hard", title: "Сложный" },
	],
	professionTags: [],
};

describe("лендинг", () => {
	it("показывает описание и кнопку перехода к играм", () => {
		render(<LandingPage />);
		expect(screen.getByRole("heading", { level: 1, name: landingTexts.heading })).toBeTruthy();
		expect(screen.getByRole("link", { name: landingTexts.gamesButton }).getAttribute("href")).toBe("/games");
	});
});

describe("экран игр", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		router.push.mockClear();
	});

	it("при пустом реестре показывает пустое состояние", () => {
		render(<GamesList games={[]} />);
		expect(screen.getByText("Игр пока нет")).toBeTruthy();
	});

	it("при одной игре показывает карточку, а по кнопке Играть три уровня", () => {
		render(<GamesList games={[demoGame]} />);
		expect(screen.getByRole("heading", { level: 2, name: "Демо" })).toBeTruthy();
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		expect(screen.getByRole("dialog", { name: "Демо" })).toBeTruthy();
		expect(screen.getByText("Лёгкий")).toBeTruthy();
		expect(screen.getByText("Средний")).toBeTruthy();
		expect(screen.getByText("Сложный")).toBeTruthy();
		expect(screen.getAllByText("Не пройден")).toHaveLength(3);
	});

	it("в карточке игры показывает сводку и ведёт на выбранную сложность", () => {
		const game: GameManifest = { ...demoGame, summary: "Краткая сводка", format: "2d", estimatedMinutes: 4 };
		platformStorage.write(storageKeys.levelResults, [
			{ gameId: "demo", levelId: "easy", score: 5, maxScore: 10, completed: true, durationSec: 30 },
		]);
		render(<GamesList games={[game]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		expect(screen.getByText("Краткая сводка")).toBeTruthy();
		// Первый непройденный уровень выбран по умолчанию.
		const startLink = screen.getByRole("link", { name: gamesTexts.startLevel });
		expect(startLink.getAttribute("href")).toBe("/games/demo/medium");
		fireEvent.click(screen.getByRole("radio", { name: /Сложный/ }));
		expect(startLink.getAttribute("href")).toBe("/games/demo/hard");
	});

	it("закрывает карточку игры по Escape и по кнопке Закрыть", () => {
		render(<GamesList games={[demoGame]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.sheetClose }));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it.each(["cancel", "resume", "reset"])("обрабатывает выбор для сохранения: %s", (choice) => {
		writeCheckpoint("demo", "medium", "run", { step: 3 });
		writeCheckpoint("demo", "medium", "training", { step: 2 });
		writeCheckpoint("demo", "hard", "run", { step: 5 });
		render(<GamesList games={[demoGame]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		fireEvent.click(screen.getByRole("button", { name: commonTexts.levelContinue }));

		const dialog = screen.getByRole<HTMLDialogElement>("dialog", { name: commonTexts.savedRunTitle });
		expect(router.push).not.toHaveBeenCalled();
		const submitter = dialog.querySelector<HTMLButtonElement>(`button[value="${choice}"]`)!;
		fireEvent(submitter.form!, new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter }));
		expect(router.push.mock.calls).toEqual(choice === "cancel" ? [] : [["/games/demo/medium"]]);
		expect(hasCheckpoint("demo", "medium")).toBe(choice !== "reset");
		expect(hasCheckpoint("demo", "hard")).toBe(true);
		expect(screen.getByRole("dialog", { name: "Демо" })).toBeTruthy();
	});

	it("фильтрует ленту по формату игры", () => {
		const games: GameManifest[] = [
			{ ...demoGame, format: "quiz" },
			{ ...demoGame, gameId: "flat", title: "Плоская", format: "2d" },
			{ ...demoGame, gameId: "space", title: "Объёмная", format: "3d" },
		];
		render(<GamesList games={games} />);
		expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.formats["3d"] }));
		const headings = screen.getAllByRole("heading", { level: 2 });
		expect(headings.map((heading) => heading.textContent)).toEqual(["Объёмная"]);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.filterAll }));
		expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
	});
});

// Пройденные уровни демо-игры для тестов карточки.
function completeDemoLevels(levelIds: string[]) {
	platformStorage.write(
		storageKeys.levelResults,
		levelIds.map((levelId) => ({ gameId: "demo", levelId, score: 5, maxScore: 10, completed: true, durationSec: 30 })),
	);
}

describe("лента библиотеки игр", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
	});

	it("карточка в ленте показывает метки и число пройденных уровней", () => {
		completeDemoLevels(["easy"]);
		render(<GamesList games={[{ ...demoGame, format: "3d", inDevelopment: true }]} />);
		expect(screen.getByText(gamesTexts.formats["3d"])).toBeTruthy();
		expect(screen.getByText(gamesTexts.inDevelopment)).toBeTruthy();
		expect(screen.getByText(`${gamesTexts.progressLabel}: 1 / 3`)).toBeTruthy();
		expect(screen.getByRole("button", { name: gamesTexts.playLevel })).toBeTruthy();
	});

	it("при играх одного формата и без формата фильтр не показывается", () => {
		render(
			<GamesList
				games={[
					{ ...demoGame, format: "2d" },
					{ ...demoGame, gameId: "flat", title: "Плоская", format: "2d" },
					{ ...demoGame, gameId: "plain", title: "Без формата" },
				]}
			/>,
		);
		expect(screen.queryByRole("group", { name: gamesTexts.filterLabel })).toBeNull();
		expect(screen.queryByRole("button", { name: gamesTexts.filterAll })).toBeNull();
	});
});

describe("карточка игры", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
	});

	it("показывает время уровня и связанные профессии", () => {
		const game: GameManifest = {
			...demoGame,
			summary: "Краткая сводка",
			estimatedMinutes: 4,
			professionTags: [{ professionId: "analyst", weight: 0.5 }, { professionId: "designer", weight: 0.3 }],
		};
		render(<GamesList games={[game]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		const dialog = screen.getByRole("dialog", { name: "Демо" });
		expect(within(dialog).getByText("Краткая сводка")).toBeTruthy();
		expect(within(dialog).getByText(`${gamesTexts.minutesPrefix} 4 ${gamesTexts.minutesSuffix}`)).toBeTruthy();
		expect(within(dialog).getByText("Аналитик")).toBeTruthy();
		expect(within(dialog).getByText("Дизайнер")).toBeTruthy();
	});

	it("без сводки показывает описание игры", () => {
		render(<GamesList games={[demoGame]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		expect(within(screen.getByRole("dialog")).getByText(demoGame.description)).toBeTruthy();
	});

	it("закрывается нажатием на фон, но не нажатием внутри карточки", () => {
		render(<GamesList games={[demoGame]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		const dialog = screen.getByRole("dialog");
		fireEvent.click(within(dialog).getByRole("heading", { name: "Демо" }));
		expect(screen.getByRole("dialog")).toBe(dialog);
		fireEvent.click(dialog);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.getByRole("heading", { level: 2, name: "Демо" })).toBeTruthy();
	});

	it("если пройдены все уровни, по умолчанию выбран easy", () => {
		completeDemoLevels(["easy", "medium", "hard"]);
		render(<GamesList games={[demoGame]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		expect(screen.getAllByText(gamesTexts.levelDone)).toHaveLength(3);
		expect(screen.getByRole("link", { name: gamesTexts.startLevel }).getAttribute("href")).toBe("/games/demo/easy");
	});
});

describe("ввод имени", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		platformStorage.write(storageKeys.playerName, "");
	});

	afterEach(() => {
		cleanup();
	});

	it("пустое имя отклоняется и не сохраняется", () => {
		const onSaved = vi.fn();
		render(<NameForm onSaved={onSaved} />);
		fireEvent.change(screen.getByLabelText(commonTexts.nameLabel), { target: { value: "   " } });
		fireEvent.click(screen.getByRole("button", { name: commonTexts.nameSubmit }));
		expect(screen.getByRole("alert").textContent).toBe(commonTexts.nameEmptyError);
		expect(onSaved).not.toHaveBeenCalled();
	});

	it("корректное имя сохраняется в LocalStorage", () => {
		const onSaved = vi.fn();
		render(<NameForm onSaved={onSaved} />);
		fireEvent.change(screen.getByLabelText(commonTexts.nameLabel), { target: { value: " Анна " } });
		fireEvent.click(screen.getByRole("button", { name: commonTexts.nameSubmit }));
		expect(onSaved).toHaveBeenCalledWith("Анна");
		expect(platformStorage.read(storageKeys.playerName, "")).toBe("Анна");
	});
});

describe("сброс результатов", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		platformStorage.write(storageKeys.playerName, "Анна");
		platformStorage.write(storageKeys.achievements, [{ id: "first" }]);
	});

	it("подтверждение очищает результаты и сохраняет имя", () => {
		render(<SiteHeader />);
		fireEvent.click(screen.getByRole("button", { name: commonTexts.resetButton }));
		fireEvent.click(screen.getByRole("button", { name: commonTexts.resetConfirm }));
		expect(platformStorage.read(storageKeys.achievements, [])).toEqual([]);
		expect(platformStorage.read(storageKeys.playerName, "")).toBe("Анна");
	});

	it("отмена не меняет данные", () => {
		render(<SiteHeader />);
		fireEvent.click(screen.getByRole("button", { name: commonTexts.resetButton }));
		fireEvent.click(screen.getByRole("button", { name: commonTexts.resetCancel }));
		expect(platformStorage.read(storageKeys.achievements, [])).toEqual([{ id: "first" }]);
	});
});

describe("предупреждение о хранении", () => {
	it("показывается, когда данные хранятся только в памяти", () => {
		render(<StorageWarning storageStatus={() => "memory"} />);
		expect(screen.getByRole("alert").textContent).toBe(commonTexts.storageWarning);
	});

	it("не показывается при обычном хранилище", () => {
		render(<StorageWarning storageStatus={() => "persistent"} />);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});

describe("оценка игры на экране игр", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
	});

	it("оценка не сохраняется до прохождения уровня и сохраняется после", () => {
		render(<GamesList games={[demoGame]} />);
		fireEvent.click(screen.getByRole("button", { name: gamesTexts.playLevel }));
		fireEvent.click(screen.getByRole("button", { name: "4" }));
		expect(platformStorage.read(storageKeys.gameRatings, {})).toEqual({});
		expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toBe(gamesTexts.ratingUnavailable);
		platformStorage.write(storageKeys.levelResults, [
			{ gameId: "demo", levelId: "easy", score: 5, maxScore: 10, completed: true, durationSec: 30 },
		]);
		fireEvent.click(screen.getByRole("button", { name: "4" }));
		expect(platformStorage.read(storageKeys.gameRatings, {})).toEqual({ demo: 4 });
		expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toBe(gamesTexts.ratingSaved);
	});
});
