// Шина событий симуляции: синхронные подписчики и накопитель для потребителей по кадрам (HUD, рендер, звук в будущем).
// Владелец: Opus-агент. Контракт: EventBus в contracts.ts.
import type { EventBus, SimClock, SimEvent, SimEventBody } from "../contracts";

// Создаёт шину. Время t каждому событию проставляется по часам симуляции в момент emit.
export function createEventBus(clock: SimClock): EventBus {
	const listeners: Array<(event: SimEvent) => void> = [];
	let buffer: SimEvent[] = [];

	return {
		emit(body: SimEventBody): void {
			const event = { ...body, t: clock.nowSec } as SimEvent;
			buffer.push(event);
			// Копия списка: подписчик может отписаться во время вызова.
			for (const listener of [...listeners]) {
				listener(event);
			}
		},
		subscribe(listener: (event: SimEvent) => void): () => void {
			listeners.push(listener);
			return () => {
				const position = listeners.indexOf(listener);
				if (position >= 0) {
					listeners.splice(position, 1);
				}
			};
		},
		drain(): SimEvent[] {
			const drained = buffer;
			buffer = [];
			return drained;
		},
	};
}
