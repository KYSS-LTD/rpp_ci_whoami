import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	formatCalculatorEntry,
	getCalculatorValue,
	initialCalculatorState,
	keyboardToCalculatorKey,
	pressCalculatorKey,
	type CalculatorKey,
	type CalculatorState,
} from "../logic/calculator";
import { accountantTexts } from "../texts";
import { AmountInput } from "./AmountInput";
import { Calculator } from "./Calculator";
import { AmountTargetProvider, LevelChromeProvider, type LevelChrome } from "./contexts";
import { Rulebook } from "./Rulebook";
import { Workplace, formatWorkClock } from "./Workplace";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

// Нажимает клавиши по очереди, начиная с чистого калькулятора.
function pressAll(keys: CalculatorKey[], state: CalculatorState = initialCalculatorState): CalculatorState {
	return keys.reduce(pressCalculatorKey, state);
}

describe("логика калькулятора", () => {
	it("НДФЛ на калькуляторе: 50 600 × 13 % = 6 578", () => {
		const state = pressAll(["5", "0", "6", "0", "0", "*", "1", "3", "%", "="]);
		expect(getCalculatorValue(state)).toBe(6578);
		expect(state.tape.at(-1)).toEqual({ value: 6578, mark: "=" });
	});

	it("цепочка операций и дробная часть без ошибок округления", () => {
		expect(getCalculatorValue(pressAll(["2", "+", "3", "+", "4", "="]))).toBe(9);
		expect(getCalculatorValue(pressAll(["0", ",", "1", "+", "0", ",", "2", "="]))).toBe(0.3);
		// Излишек кассы: 27 500 - 20 000.
		expect(getCalculatorValue(pressAll(["2", "7", "5", "0", "0", "-", "2", "0", "0", "0", "0", "="]))).toBe(7500);
	});

	it("процент при сложении считается от первого числа", () => {
		expect(getCalculatorValue(pressAll(["2", "0", "0", "+", "1", "0", "%", "="]))).toBe(220);
	});

	it("деление на ноль даёт ошибку, сброс и стирание работают", () => {
		const error = pressAll(["5", "/", "0", "="]);
		expect(error.isError).toBe(true);
		expect(pressCalculatorKey(error, "C").isError).toBe(false);
		expect(pressAll(["1", "2", "3", "back"]).entry).toBe("12");
		expect(pressAll(["7", "sign"]).entry).toBe("-7");
	});

	it("клавиатура компьютера и вывод с разделителями", () => {
		expect(keyboardToCalculatorKey("Enter")).toBe("=");
		expect(keyboardToCalculatorKey(".")).toBe(",");
		expect(keyboardToCalculatorKey("Escape")).toBe("C");
		expect(keyboardToCalculatorKey("q")).toBeNull();
		expect(formatCalculatorEntry("7793,5")).toBe("7 793,5");
		expect(formatCalculatorEntry("-196850")).toBe("-196 850");
	});
});

function CalculatorBench() {
	const [value, setValue] = useState("");
	return (
		<AmountTargetProvider>
			<AmountInput label="НДФЛ Петрова" value={value} onValueChange={setValue} />
			<Calculator defaultPosition={{ x: 0, y: 0 }} />
		</AmountTargetProvider>
	);
}

describe("калькулятор на столе", () => {
	const texts = accountantTexts.calculator;

	it("кнопки, клавиатура и «В поле» вставляют результат в последнее выбранное поле", () => {
		render(<CalculatorBench />);
		const toField = screen.getByRole("button", { name: texts.toField });
		expect((toField as HTMLButtonElement).disabled).toBe(true);
		const input = screen.getByLabelText("НДФЛ Петрова");
		fireEvent.focus(input);
		for (const digit of ["5", "0", "6", "0", "0"]) {
			fireEvent.click(screen.getByRole("button", { name: digit }));
		}
		fireEvent.click(screen.getByRole("button", { name: texts.keyLabels["*"] }));
		const calculator = screen.getByTestId("calculator");
		fireEvent.keyDown(calculator, { key: "1" });
		fireEvent.keyDown(calculator, { key: "3" });
		fireEvent.keyDown(calculator, { key: "%" });
		fireEvent.keyDown(calculator, { key: "Enter" });
		expect(screen.getByLabelText(texts.display).textContent).toBe("6 578");
		expect(within(calculator).getByLabelText(texts.tapeTitle).textContent).toContain("6 578");
		fireEvent.click(screen.getByRole("button", { name: `В поле: НДФЛ Петрова` }));
		expect((input as HTMLInputElement).value).toBe("6578");
	});
});

