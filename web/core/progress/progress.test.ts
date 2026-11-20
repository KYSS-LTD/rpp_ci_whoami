import { describe, expect, it } from "vitest";
import { createMemoryBackend, createPlatformStorage, storageKeys } from "../storage";
import { readAwardedAchievements, readDiplomas, readGameRatings, recordLevelResult, resetProgress, saveGameRating } from "./index";
import type { LevelResult } from "../contract/types";

const completedEasy: LevelResult = { gameId: "demo", levelId: "easy", score: 9, maxScore: 10, completed: true, durationSec: 20 };

describe("выдача ачивок при сохранении результата", () => {
	it("ачивка сохраняется с датой и переживает новое чтение хранилища", () => {
		const backend = createMemoryBackend();
		const storage = createPlatformStorage(backend);
		const outcome = recordLevelResult(completedEasy, storage, "2026-03-01T10:00:00.000Z");
		expect(outcome.newlyAwarded.map((item) => item.id)).toContain("first-level");

		const reloaded = createPlatformStorage(backend);
		expect(readAwardedAchievements(reloaded)).toContainEqual({ id: "first-level", awardedAt: "2026-03-01T10:00:00.000Z" });
	});

	it("незавершенный уровень не выдает ачивок", () => {
		const storage = createPlatformStorage(createMemoryBackend());
		const outcome = recordLevelResult({ ...completedEasy, completed: false }, storage);
		expect(outcome.newlyAwarded).toEqual([]);
	});

	it("сброс очищает ачивки", () => {
		const storage = createPlatformStorage(createMemoryBackend());
		recordLevelResult(completedEasy, storage);
		resetProgress(storage);
		expect(readAwardedAchievements(storage)).toEqual([]);
	});
});

describe("дипломы при сохранении результата", () => {
	it("диплом выдается за завершенный уровень и сохраняет имя на момент выдачи", () => {
		const storage = createPlatformStorage(createMemoryBackend());
		storage.write(storageKeys.playerName, "Анна");
		recordLevelResult(completedEasy, storage, "2026-03-01T10:00:00.000Z");
		storage.write(storageKeys.playerName, "Борис");
		expect(readDiplomas(storage)).toEqual([
			expect.objectContaining({ playerName: "Анна", gameId: "demo", levelId: "easy", rating: "gold" }),
		]);
	});

	it("незавершенный уровень не дает диплом", () => {
		const storage = createPlatformStorage(createMemoryBackend());
		storage.write(storageKeys.playerName, "Анна");
		recordLevelResult({ ...completedEasy, completed: false }, storage);
		expect(readDiplomas(storage)).toEqual([]);
	});
});

describe("оценки игр", () => {
	it("оценка сохраняется после прохождения, значения вне 1-5 отклоняются", () => {
		const storage = createPlatformStorage(createMemoryBackend());
		expect(saveGameRating("demo", 4, storage).ok).toBe(false);
		recordLevelResult(completedEasy, storage);
		expect(saveGameRating("demo", 4, storage)).toEqual({ ok: true });
		expect(readGameRatings(storage)).toEqual({ demo: 4 });
		expect(saveGameRating("demo", 6, storage)).toEqual({ ok: false, reason: "invalid" });
		expect(readGameRatings(storage)).toEqual({ demo: 4 });
	});
});

describe("дипломы и имя", () => {
	it("после смены имени в хранилище выданный диплом сохраняет прежнее имя", () => {
		const backend = createMemoryBackend();
		const storage = createPlatformStorage(backend);
		storage.write(storageKeys.playerName, "Анна");
		recordLevelResult(completedEasy, storage);
		createPlatformStorage(backend).write(storageKeys.playerName, "Борис");
		expect(readDiplomas(createPlatformStorage(backend))[0].playerName).toBe("Анна");
	});
});
