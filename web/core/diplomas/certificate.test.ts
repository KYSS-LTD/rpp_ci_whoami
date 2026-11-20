import { describe, expect, it } from "vitest";
import { diplomasTexts } from "@/texts/diplomas";
import { buildCertificateFileName, buildCertificateHtml, escapeHtml, formatIssueDate } from "./certificate";
import type { Diploma } from "./index";

const diploma: Diploma = {
	id: "demo:hard:2026-03-01T10:00:00.000Z",
	gameId: "demo",
	levelId: "hard",
	playerName: "Анна",
	score: 9,
	maxScore: 10,
	rating: "gold",
	issuedAt: "2026-03-01T10:00:00.000Z",
};

const details = { gameTitle: "Демо-игра", levelTitle: "Сложный" };

describe("сертификат диплома", () => {
	it("содержит имя, игру, сложность, очки, рейтинг и дату", () => {
		const html = buildCertificateHtml(diploma, details, diplomasTexts.certificate);
		expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
		expect(html).toContain("Анна");
		expect(html).toContain("Демо-игра");
		expect(html).toContain("Сложный");
		expect(html).toContain("9 / 10");
		expect(html).toContain(diplomasTexts.certificate.ratings.gold);
		expect(html).toContain("01.03.2026");
		expect(html).toContain(diplomasTexts.certificate.localNotice);
	});

	it("не подключает внешние ресурсы", () => {
		const html = buildCertificateHtml(diploma, details, diplomasTexts.certificate);
		expect(html).not.toMatch(/<(script|link|img)\b/i);
		expect(html).not.toMatch(/https?:\/\//);
	});

	it("экранирует имя пользователя", () => {
		const html = buildCertificateHtml({ ...diploma, playerName: '<script>alert("x")</script>' }, details, diplomasTexts.certificate);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
		expect(escapeHtml("a & b's")).toBe("a &amp; b&#39;s");
	});

	it("имя файла содержит игру, уровень и дату и безопасно для файловой системы", () => {
		expect(buildCertificateFileName(diploma)).toBe("certificate-demo-hard-2026-03-01.html");
		expect(buildCertificateFileName({ ...diploma, gameId: "my game/1" })).toBe("certificate-my-game-1-hard-2026-03-01.html");
	});

	it("дата выдачи форматируется без сдвига часового пояса", () => {
		expect(formatIssueDate("2026-12-31T23:59:59.000Z")).toBe("31.12.2026");
		expect(formatIssueDate("не дата")).toBe("не дата");
	});
});
