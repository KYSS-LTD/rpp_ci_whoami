import { platformStorage, type PlatformStorage } from "../storage";

export type Checkpoint = Record<string, unknown>;

export const maxCheckpointBytes = 512 * 1024;
export const defaultCheckpointSlot = "run";

export function isCheckpointSlot(slot: unknown): slot is string {
	return typeof slot === "string" && /^[a-z0-9-]{1,64}$/.test(slot);
}

export function isCheckpoint(data: unknown): data is Checkpoint {
	if (!data || typeof data !== "object" || Array.isArray(data)) return false;
	try {
		const json = JSON.stringify(data);
		return typeof json === "string" && new TextEncoder().encode(json).length <= maxCheckpointBytes;
	} catch {
		return false;
	}
}

function checkpointPrefix(gameId: string, route: string): `checkpoint.${string}` {
	return `checkpoint.${gameId}.${route}.`;
}

export function readCheckpoints(gameId: string, route: string, storage: PlatformStorage = platformStorage): Record<string, Checkpoint> {
	const prefix = checkpointPrefix(gameId, route);
	const checkpoints: Record<string, Checkpoint> = {};
	for (const key of storage.list(prefix)) {
		const slot = key.slice(prefix.length);
		const data = storage.read<unknown>(key, null);
		if (isCheckpointSlot(slot) && isCheckpoint(data)) checkpoints[slot] = data;
	}
	return checkpoints;
}

export function hasCheckpoint(gameId: string, route: string, storage: PlatformStorage = platformStorage): boolean {
	return storage.list(checkpointPrefix(gameId, route)).length > 0;
}

export function writeCheckpoint(gameId: string, route: string, slot: string, data: Checkpoint | null, storage: PlatformStorage = platformStorage): boolean {
	if (!isCheckpointSlot(slot)) return false;
	const key = `${checkpointPrefix(gameId, route)}${slot}` as const;
	if (data === null) return storage.remove(key);
	return isCheckpoint(data) && storage.write(key, data).ok;
}
