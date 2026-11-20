import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformStorage, storageKeys } from "@/core/storage";
import { commonTexts } from "@/texts/common";
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
	return {
		gameRegistry: {
			games: [
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

	it("при первом входе запрашивает имя, а после сохранения не показывает запрос повторно", () => {
		const { unmount } = render(<LevelRunner gameId="demo" levelId="easy" />);
		expect(screen.getByRole("heading", { name: commonTexts.nameTitle })).toBeTruthy();
		fireEvent.change(screen.getByLabelText(commonTexts.nameLabel), { target: { value: "Анна" } });
		fireEvent.click(screen.getByRole("button", { name: commonTexts.nameSubmit }));
		expect(screen.queryByRole("heading", { name: commonTexts.nameTitle })).toBeNull();
		expect(screen.getByRole("button", { name: "Завершить уровень" })).toBeTruthy();
		unmount();

		render(<LevelRunner gameId="demo" levelId="medium" />);
		expect(screen.queryByRole("heading", { name: commonTexts.nameTitle })).toBeNull();
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
