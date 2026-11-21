// @vitest-environment node
// Тесты хранилища снимков (задача 7.1): частые изменения симуляции не вызывают лишних доставок подписчикам.
import { describe, expect, it, vi } from "vitest";
import { getLevelConfig } from "../config/levels";
import type { GameSnapshot } from "../contracts";
import { createDemoSnapshot } from "../render/demoSnapshot";
import { createSnapshotStore } from "./store";

const level = getLevelConfig("easy");

// Снимок на момент времени: у каждого кадра он новый объект с другими числами.
function snapshotAt(timeSec: number, phase: GameSnapshot["phase"] = "running"): GameSnapshot {
	return createDemoSnapshot(level, timeSec, { phase });
}

describe("хранилище снимков", () => {
	it("за секунду шестидесяти кадров подписчик получает не больше 11 снимков (10 раз в секунду)", () => {
		const store = createSnapshotStore();
		const listener = vi.fn();
		store.subscribe(listener);
		for (let frame = 0; frame < 60; frame += 1) {
			store.push(snapshotAt(frame / 60), (frame * 1000) / 60);
		}
		expect(listener.mock.calls.length).toBeLessThanOrEqual(11);
		expect(listener.mock.calls.length).toBeGreaterThanOrEqual(9);
	});

	it("первый снимок доставляется сразу", () => {
		const store = createSnapshotStore();
		const listener = vi.fn();
		store.subscribe(listener);
		store.push(snapshotAt(0), 0);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("между доставками последний снимок запоминается и уходит со следующей доставкой", () => {
		const store = createSnapshotStore(100);
		const delivered: number[] = [];
		store.subscribe((snapshot) => delivered.push(snapshot.tick));
		store.push({ ...snapshotAt(0), tick: 1 }, 0);
		store.push({ ...snapshotAt(0), tick: 2 }, 30);
		store.push({ ...snapshotAt(0), tick: 3 }, 60);
		expect(store.getLatest()?.tick).toBe(3);
		expect(delivered).toEqual([1]);
		store.push({ ...snapshotAt(0), tick: 4 }, 120);
		expect(delivered).toEqual([1, 4]);
	});

	it("смена фазы доставляется сразу, не дожидаясь интервала", () => {
		const store = createSnapshotStore(100);
		const phases: string[] = [];
		store.subscribe((snapshot) => phases.push(snapshot.phase));
		store.push(snapshotAt(0, "ready"), 0);
		store.push(snapshotAt(0, "running"), 10);
		store.push(snapshotAt(0, "failed"), 20);
		expect(phases).toEqual(["ready", "running", "failed"]);
	});

	it("отписка работает, новый подписчик получает последнее доставленное состояние", () => {
		const store = createSnapshotStore();
		const first = vi.fn();
		const unsubscribe = store.subscribe(first);
		store.push(snapshotAt(0), 0);
		unsubscribe();
		store.push(snapshotAt(5), 500);
		expect(first).toHaveBeenCalledTimes(1);
		const late = vi.fn();
		store.subscribe(late);
		expect(late).toHaveBeenCalledTimes(1);
	});

	it("flush принудительно доставляет последний снимок", () => {
		const store = createSnapshotStore(100);
		const listener = vi.fn();
		store.subscribe(listener);
		store.push(snapshotAt(0), 0);
		store.push(snapshotAt(1), 10);
		expect(listener).toHaveBeenCalledTimes(1);
		store.flush(11);
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
