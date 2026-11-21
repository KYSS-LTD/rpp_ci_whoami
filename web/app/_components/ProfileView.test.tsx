import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformStorage, storageKeys } from "@/core/storage";
import { ProfileView } from "./ProfileView";

// Две игры: в первой аналитик весит больше дизайнера, вторая дает только дизайнеру.
vi.mock("@/core/registry", () => ({
	gameRegistry: {
		games: [
			{
				manifest: {
					gameId: "demo",
					title: "Демо",
					description: "",
					contractVersion: 1,
					levels: [],
					professionTags: [
						{ professionId: "designer", weight: 0.3 },
						{ professionId: "analyst", weight: 1 },
					],
				},
				module: { manifest: {} },
			},
			{
				manifest: {
					gameId: "other",
					title: "Другая",
					description: "",
					contractVersion: 1,
					levels: [],
					professionTags: [{ professionId: "designer", weight: 1 }],
				},
				module: { manifest: {} },
			},
		],
		rejected: [],
	},
}));

describe("личная страница анализа", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		platformStorage.write(storageKeys.playerName, "Анна");
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("без завершенных уровней показывает сообщение о необходимости пройти игру", () => {
		const { container } = render(<ProfileView />);
		expect(container.textContent).toContain("Пройдите хотя бы одну игру");
	});

	it("профессия с максимальным баллом первая и выделена", () => {
		platformStorage.write(storageKeys.levelResults, [
			{ gameId: "demo", levelId: "easy", score: 9, maxScore: 10, completed: true, durationSec: 20 },
			{ gameId: "other", levelId: "easy", score: 2, maxScore: 10, completed: true, durationSec: 20 },
		]);
		const { container } = render(<ProfileView />);
		const items = container.querySelectorAll("ol li");
		expect(items[0].textContent).toContain("Аналитик");
		expect(items[0].getAttribute("data-top")).toBe("true");
		expect(items[1].getAttribute("data-top")).toBe("false");
	});

	it("открытие страницы не делает сетевых запросов", () => {
		platformStorage.write(storageKeys.levelResults, [
			{ gameId: "demo", levelId: "easy", score: 9, maxScore: 10, completed: true, durationSec: 20 },
		]);
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		render(<ProfileView />);
		expect(fetchSpy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("показывает результат упражнения и пересчитывает процент после смены оценки", () => {
		platformStorage.write(storageKeys.practiceResults, [
			{ gameId: "demo", activity: "race", difficulty: null, score: 86, completed: true, durationSec: 28 },
		]);
		const { container } = render(<ProfileView />);
		expect(screen.getByText("Гонка")).toBeTruthy();
		expect(container.querySelector("ol li")?.textContent).toContain("43%");
		fireEvent.change(screen.getByRole("combobox", { name: "Оценка игры Демо" }), { target: { value: "5" } });
		expect(container.querySelector("ol li")?.textContent).toContain("86%");
		expect(platformStorage.read(storageKeys.gameRatings, {})).toEqual({ demo: 5 });
	});
});
