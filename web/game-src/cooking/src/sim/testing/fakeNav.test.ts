// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFakeNavSystem } from "./fakeNav";

describe("двойник навигации", () => {
	it("агент идёт к цели с заданной скоростью и приходит", () => {
		const nav = createFakeNavSystem();
		const agent = nav.createAgent({ id: "a", position: { x: 0, z: 0 }, speed: 2, radius: 0.25 });
		expect(agent.moveTo({ x: 4, z: 0 })).toBe(true);
		nav.step(1, { x: 0, z: 0 });
		expect(agent.position.x).toBeCloseTo(2);
		expect(agent.status).toBe("moving");
		nav.step(1, { x: 0, z: 0 });
		expect(agent.position.x).toBeCloseTo(4);
		expect(agent.status).toBe("arrived");
	});

	it("режим instant приводит к цели на первом шаге, teleport отменяет путь", () => {
		const nav = createFakeNavSystem({ instant: true });
		const agent = nav.createAgent({ id: "a", position: { x: 0, z: 0 }, speed: 1, radius: 0.25 });
		agent.moveTo({ x: 10, z: 10 });
		nav.step(0.016, { x: 0, z: 0 });
		expect(agent.status).toBe("arrived");
		agent.moveTo({ x: 1, z: 1 });
		agent.teleport({ x: 5, z: 5 });
		expect(agent.status).toBe("idle");
		expect(agent.position).toEqual({ x: 5, z: 5 });
	});

	it("поисковик пути возвращает прямую и удаление агента работает", () => {
		const nav = createFakeNavSystem();
		expect(nav.pathfinder.findPath({ x: 0, z: 0 }, { x: 3, z: 4 })).toEqual([{ x: 3, z: 4 }]);
		expect(nav.pathfinder.pathLength({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
		nav.createAgent({ id: "a", position: { x: 0, z: 0 }, speed: 1, radius: 0.25 });
		nav.removeAgent("a");
		expect(nav.agents).toHaveLength(0);
	});
});
