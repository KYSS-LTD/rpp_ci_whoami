import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformStorage, storageKeys } from "@/core/storage";
import { commonTexts } from "@/texts/common";
import { diplomasTexts } from "@/texts/diplomas";
import { demoTexts } from "@/games/demo/texts";
import { DiplomasList } from "./DiplomasList";

describe("страница дипломов", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
		platformStorage.write(storageKeys.diplomas, [
			{ id: "a", gameId: "demo", levelId: "hard", playerName: "Анна", score: 9, maxScore: 10, rating: "gold", issuedAt: "2026-03-01T00:00:00.000Z" },
			{ id: "b", gameId: "demo", levelId: "easy", playerName: "Анна", score: 4, maxScore: 10, rating: "bronze", issuedAt: "2026-03-02T00:00:00.000Z" },
		]);
	});

	afterEach(() => {
		cleanup();
	});

	it("дипломы сгруппированы по игре и показывают пометку о локальном хранении", () => {
		const { container } = render(<DiplomasList />);
		expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
		expect(within(container).getByText(/Уровень: hard/)).toBeTruthy();
		expect(within(container).getByText(/Уровень: easy/)).toBeTruthy();
		expect(screen.getByRole("note").textContent).toBe(commonTexts.localDataNotice);
	});

	it("кнопка у диплома скачивает HTML-сертификат с именем, игрой, сложностью и очками", async () => {
		const createdBlobs: Blob[] = [];
		const createObjectUrl = vi.fn((blob: Blob) => {
			createdBlobs.push(blob);
			return "blob:certificate";
		});
		const revokeObjectUrl = vi.fn();
		vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl }));
		const downloadedNames: string[] = [];
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
			downloadedNames.push(this.download);
		});

		render(<DiplomasList />);
		const buttons = screen.getAllByRole("button", { name: diplomasTexts.certificateButton });
		expect(buttons).toHaveLength(2);
		fireEvent.click(buttons[0]);

		expect(clickSpy).toHaveBeenCalledTimes(1);
		expect(downloadedNames).toEqual(["certificate-demo-hard-2026-03-01.html"]);
		expect(createdBlobs[0].type).toBe("text/html;charset=utf-8");
		const html = await createdBlobs[0].text();
		expect(html).toContain("Анна");
		expect(html).toContain(demoTexts.title);
		expect(html).toContain(demoTexts.levelTitles.hard);
		expect(html).toContain("9 / 10");

		clickSpy.mockRestore();
		vi.unstubAllGlobals();
	});
});
