import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requiredLevelIds, type LevelId } from "@/core/contract/types";
import { accountantManifest } from "../manifest";
import { tutorialTexts } from "../texts/tutorial";
import { accountantTexts } from "../texts";
import { MonthClose } from "../ui/parts";
import { AccountantLevel } from "./AccountantLevel";

// Мини-игры подменяются заглушками на настоящем рабочем месте: сценарий уровня проверяется без прохождения заданий.
// Заглушка показывает вид мини-игры и завершает её с очками, которые тест задаёт перед нажатием.
vi.mock("../minigames", async () => {
	const { Workplace } = await vi.importActual<typeof import("../desk/Workplace")>("../desk/Workplace");
	const FakeMiniGame = ({
		data,
		onComplete,
		onMistake,
		hintsEnabled,
	}: {
		data: { kind: string };
		onComplete: (outcome: { score: number; hintsUsed: number; mistakes: string[] }) => void;
		onMistake: (mistake: { explanationId: string; values?: Record<string, string> }) => void;
		hintsEnabled: boolean;
	}) => {
		// Настройки читаются в момент нажатия, чтобы тест мог менять очки между мини-играми.
		const readSettings = () => (globalThis as { fakeMiniGame?: { score: number; hintsUsed: number } }).fakeMiniGame ?? { score: 7, hintsUsed: 0 };
		return (
			<Workplace
				booth={{ character: "courier", name: "fake", speech: `fake-${data.kind}` }}
				monitorSection="home"
				monitorTitle={null}
				monitor={<p>hints-{String(hintsEnabled)}</p>}
				desk={
					<>
						<button type="button" onClick={() => onMistake({ explanationId: "postings.paySupplier", values: { debit: "60", credit: "51", amount: "18 000" } })}>
							fake-mistake
						</button>
						<button type="button" onClick={() => onComplete({ score: readSettings().score, hintsUsed: readSettings().hintsUsed, mistakes: [] })}>
							fake-complete
						</button>
					</>
				}
			/>
		);
	};
	return {
		miniGameComponents: new Proxy({}, { get: () => FakeMiniGame }),
	};
});

function setFakeMiniGame(score: number, hintsUsed = 0) {
	(globalThis as { fakeMiniGame?: { score: number; hintsUsed: number } }).fakeMiniGame = { score, hintsUsed };
}

function renderLevel(levelId: LevelId) {
	const onFinish = vi.fn();
	const level = accountantManifest.levels.find((definition) => definition.id === levelId)!;
	render(<AccountantLevel level={level} onFinish={onFinish} />);
	return onFinish;
}

function clickButton(name: string) {
	fireEvent.click(screen.getByRole("button", { name }));
}

function startLevel() {
	clickButton(accountantTexts.newspaper.openLetter);
	clickButton(accountantTexts.newspaper.start);
	clickButton(tutorialTexts.skip);
}

afterEach(() => {
	cleanup();
	setFakeMiniGame(7);
	vi.useRealTimers();
});

const expectedOrder: Record<LevelId, [string, string]> = {
	easy: ["documentSorting", "cashDesk"],
	medium: ["postings", "payroll"],
	hard: ["bankReconciliation", "balanceSheet"],
};

describe("сценарий уровня", () => {
	it.each(requiredLevelIds)("уровень %s: утро с газетой, мини-игра A, перерыв, мини-игра B, итоги дня", (levelId) => {
		renderLevel(levelId);
		const [kindA, kindB] = expectedOrder[levelId];
		expect(screen.getByText(accountantTexts.newspaper[levelId].headline)).toBeTruthy();
		expect(screen.queryByRole("heading", { name: accountantTexts.intros[levelId].subject })).toBeNull();
		clickButton(accountantTexts.newspaper.openLetter);
		expect(screen.getByRole("heading", { name: accountantTexts.intros[levelId].subject })).toBeTruthy();
		clickButton(accountantTexts.newspaper.start);
		expect(screen.getByText(tutorialTexts.steps.overviewWindow)).toBeTruthy();
		clickButton(tutorialTexts.next);
		expect(screen.getByText(tutorialTexts.steps.overviewDesk)).toBeTruthy();
		clickButton(tutorialTexts.next);
		expect(screen.getByText(`fake-${kindA}`)).toBeTruthy();
		clickButton("fake-complete");
		expect(screen.getByRole("heading", { name: accountantTexts.summaryScene.title })).toBeTruthy();
		expect(screen.getByTestId("summary-score").textContent).toBe("7 / 10");
		clickButton(accountantTexts.buttons.next);
		expect(screen.getByText(`fake-${kindB}`)).toBeTruthy();
		clickButton("fake-complete");
		expect(screen.getByRole("heading", { name: accountantTexts.monthClose.title })).toBeTruthy();
	});

	it("подсказка доступна только на medium", () => {
		renderLevel("medium");
		startLevel();
		expect(screen.getByText("hints-true")).toBeTruthy();
		cleanup();
		renderLevel("easy");
		startLevel();
		expect(screen.getByText("hints-false")).toBeTruthy();
	});
});

