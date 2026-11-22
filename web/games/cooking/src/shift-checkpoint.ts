import { SIM_STEP_SEC, type InputState, type LevelConfig, type Simulation } from "./contracts";

type InputRun = { x: number; z: number; flags: number; steps: number };
const bytesPerRun = 19;

// Повторяем фиксированные шаги с тем же seed. Состояние кухни, гостей и навигации
// восстанавливается через те же правила симуляции, что и при обычной игре.
export function createShiftJournal(runs: InputRun[] = []) {
	return {
		record(input: InputState) {
			const { x, z } = input.moveVector;
			const flags = Number(input.actionPressed) | (Number(input.workHeld) << 1);
			const last = runs.at(-1);
			if (last && last.x === x && last.z === z && last.flags === flags) last.steps += 1;
			else runs.push({ x, z, flags, steps: 1 });
		},
		serialize() {
			const buffer = new DataView(new ArrayBuffer(runs.length * bytesPerRun));
			for (const [index, { x, z, flags, steps }] of runs.entries()) {
				const offset = index * bytesPerRun;
				buffer.setFloat64(offset, x);
				buffer.setFloat64(offset + 8, z);
				buffer.setUint8(offset + 16, flags);
				buffer.setUint16(offset + 17, steps);
			}
			const bytes = new Uint8Array(buffer.buffer);
			let binary = "";
			for (let offset = 0; offset < bytes.length; offset += 8192) {
				binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
			}
			return btoa(binary);
		},
		restore(simulation: Simulation) {
			simulation.start();
			for (const { x, z, flags, steps } of runs) {
				const input: InputState = { moveVector: { x, z }, actionPressed: Boolean(flags & 1), workHeld: Boolean(flags & 2), actionHeld: false, workPressed: false };
				for (let step = 0; step < steps; step += 1) simulation.step(input);
			}
			simulation.drainEvents();
		},
	};
}

export function readShiftCheckpoint(raw: unknown, level: LevelConfig, daysCompleted: number) {
	if (!raw || typeof raw !== "object") return null;
	const { version, day, seed, input, dayComplete, replay } = raw as Record<string, unknown>;
	const maxSteps = Math.ceil(level.params.durationSec / SIM_STEP_SEC) + 1;
	if (version !== 1 || typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 5
		|| (day !== Math.min(5, daysCompleted + 1) && !(dayComplete === true && day === daysCompleted))
		|| typeof seed !== "number" || !level.verifiedSeeds.includes(seed)
		|| typeof input !== "string" || input.length > Math.ceil(maxSteps * bytesPerRun / 3) * 4) return null;
	try {
		const bytes = Uint8Array.from(atob(input), (character) => character.charCodeAt(0));
		if (bytes.length % bytesPerRun !== 0) return null;
		const view = new DataView(bytes.buffer);
		const runs: InputRun[] = [];
		let totalSteps = 0;
		for (let offset = 0; offset < bytes.length; offset += bytesPerRun) {
			const x = view.getFloat64(offset);
			const z = view.getFloat64(offset + 8);
			const flags = view.getUint8(offset + 16);
			const steps = view.getUint16(offset + 17);
			totalSteps += steps;
			if (!Number.isFinite(x) || Math.abs(x) > 1 || !Number.isFinite(z) || Math.abs(z) > 1
				|| flags > 3 || steps === 0 || totalSteps > maxSteps) return null;
			runs.push({ x, z, flags, steps });
		}
		return { day, seed, dayComplete: dayComplete === true, replay: replay === true, journal: createShiftJournal(runs) };
	} catch {
		return null;
	}
}