describe("справочник", () => {
	it("открывается, переключает вкладки и закрывается", () => {
		const texts = accountantTexts.rulebook;
		render(<Rulebook defaultPosition={{ x: 0, y: 0 }} initialTab="ndfl" />);
		fireEvent.click(screen.getByRole("button", { name: texts.open }));
		expect(screen.getByRole("tab", { name: texts.tabs.ndfl }).getAttribute("aria-selected")).toBe("true");
		expect(screen.getByRole("tabpanel").textContent).toContain(texts.pages.ndfl[0]);
		fireEvent.click(screen.getByRole("tab", { name: texts.tabs.cash }));
		expect(screen.getByRole("tabpanel").textContent).toContain(texts.pages.cash[0]);
		fireEvent.click(screen.getByRole("button", { name: texts.close }));
		expect(screen.queryByRole("tabpanel")).toBeNull();
	});
});

function makeChrome(overrides: Partial<LevelChrome> = {}): LevelChrome {
	return {
		dayNumber: 2,
		levelTitle: "Закрытие месяца",
		startedAtMs: Date.now(),
		scoreText: "8 / 20",
		share: 0.9,
		messages: [],
		slips: [],
		notifications: [],
		removeSlip: vi.fn(),
		closeNotification: vi.fn(),
		onExitEarly: vi.fn(),
		isExitDisabled: false,
		...overrides,
	};
}

function renderWorkplace(chrome: LevelChrome) {
	return render(
		<LevelChromeProvider value={chrome}>
			<Workplace
				booth={{ character: "director", name: accountantTexts.boothCharacters.director, speech: accountantTexts.boothSpeech.postings }}
				monitorSection="operations"
				monitorTitle="Форма"
				monitor={<p>монитор</p>}
				desk={<p>стол</p>}
				rulebookTab="accounts"
			/>
		</LevelChromeProvider>,
	);
}

describe("рабочее место", () => {
	it("полоса дня, окошко с персонажем, монитор с программой и стол с инструментами", () => {
		const chrome = makeChrome();
		renderWorkplace(chrome);
		expect(screen.getByText("День 2")).toBeTruthy();
		expect(screen.getByText(chrome.levelTitle)).toBeTruthy();
		expect(screen.getByRole("img", { name: accountantTexts.boothCharacters.director })).toBeTruthy();
		expect(screen.getByTestId("booth-speech").textContent).toBe(accountantTexts.boothSpeech.postings);
		expect(screen.getByTestId("accounting-window").textContent).toContain(accountantTexts.window.appTitle);
		expect(screen.getByTestId("calculator")).toBeTruthy();
		expect(screen.getByRole("button", { name: accountantTexts.rulebook.open })).toBeTruthy();
		expect(screen.getByTestId("ficus").dataset.state).toBe("blooming");
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.window.exitEarly }));
		expect(chrome.onExitEarly).toHaveBeenCalledTimes(1);
	});

	it("замечание главбуха: правильный ответ, причина, шутка и кнопка «Убрать»", () => {
		const chrome = makeChrome({ slips: [{ id: 7, correct: "Правильно: Дт 60 Кт 51.", reason: "Оплата уменьшает долг.", joke: "Шутка." }] });
		renderWorkplace(chrome);
		const slips = screen.getByRole("complementary", { name: accountantTexts.slips.regionLabel });
		const text = within(slips).getByText(/Правильно/).closest("p")?.textContent ?? "";
		expect(text.indexOf("Правильно")).toBeLessThan(text.indexOf("Оплата"));
		expect(text.indexOf("Оплата")).toBeLessThan(text.indexOf("Шутка"));
		fireEvent.click(within(slips).getByRole("button", { name: accountantTexts.slips.removeLabel }));
		expect(chrome.removeSlip).toHaveBeenCalledWith(7);
	});

	it("часы рабочего дня идут от 09:00 и останавливаются на 18:00", () => {
		expect(formatWorkClock(0)).toBe("09:00");
		expect(formatWorkClock(15)).toBe("09:30");
		expect(formatWorkClock(100_000)).toBe("18:00");
		vi.useFakeTimers();
		renderWorkplace(makeChrome({ startedAtMs: Date.now() }));
		const clock = screen.getByLabelText(accountantTexts.workplace.clockLabel);
		expect(clock.textContent).toBe("09:00");
		act(() => {
			vi.advanceTimersByTime(30_000);
		});
		expect(clock.textContent).toBe("10:00");
	});
});
