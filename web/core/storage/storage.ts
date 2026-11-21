// Единый слой хранения данных платформы в LocalStorage.
// Все чтения и записи проходят через этот модуль. Каждое значение хранится с полем schemaVersion.
// Если LocalStorage недоступен, данные живут в памяти текущей вкладки, а интерфейс получает статус "memory".

import { debugLog } from "../debug";

// Префикс всех ключей платформы, по нему находятся ключи при сбросе.
export const storageKeyPrefix = "portal.";

// Текущая версия схемы записей. При изменении формата нужно писать миграцию чтения.
export const currentSchemaVersion = 1;

// Все ключи платформы в одном месте.
export const storageKeys = {
	playerName: "playerName",
	levelResults: "levelResults",
	achievements: "achievements",
	diplomas: "diplomas",
	gameRatings: "gameRatings",
	gameProgress: "gameProgress",
} as const;

export type StorageKeyName = (typeof storageKeys)[keyof typeof storageKeys];

// Минимальный интерфейс хранилища. Совместим с window.localStorage и с подменами в тестах.
export interface KeyValueBackend {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
	key(index: number): string | null;
	readonly length: number;
}

// Статус хранения: "persistent" - данные сохраняются в браузере, "memory" - только в текущей сессии.
export type StorageStatus = "persistent" | "memory";

// Результат записи. Ошибка возвращается вызывающему коду, а не теряется внутри модуля.
export type StorageWriteResult = { ok: true } | { ok: false; reason: "quota" | "failed" };

interface StoredEnvelope<T> {
	schemaVersion: number;
	value: T;
}

// Хранилище в памяти, используется, когда LocalStorage недоступен.
export function createMemoryBackend(): KeyValueBackend {
	const entries = new Map<string, string>();
	return {
		getItem: (key) => entries.get(key) ?? null,
		setItem: (key, value) => {
			entries.set(key, value);
		},
		removeItem: (key) => {
			entries.delete(key);
		},
		key: (index) => Array.from(entries.keys())[index] ?? null,
		get length() {
			return entries.size;
		},
	};
}

// Проверяет, доступен ли LocalStorage браузера. Возвращает null, если он заблокирован или отсутствует.
export function resolveBrowserBackend(): KeyValueBackend | null {
	try {
		if (typeof window === "undefined") {
			return null;
		}
		const backend = window.localStorage;
		const probeKey = `${storageKeyPrefix}probe`;
		backend.setItem(probeKey, "1");
		backend.removeItem(probeKey);
		return backend;
	} catch {
		return null;
	}
}

// Определяет, что ошибка записи вызвана переполнением хранилища.
function isQuotaError(error: unknown): boolean {
	const errorName = (error as { name?: string } | null)?.name;
	return errorName === "QuotaExceededError" || errorName === "NS_ERROR_DOM_QUOTA_REACHED";
}

// Создает слой хранения поверх переданного бэкенда. Если бэкенда нет, работает в памяти.
export function createPlatformStorage(backend: KeyValueBackend | null) {
	const persistentBackend = backend;
	const activeBackend: KeyValueBackend = backend ?? createMemoryBackend();
	const status: StorageStatus = persistentBackend ? "persistent" : "memory";

	function fullKey(keyName: StorageKeyName): string {
		return `${storageKeyPrefix}${keyName}`;
	}

	// Читает значение. При отсутствии, битом JSON или другой версии схемы возвращает fallback.
	function read<T>(keyName: StorageKeyName, fallback: T): T {
		let raw: string | null;
		try {
			raw = activeBackend.getItem(fullKey(keyName));
		} catch {
			return fallback;
		}
		if (raw === null) {
			return fallback;
		}
		try {
			const envelope = JSON.parse(raw) as StoredEnvelope<T> | null;
			if (envelope && typeof envelope === "object" && envelope.schemaVersion === currentSchemaVersion && "value" in envelope) {
				return envelope.value;
			}
			debugLog("storage", "версия схемы не совпадает, используется значение по умолчанию", keyName);
			return fallback;
		} catch {
			debugLog("storage", "битый JSON, используется значение по умолчанию", keyName);
			return fallback;
		}
	}

	// Записывает значение с версией схемы. Ошибку переполнения возвращает вызывающему коду.
	function write<T>(keyName: StorageKeyName, value: T): StorageWriteResult {
		const envelope: StoredEnvelope<T> = { schemaVersion: currentSchemaVersion, value };
		try {
			activeBackend.setItem(fullKey(keyName), JSON.stringify(envelope));
			return { ok: true };
		} catch (error) {
			if (isQuotaError(error)) {
				return { ok: false, reason: "quota" };
			}
			return { ok: false, reason: "failed" };
		}
	}

	// Удаляет все ключи платформы, кроме имени игрока. Используется при сбросе результатов.
	function clearProgress(): void {
		const keysToRemove: string[] = [];
		for (let index = 0; index < activeBackend.length; index += 1) {
			const storedKey = activeBackend.key(index);
			if (storedKey && storedKey.startsWith(storageKeyPrefix) && storedKey !== fullKey(storageKeys.playerName)) {
				keysToRemove.push(storedKey);
			}
		}
		keysToRemove.forEach((storedKey) => activeBackend.removeItem(storedKey));
	}

	return { read, write, clearProgress, getStatus: (): StorageStatus => status };
}

export type PlatformStorage = ReturnType<typeof createPlatformStorage>;

// Общий экземпляр хранилища для приложения.
export const platformStorage: PlatformStorage = createPlatformStorage(resolveBrowserBackend());
