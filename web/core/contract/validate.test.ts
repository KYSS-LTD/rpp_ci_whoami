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

	it("принимает манифест с полями витрины", () => {
		const result = validateManifest(
			createManifest({
				format: "3d",
				summary: "Сводка",
				preview: { frames: ["/game-previews/demo/frame-1.svg"] },
				estimatedMinutes: 5,
				inDevelopment: true,
			}),
		);
		expect(result.ok).toBe(true);
	});

	it("отклоняет неверные поля витрины", () => {
		const result = validateManifest(
			createManifest({ format: "vr", preview: { frames: [] }, estimatedMinutes: 0, inDevelopment: "да" }),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			const reasons = result.reasons.join(" ");
			expect(reasons).toContain("неизвестный формат игры");
			expect(reasons).toContain("preview.frames");
			expect(reasons).toContain("время уровня");
			expect(reasons).toContain("inDevelopment");
		}
	});

	it("принимает объявление сборки внутри папки своей игры", () => {
		const result = validateManifest(
			createManifest({ runtime: { kind: "iframe", entry: "/game-builds/demo/index.html", readyTimeoutSec: 60 } }),
		);
		expect(result.ok).toBe(true);
	});

	it("отклоняет сборку вне папки своей игры, внешний адрес и неизвестный вид запуска", () => {
		const badEntries = [
			"/game-builds/other/index.html",
			"/game-builds/demo/../other/index.html",
			"https://example.com/game/index.html",
			"//example.com/game-builds/demo/index.html",
			"/game-builds/demo//index.html",
			"/game-builds/demo/",
			"",
		];
		for (const entry of badEntries) {
			const result = validateManifest(createManifest({ runtime: { kind: "iframe", entry } }));
			expect(result.ok, entry).toBe(false);
		}
		const wrongKind = validateManifest(createManifest({ runtime: { kind: "native", entry: "/game-builds/demo/index.html" } }));
		expect(wrongKind.ok).toBe(false);
		if (!wrongKind.ok) {
			expect(wrongKind.reasons.join(" ")).toContain("неизвестный вид запуска");
		}
	});

	it("отклоняет неположительное время ожидания сборки", () => {
		const result = validateManifest(
			createManifest({ runtime: { kind: "iframe", entry: "/game-builds/demo/index.html", readyTimeoutSec: 0 } }),
		);
		expect(result.ok).toBe(false);
	});

	it("отклоняет значение, которое не является объектом", () => {
		expect(validateManifest(null).ok).toBe(false);
	});
});
