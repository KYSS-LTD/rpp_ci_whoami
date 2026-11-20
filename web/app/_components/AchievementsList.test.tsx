import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { platformStorage, storageKeys } from "@/core/storage";
import { AchievementsList } from "./AchievementsList";

describe("страница ачивок", () => {
	beforeEach(() => {
		platformStorage.clearProgress();
	});

	afterEach(() => {
		cleanup();
	});

	it("полученная ачивка помечена датой, неполученная закрыта", () => {
		platformStorage.write(storageKeys.achievements, [{ id: "first-level", awardedAt: "2026-03-01T10:00:00.000Z" }]);
		const { container } = render(<AchievementsList />);
		const awardedItem = container.querySelector('[data-awarded="true"]');
		const lockedItems = container.querySelectorAll('[data-awarded="false"]');
		expect(awardedItem?.textContent).toContain("Первый уровень");
		expect(awardedItem?.textContent).toContain("Получено");
		expect(lockedItems.length).toBeGreaterThan(0);
		expect(lockedItems[0].textContent).toContain("Закрыто");
		expect(screen.queryByText("Гроза сложности")).toBeNull();
	});
});
