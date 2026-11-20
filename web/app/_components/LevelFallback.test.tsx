import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commonTexts } from "@/texts/common";
import { LevelFallback } from "./LevelFallback";

// Имитация next/link: в тестах обычный тег a.
vi.mock("next/link", () => ({
	default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

afterEach(() => {
	cleanup();
});

describe("запасной экран уровня", () => {
	it("показывает сообщение, кнопку повтора и ссылку в библиотеку", () => {
		const onRetry = vi.fn();
		render(<LevelFallback onRetry={onRetry} />);
		expect(screen.getByRole("heading", { name: commonTexts.levelFailedTitle })).toBeTruthy();
		expect(screen.getByRole("link", { name: commonTexts.backToGames }).getAttribute("href")).toBe("/games");
		fireEvent.click(screen.getByRole("button", { name: commonTexts.levelFailedRetry }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
