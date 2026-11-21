import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gameRegistry } from "@/core/registry";
import { validateManifest } from "@/core/contract/validate";
import { DemoLevel } from "./levels/DemoLevel";
import { demoTexts } from "./texts";
import { demoManifest } from "./manifest";

afterEach(() => {
	cleanup();
});

describe("демо-игра", () => {
	it("манифест примера проходит валидацию, игра скрыта из библиотеки", () => {
		expect(validateManifest(demoManifest).ok).toBe(true);
		expect(gameRegistry.games.map((game) => game.manifest.gameId)).not.toContain("demo");
	});

	it("полное прохождение отправляет результат с completed=true", () => {
		const onFinish = vi.fn();
		const level = demoManifest.levels[0];
		render(<DemoLevel level={level} onFinish={onFinish} />);
		const questions = demoTexts.questions.easy;
		questions.forEach((question, questionIndex) => {
			fireEvent.click(screen.getByLabelText(question.options[question.correctIndex], { selector: `input[name="question-${questionIndex}"]` }));
		});
		fireEvent.click(screen.getByRole("button", { name: demoTexts.finish }));
		expect(onFinish).toHaveBeenCalledWith(
			expect.objectContaining({ gameId: "demo", levelId: "easy", score: 3, maxScore: 3, completed: true }),
		);
	});

	it("выход из уровня отправляет completed=false", () => {
		const onFinish = vi.fn();
		render(<DemoLevel level={demoManifest.levels[2]} onFinish={onFinish} />);
		fireEvent.click(screen.getByRole("button", { name: demoTexts.abandon }));
		expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ levelId: "hard", completed: false }));
	});
});