describe("отправка результата", () => {
	it("«Сдать отчёт» отправляет completed: true с суммой очков один раз", () => {
		setFakeMiniGame(8);
		const onFinish = renderLevel("easy");
		startLevel();
		clickButton("fake-complete");
		clickButton(accountantTexts.buttons.next);
		clickButton("fake-complete");
		const submit = screen.getByRole("button", { name: accountantTexts.buttons.submitReport });
		fireEvent.click(screen.getByRole("radio", { name: accountantTexts.professionReport.choices[2] }));
		expect(screen.getByText(`${accountantTexts.professionReport.match} · 90%`)).toBeTruthy();
		fireEvent.click(submit);
		fireEvent.click(submit);
		expect(onFinish).toHaveBeenCalledTimes(1);
		expect(onFinish).toHaveBeenCalledWith(
			expect.objectContaining({ gameId: "accountant-1c", levelId: "easy", score: 16, maxScore: 20, completed: true }),
		);
		expect((submit as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole("button", { name: accountantTexts.window.exitEarly }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText(accountantTexts.monthClose.sent)).toBeTruthy();
	});

	it("medium: 9 + 7 и подсказка в первой мини-игре дают 15, итоги дня показывают задания и подсказки", () => {
		const onFinish = renderLevel("medium");
		startLevel();
		setFakeMiniGame(9, 1);
		clickButton("fake-complete");
		clickButton(accountantTexts.buttons.next);
		setFakeMiniGame(7, 0);
		clickButton("fake-complete");
		const summary = screen.getByText(accountantTexts.daySummary.hintsLine).closest("table")!;
		expect(within(summary).getByRole("row", { name: new RegExp(accountantTexts.miniGames.postings.tab) }).textContent).toContain("8 / 10");
		expect(within(summary).getByRole("row", { name: new RegExp(accountantTexts.daySummary.hintsLine) }).textContent).toContain("1");
		clickButton(accountantTexts.buttons.submitReport);
		expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ levelId: "medium", score: 15, completed: true }));
	});

	it("выход во время второй мини-игры отдаёт completed: false с очками первой", () => {
		const onFinish = renderLevel("hard");
		startLevel();
		clickButton("fake-complete");
		clickButton(accountantTexts.buttons.next);
		clickButton(accountantTexts.window.exitEarly);
		clickButton(accountantTexts.window.exitEarly);
		expect(onFinish).toHaveBeenCalledTimes(1);
		expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ levelId: "hard", score: 7, maxScore: 20, completed: false }));
	});

	it("выход на утренней газете отдаёт completed: false с 0 очков", () => {
		const onFinish = renderLevel("easy");
		clickButton(accountantTexts.window.exitEarly);
		expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ score: 0, completed: false }));
	});
});

describe("лист «Итоги дня»", () => {
	it.each([
		[17, accountantTexts.monthClose.stamps.approved],
		[12, accountantTexts.monthClose.stamps.remarks],
		[8, accountantTexts.monthClose.stamps.taxDemand],
	])("при %i из 20 штамп «%s»", (score, stampText) => {
		render(<MonthClose levelScore={score} isSent={false} onSubmit={vi.fn()} />);
		expect(screen.getByRole("img", { name: stampText })).toBeTruthy();
	});
});

describe("рабочее место уровня", () => {
	it("окно программы: разделы, «Сообщения», нет названия чужой программы", () => {
		renderLevel("medium");
		const windowElement = screen.getByTestId("accounting-window");
		clickButton(accountantTexts.window.open);
		expect(within(windowElement).getByRole("navigation", { name: accountantTexts.window.sectionsLabel })).toBeTruthy();
		expect(within(windowElement).getByRole("region", { name: accountantTexts.window.messagesTitle })).toBeTruthy();
		expect(within(windowElement).getByText(accountantTexts.window.appTitle)).toBeTruthy();
		expect(windowElement.textContent).not.toMatch(/1С|1C|Предприятие/);
	});

	it("ошибка печатает замечание главбуха (ответ до шутки), его можно убрать; в «Сообщениях» остаётся строка", () => {
		renderLevel("medium");
		startLevel();
		clickButton("fake-mistake");
		const explanation = accountantTexts.explanations["postings.paySupplier"];
		const slips = screen.getByRole("complementary", { name: accountantTexts.slips.regionLabel });
		const slipText = within(slips).getByText(/Правильно: Дт 60 Кт 51/).closest("p")?.textContent ?? "";
		expect(slipText.indexOf("Дт 60 Кт 51")).toBeLessThan(slipText.indexOf(explanation.reason));
		expect(slipText.indexOf(explanation.reason)).toBeLessThan(slipText.indexOf(explanation.joke));
		fireEvent.click(within(slips).getByRole("button", { name: accountantTexts.slips.removeLabel }));
		expect(within(slips).queryByText(/Правильно/)).toBeNull();
		clickButton(accountantTexts.window.open);
		const messages = screen.getByRole("region", { name: accountantTexts.window.messagesTitle });
		expect(within(messages).getByText(/Правильно: Дт 60 Кт 51 на 18 000/)).toBeTruthy();
	});

	it("уведомления директора появляются, закрываются кнопкой и сами", () => {
		vi.useFakeTimers();
		renderLevel("easy");
		startLevel();
		expect(screen.getByText(accountantTexts.notifications.easy.start)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.window.closeNotification }));
		expect(screen.queryByText(accountantTexts.notifications.easy.start)).toBeNull();
		clickButton("fake-complete");
		clickButton(accountantTexts.buttons.next);
		expect(screen.getByText(accountantTexts.notifications.easy.beforeSecond)).toBeTruthy();
		act(() => {
			vi.advanceTimersByTime(10_000);
		});
		expect(screen.queryByText(accountantTexts.notifications.easy.beforeSecond)).toBeNull();
	});

	it("фикус следует точности уровня", () => {
		setFakeMiniGame(9);
		renderLevel("easy");
		expect(screen.getByTestId("ficus").dataset.state).toBe("growing");
		startLevel();
		clickButton("fake-complete");
		expect(screen.getByTestId("ficus").dataset.state).toBe("blooming");
		setFakeMiniGame(0);
		clickButton(accountantTexts.buttons.next);
		clickButton("fake-complete");
		// 9 из 20 = 45%: фикус поник.
		expect(screen.getByTestId("ficus").dataset.state).toBe("wilting");
	});
});
