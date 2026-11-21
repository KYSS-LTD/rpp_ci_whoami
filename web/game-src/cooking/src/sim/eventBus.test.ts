// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SimClock, SimEvent } from "../contracts";
import { createEventBus } from "./eventBus";

describe("шина событий", () => {
	it("проставляет время по часам и накапливает события до drain", () => {
		const clock: SimClock = { nowSec: 1.5 };
		const bus = createEventBus(clock);
		bus.emit({ type: "flowClosed" });
		clock.nowSec = 2;
		bus.emit({ type: "groupArrived", groupId: "g-1", size: 3 });
		const events = bus.drain();
		expect(events).toEqual([
			{ type: "flowClosed", t: 1.5 },
			{ type: "groupArrived", groupId: "g-1", size: 3, t: 2 },
		]);
		expect(bus.drain()).toEqual([]);
	});

	it("вызывает подписчиков синхронно и поддерживает отписку", () => {
		const bus = createEventBus({ nowSec: 0 });
		const received: SimEvent[] = [];
		const listener = vi.fn((event: SimEvent) => received.push(event));
		const unsubscribe = bus.subscribe(listener);
		bus.emit({ type: "flowClosed" });
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		bus.emit({ type: "flowClosed" });
		expect(listener).toHaveBeenCalledTimes(1);
		expect(received).toHaveLength(1);
	});
});
