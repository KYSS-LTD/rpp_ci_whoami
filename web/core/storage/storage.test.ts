import { describe, expect, it } from "vitest";
import { createMemoryBackend, createPlatformStorage, resolveBrowserBackend, storageKeyPrefix, storageKeys } from "./storage";

// Бэкенд, который бросает исключение при любой операции (имитация заблокированного LocalStorage).
function createThrowingBackend() {
	const failure = () => {
		throw new Error("SecurityError");
	};
	return {
		getItem: failure,
		setItem: failure,
		removeItem: failure,
		key: failure,
		length: 0,
	};
}

describe("слой хранения: запись и чтение", () => {
	it("запись и чтение возвращают исходное значение", () => {
		const storage = createPlatformStorage(createMemoryBackend());
		storage.write(storageKeys.playerName, "Анна");
		expect(storage.read(storageKeys.playerName, "")).toBe("Анна");
	});

	it("сохраняет поле schemaVersion в записи", () => {
		const backend = createMemoryBackend();
		const storage = createPlatformStorage(backend);
		storage.write(storageKeys.levelResults, [1, 2]);
		const raw = backend.getItem(`${storageKeyPrefix}${storageKeys.levelResults}`);
		expect(JSON.parse(raw ?? "{}").schemaVersion).toBe(1);
	});
});

describe("слой хранения: битые данные", () => {
	it("при битом JSON возвращает значение по умолчанию", () => {
		const backend = createMemoryBackend();
		backend.setItem(`${storageKeyPrefix}${storageKeys.playerName}`, "{битый");
		const storage = createPlatformStorage(backend);
		expect(storage.read(storageKeys.playerName, "гость")).toBe("гость");
	});

	it("при другой версии схемы возвращает значение по умолчанию", () => {
		const backend = createMemoryBackend();
		backend.setItem(`${storageKeyPrefix}${storageKeys.playerName}`, JSON.stringify({ schemaVersion: 99, value: "Анна" }));
		const storage = createPlatformStorage(backend);
		expect(storage.read(storageKeys.playerName, "гость")).toBe("гость");
	});
});

describe("слой хранения: недоступный LocalStorage", () => {
	it("работает в памяти и сообщает статус memory, если бэкенда нет", () => {
		const storage = createPlatformStorage(null);
		expect(storage.getStatus()).toBe("memory");
		storage.write(storageKeys.playerName, "Борис");
		expect(storage.read(storageKeys.playerName, "")).toBe("Борис");
	});

	it("не падает, если LocalStorage бросает исключение при чтении и записи", () => {
		const storage = createPlatformStorage(createThrowingBackend());
		expect(storage.read(storageKeys.playerName, "гость")).toBe("гость");
		expect(storage.write(storageKeys.playerName, "Вера").ok).toBe(false);
	});

	it("resolveBrowserBackend возвращает рабочий localStorage в браузерном окружении", () => {
		expect(resolveBrowserBackend()).not.toBeNull();
	});
});

describe("слой хранения: переполнение", () => {
	it("возвращает причину quota при QuotaExceededError", () => {
		const quotaBackend = {
			...createMemoryBackend(),
			setItem: () => {
				const error = new Error("full");
				error.name = "QuotaExceededError";
				throw error;
			},
		};
		const storage = createPlatformStorage(quotaBackend);
		expect(storage.write(storageKeys.diplomas, [])).toEqual({ ok: false, reason: "quota" });
	});
});

describe("слой хранения: сброс прогресса", () => {
	it("после очистки результаты пусты, имя сохранено", () => {
		const storage = createPlatformStorage(createMemoryBackend());
		storage.write(storageKeys.playerName, "Анна");
		storage.write(storageKeys.levelResults, [{ gameId: "demo" }]);
		storage.write(storageKeys.achievements, [{ id: "first" }]);
		storage.write(storageKeys.diplomas, [{ id: "d1" }]);
		storage.clearProgress();
		expect(storage.read(storageKeys.playerName, "")).toBe("Анна");
		expect(storage.read(storageKeys.levelResults, [])).toEqual([]);
		expect(storage.read(storageKeys.achievements, [])).toEqual([]);
		expect(storage.read(storageKeys.diplomas, [])).toEqual([]);
	});

	it("не трогает ключи, которые не принадлежат платформе", () => {
		const backend = createMemoryBackend();
		backend.setItem("other.app", "keep");
		const storage = createPlatformStorage(backend);
		storage.clearProgress();
		expect(backend.getItem("other.app")).toBe("keep");
	});
});
