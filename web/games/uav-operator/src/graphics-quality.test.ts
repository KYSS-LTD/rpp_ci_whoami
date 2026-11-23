import { describe, expect, it } from "vitest";
import { create_FlightResolution } from "./graphics-quality.js";

describe("масштаб рендера в полёте", () => {
	it("сохраняет резкость после единичного пропуска кадра и паузы", () => {
		const resolution = create_FlightResolution();
		for (let frame = 0; frame < 70; frame++) resolution.sample(1 / 60);
		resolution.sample(.8);
		expect(resolution.scale).toBe(1);
		for (let frame = 0; frame < 20; frame++) resolution.sample(1 / 24);
		resolution.resetSample();
		for (let frame = 0; frame < 180; frame++) resolution.sample(1 / 60);
		expect(resolution.scale).toBe(1);
	});

	it("снижает разрешение при долгой нагрузке и постепенно восстанавливает его", () => {
		const resolution = create_FlightResolution();
		for (let frame = 0; frame < 180; frame++) resolution.sample(1 / 30);
		const lowest = resolution.scale;
		expect(lowest).toBeGreaterThan(0);
		expect(lowest).toBeLessThan(1);
		for (let frame = 0; frame < 180; frame++) resolution.sample(1 / 60);
		expect(resolution.scale).toBe(lowest);
		for (let frame = 0; frame < 2400; frame++) resolution.sample(1 / 60);
		expect(resolution.scale).toBe(1);
	});
});
