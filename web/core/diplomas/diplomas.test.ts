import { describe, expect, it } from "vitest";
import type { LevelResult } from "../contract/types";
import { issueDiploma, ratingForPercent } from "./index";

const baseResult: LevelResult = { gameId: "demo", levelId: "medium", score: 5, maxScore: 10, completed: true, durationSec: 60 };

describe("рейтинг диплома", () => {
	it.each([
		[49.9, "bronze"],
		[50, "silver"],
		[79, "silver"],
		[79.9, "silver"],
		[80, "gold"],
	])("доля %s процента дает рейтинг %s", (percent, expected) => {
		expect(ratingForPercent(percent)).toBe(expected);
	});
});

describe("выдача диплома", () => {
	it("диплом содержит имя, очки и рейтинг", () => {
		const diploma = issueDiploma({ ...baseResult, score: 9 }, "Анна", "2026-03-01T10:00:00.000Z");
		expect(diploma).toMatchObject({ playerName: "Анна", score: 9, maxScore: 10, rating: "gold", gameId: "demo", levelId: "medium" });
	});

	it("смена имени не меняет уже выданный диплом", () => {
		const diploma = issueDiploma(baseResult, "Анна", "2026-03-01T10:00:00.000Z");
		const renamed = { ...diploma, playerName: "Борис" };
		expect(diploma?.playerName).toBe("Анна");
		expect(renamed.playerName).toBe("Борис");
	});

	it("незавершенный уровень не дает диплом", () => {
		expect(issueDiploma({ ...baseResult, completed: false }, "Анна", "2026-03-01T10:00:00.000Z")).toBeNull();
	});
});
