import { describe, expect, it } from "vitest";
import { validateManifest } from "./validate";
import { supportedContractVersion } from "./types";

// Базовый валидный манифест, от которого отталкиваются тесты.
function createManifest(overrides: Record<string, unknown> = {}) {
	return {
		gameId: "demo",
		title: "Демо",
		description: "Описание",
		contractVersion: supportedContractVersion,
		levels: [
			{ id: "easy", title: "Лёгкий" },
			{ id: "medium", title: "Средний" },
			{ id: "hard", title: "Сложный" },
		],
		professionTags: [{ professionId: "analyst", weight: 0.5 }],
		...overrides,
	};
}

describe("валидация манифеста", () => {
	it("принимает валидный манифест", () => {
		expect(validateManifest(createManifest()).ok).toBe(true);
	});

	it("отклоняет манифест без gameId", () => {
		const result = validateManifest(createManifest({ gameId: "" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reasons).toContain("отсутствует gameId");
		}
	});

	it("отклоняет меньше трёх уровней", () => {
		const result = validateManifest(createManifest({ levels: [{ id: "easy", title: "A" }] }));
		expect(result.ok).toBe(false);
	});

	it("отклоняет больше трёх уровней", () => {
		const levels = [...(createManifest().levels as object[]), { id: "easy", title: "Лишний" }];
		expect(validateManifest(createManifest({ levels })).ok).toBe(false);
	});

	it("отклоняет неизвестный идентификатор уровня", () => {
		const levels = [
			{ id: "easy", title: "A" },
			{ id: "medium", title: "B" },
			{ id: "expert", title: "C" },
		];
		const result = validateManifest(createManifest({ levels }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reasons.join(" ")).toContain("expert");
		}
	});

	it("отклоняет вес профессии больше 1", () => {
		const result = validateManifest(createManifest({ professionTags: [{ professionId: "a", weight: 1.5 }] }));
		expect(result.ok).toBe(false);
	});

	it("отклоняет вес профессии меньше 0", () => {
		const result = validateManifest(createManifest({ professionTags: [{ professionId: "a", weight: -0.1 }] }));
		expect(result.ok).toBe(false);
	});

	it("принимает граничные веса 0 и 1", () => {
		const result = validateManifest(
			createManifest({
				professionTags: [
					{ professionId: "a", weight: 0 },
					{ professionId: "b", weight: 1 },
				],
			}),
		);
		expect(result.ok).toBe(true);
	});

	it("отклоняет несовместимую версию контракта", () => {
		const result = validateManifest(createManifest({ contractVersion: 99 }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reasons.join(" ")).toContain("несовместимая версия контракта");
		}
	});

	it("отклоняет значение, которое не является объектом", () => {
		expect(validateManifest(null).ok).toBe(false);
	});
});
