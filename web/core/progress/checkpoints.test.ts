import { expect, it } from "vitest";
import { createMemoryBackend, createPlatformStorage, storageKeys } from "../storage";
import { readCheckpoints, writeCheckpoint } from "./checkpoints";

it("изолирует игру, сложность и настройки упражнения, а общий сброс удаляет сохранения", () => {
	const storage = createPlatformStorage(createMemoryBackend());
	storage.write(storageKeys.playerName, "Игрок");
	writeCheckpoint("uav-operator", "easy", "run", { stage: 2 }, storage);
	writeCheckpoint("uav-operator", "hard", "run", { stage: 1 }, storage);
	writeCheckpoint("uav-operator", "free", "flight-beach-mini-acro", { armed: true }, storage);
	writeCheckpoint("uav-operator", "free", "flight-field-mini-acro", { armed: false }, storage);
	writeCheckpoint("cooking", "easy", "run", { day: 4 }, storage);

	expect(readCheckpoints("uav-operator", "easy", storage)).toEqual({ run: { stage: 2 } });
	expect(readCheckpoints("cooking", "easy", storage)).toEqual({ run: { day: 4 } });
	writeCheckpoint("uav-operator", "free", "flight-beach-mini-acro", null, storage);
	expect(readCheckpoints("uav-operator", "free", storage)).toEqual({ "flight-field-mini-acro": { armed: false } });
	expect(readCheckpoints("uav-operator", "hard", storage)).toEqual({ run: { stage: 1 } });

	storage.clearProgress();
	expect(readCheckpoints("uav-operator", "easy", storage)).toEqual({});
	expect(readCheckpoints("cooking", "easy", storage)).toEqual({});
	expect(storage.read(storageKeys.playerName, "")).toBe("Игрок");
});
