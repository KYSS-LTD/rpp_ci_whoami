import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { storageKeys, platformStorage } from "@/core/storage";
import { commonTexts } from "@/texts/common";
import { landingTexts } from "@/texts/landing";
import LandingPage from "../page";
import { GamesList } from "./GamesList";
import { NameForm } from "./NameForm";
import { SiteHeader } from "./SiteHeader";
import { StorageWarning } from "./StorageWarning";
import type { GameManifest } from "@/core/contract/types";

// Очистка отрисованных деревьев после каждого теста, иначе элементы от предыдущих тестов мешают поиску.
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
	});

	it("при пустом реестре показывает пустое состояние", () => {
		render(<GamesList games={[]} />);
		expect(screen.getByText("Игр пока нет")).toBeTruthy();
	});

	it("при одной игре показывает три уровня", () => {
		render(<GamesList games={[demoGame]} />);
		expect(screen.getByText("Лёгкий")).toBeTruthy();
		expect(screen.getByText("Средний")).toBeTruthy();
		expect(screen.getByText("Сложный")).toBeTruthy();
		expect(screen.getAllByText("Не пройден")).toHaveLength(3);
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
		fireEvent.click(screen.getByRole("button", { name: "4" }));
		expect(platformStorage.read(storageKeys.gameRatings, {})).toEqual({});
		platformStorage.write(storageKeys.levelResults, [
			{ gameId: "demo", levelId: "easy", score: 5, maxScore: 10, completed: true, durationSec: 30 },
		]);
		fireEvent.click(screen.getByRole("button", { name: "4" }));
		expect(platformStorage.read(storageKeys.gameRatings, {})).toEqual({ demo: 4 });
	});
});
