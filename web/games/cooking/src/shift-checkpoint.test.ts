import { expect, it } from "vitest";
import { getLevelConfig } from "./config/levels";
import { EMPTY_INPUT, SIM_STEP_SEC } from "./contracts";
import { getCampaignMenu } from "./progress";
import { createShiftJournal, readShiftCheckpoint } from "./shift-checkpoint";
import { createSimulation } from "./sim/simulation";

it("восстанавливает смену по seed и вводу, включая таймер, положение повара и заказы", () => {
	const base = getLevelConfig("easy");
	const level = { ...base, params: { ...base.params, menu: getCampaignMenu(1) } };
	const seed = level.verifiedSeeds[0];
	const journal = createShiftJournal();
	const original = createSimulation({ level, seed, onFixedStep: journal.record });
	original.start();
	for (let step = 0; step < 900; step += 1) {
		original.advance(SIM_STEP_SEC, {
			...EMPTY_INPUT,
			moveVector: { x: step < 10 ? 0.342234283451 : 0, z: 0 },
			actionPressed: step === 14,
		});
	}
	const raw = { version: 1, seed, day: 1, input: journal.serialize() };
	const checkpoint = readShiftCheckpoint(raw, level, 0);
	expect(checkpoint).not.toBeNull();
	expect(readShiftCheckpoint(raw, level, 1)).toBeNull();

	const resumed = createSimulation({ level, seed });
	checkpoint?.journal.restore(resumed);
	expect(resumed.getSnapshot()).toEqual(original.getSnapshot());
	resumed.advance(SIM_STEP_SEC, EMPTY_INPUT);
	original.advance(SIM_STEP_SEC, EMPTY_INPUT);
	expect(resumed.getSnapshot()).toEqual(original.getSnapshot());
});
