// Хранилище снимков состояния для HUD (задача 7.1): запоминает последний снимок, раздаёт его подписчикам не чаще
// заданной частоты (10 раз в секунду), чтобы частые изменения симуляции не вызывали лишних обновлений DOM.
// Смена фазы смены доставляется сразу: нажатие "Начать" и провал не должны ждать до 100 миллисекунд.
import type { GameSnapshot } from "../contracts";
import { HUD_UPDATE_INTERVAL_MS } from "./constants";

// Подписчик: получает снимок и время (миллисекунды кадра) доставки.
export type SnapshotListener = (snapshot: GameSnapshot, nowMs: number) => void;

// Хранилище снимков.
export interface SnapshotStore {
	// Новый снимок от кадра. Доставляется подписчикам сразу (первый снимок и смена фазы) или не раньше чем через интервал.
	push(snapshot: GameSnapshot, nowMs: number): void;
	// Подписка. Если снимок уже есть, подписчик получает его сразу. Возвращает функцию отписки.
	subscribe(listener: SnapshotListener): () => void;
	// Последний принятый снимок (в том числе ещё не доставленный) или null.
	getLatest(): GameSnapshot | null;
	// Принудительно доставляет последний принятый снимок (например, после смены режима ввода).
	flush(nowMs: number): void;
}

// Создаёт хранилище с минимальным интервалом доставки.
export function createSnapshotStore(minIntervalMs: number = HUD_UPDATE_INTERVAL_MS): SnapshotStore {
	const listeners = new Set<SnapshotListener>();
	let latest: GameSnapshot | null = null;
	let lastDelivered: GameSnapshot | null = null;
	let lastDeliveredAtMs = Number.NEGATIVE_INFINITY;

	function deliver(nowMs: number): void {
		if (latest === null) {
			return;
		}
		lastDelivered = latest;
		lastDeliveredAtMs = nowMs;
		for (const listener of [...listeners]) {
			listener(latest, nowMs);
		}
	}

	return {
		push(snapshot, nowMs) {
			latest = snapshot;
			const isFirst = lastDelivered === null;
			const phaseChanged = lastDelivered !== null && lastDelivered.phase !== snapshot.phase;
			if (isFirst || phaseChanged || nowMs - lastDeliveredAtMs >= minIntervalMs) {
				deliver(nowMs);
			}
		},
		subscribe(listener) {
			listeners.add(listener);
			if (lastDelivered !== null) {
				listener(lastDelivered, lastDeliveredAtMs);
			}
			return () => {
				listeners.delete(listener);
			};
		},
		getLatest() {
			return latest;
		},
		flush(nowMs) {
			deliver(nowMs);
		},
	};
}
