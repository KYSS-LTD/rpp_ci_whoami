import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	levelScenarios,
	type BalanceSheetData,
	type BankReconciliationData,
	type CashDeskData,
	type DocumentSortingData,
	type PayrollData,
	type PostingsData,
} from "../data/levels";
import { buildChiefReply } from "../logic/feedback";
import { createSeededRandom } from "../logic/shuffle";
import { accountantTexts } from "../texts";
import { buildMoveKeyframes, chooseMoveAnimation, chooseRejectAnimation, playMove, playReject } from "../ui/motion";
import { FormToolbar } from "../ui/parts";
import { useDrag } from "../ui/useDrag";
import { BalanceSheet, calculateBalanceTilt } from "./BalanceSheet";
import { BankReconciliation } from "./BankReconciliation";
import { CashDesk } from "./CashDesk";
import { DocumentSorting } from "./DocumentSorting";
import { Payroll, calculateScalesTilt } from "./Payroll";
import { Postings } from "./Postings";

const easyDocuments = levelScenarios.easy[0] as DocumentSortingData;
const easyCash = levelScenarios.easy[1] as CashDeskData;
const mediumOperations = levelScenarios.medium[0] as PostingsData;
const mediumStaff = levelScenarios.medium[1] as PayrollData;
const hardStatement = levelScenarios.hard[0] as BankReconciliationData;
const hardBalance = levelScenarios.hard[1] as BalanceSheetData;

function createHandlers() {
	return { onComplete: vi.fn(), onMistake: vi.fn(), onNotice: vi.fn(), onProgress: vi.fn() };
}

function byAttribute(attribute: string, value: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(`[${attribute}="${value}"]`);
	if (!element) {
		throw new Error(`нет элемента ${attribute}=${value}`);
	}
	return element;
}

const documentButton = (documentId: string) => byAttribute("data-item-id", documentId);
const stamp = (sectionId: string) => byAttribute("data-drop-target", sectionId);
const journalZone = (documentId: string) => document.querySelector<HTMLElement>(`tr[data-placed-id="${documentId}"]`)?.dataset.zone;

afterEach(() => {
	cleanup();
});

describe("разбор первичных документов на столе", () => {
	it("выбор документа и затем штампа переносит документ в журнал программы со штампом раздела", () => {
		const handlers = createHandlers();
		render(<DocumentSorting data={easyDocuments} hintsEnabled={false} random={createSeededRandom(1)} {...handlers} />);
		fireEvent.click(documentButton("supplierUpd"));
		expect(documentButton("supplierUpd").getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(stamp("purchases"));
		expect(journalZone("supplierUpd")).toBe("purchases");
		expect(document.querySelector('[data-item-id="supplierUpd"]')).toBeNull();
		const journal = screen.getByTestId("accounting-window");
		expect(within(journal).getByRole("img", { name: accountantTexts.sortingSections.purchases })).toBeTruthy();
	});

	it("клавиатура: Tab к документу, Enter, стрелки к штампу, Enter", () => {
		const handlers = createHandlers();
		render(<DocumentSorting data={easyDocuments} hintsEnabled={false} random={createSeededRandom(1)} {...handlers} />);
		const button = documentButton("salesAct");
		button.focus();
		fireEvent.keyDown(button, { key: "Enter" });
		expect(document.activeElement).toBe(stamp("cash"));
		fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
		fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
		fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
		expect(document.activeElement).toBe(stamp("sales"));
		fireEvent.keyDown(document.activeElement!, { key: "Enter" });
		expect(journalZone("salesAct")).toBe("sales");
		expect(handlers.onMistake).not.toHaveBeenCalled();
	});

	it("неверный штамп: документ остаётся на столе, главбух называет раздел и причину, очки снижаются", () => {
		const handlers = createHandlers();
		render(<DocumentSorting data={easyDocuments} hintsEnabled={false} random={createSeededRandom(1)} {...handlers} />);
		fireEvent.click(documentButton("pizzaFlyer"));
		fireEvent.click(stamp("sales"));
		expect(documentButton("pizzaFlyer")).toBeTruthy();
		const mistake = handlers.onMistake.mock.calls[0][0];
		expect(mistake).toEqual({ explanationId: "sorting.pizzaFlyer", values: { target: accountantTexts.sortingSections.trash } });
		const reply = buildChiefReply(mistake, accountantTexts.explanations);
		expect(reply?.correct).toContain(accountantTexts.sortingSections.trash);

		for (const document of easyDocuments.documents) {
			fireEvent.click(documentButton(document.id));
			fireEvent.click(stamp(document.sectionId));
		}
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith({ score: 9, hintsUsed: 0, mistakes: ["sorting.pizzaFlyer"] });
	});
});

describe("перетаскивание на Pointer Events", () => {
	function DragProbe({ onDrop, resolveTarget }: { onDrop: (itemId: string, targetId: string | null) => void; resolveTarget: () => string | null }) {
		const drag = useDrag({ onDrop: (event) => onDrop(event.itemId, event.targetId), resolveTarget });
		return (
			<button type="button" {...drag.getDragHandleProps("doc")}>
				drag-me
			</button>
		);
	}

	it("сдвиг больше порога и отпускание над целью вызывают onDrop", () => {
		const onDrop = vi.fn();
		render(<DragProbe onDrop={onDrop} resolveTarget={() => "bank"} />);
		const handle = screen.getByRole("button", { name: "drag-me" });
		expect(handle.style.touchAction).toBe("none");
		fireEvent.pointerDown(handle, { pointerId: 1, button: 0, pointerType: "mouse", clientX: 10, clientY: 10 });
		fireEvent.pointerMove(handle, { pointerId: 1, pointerType: "mouse", clientX: 60, clientY: 40 });
		expect(handle.style.transform).toBe("translate(50px, 30px)");
		fireEvent.pointerUp(handle, { pointerId: 1, pointerType: "mouse", clientX: 60, clientY: 40 });
		expect(onDrop).toHaveBeenCalledWith("doc", "bank");
		expect(handle.style.transform).toBe("");
	});

	it("короткое нажатие без сдвига не считается перетаскиванием", () => {
		const onDrop = vi.fn();
		render(<DragProbe onDrop={onDrop} resolveTarget={() => "bank"} />);
		const handle = screen.getByRole("button", { name: "drag-me" });
		fireEvent.pointerDown(handle, { pointerId: 2, button: 0, pointerType: "touch", clientX: 10, clientY: 10 });
		fireEvent.pointerMove(handle, { pointerId: 2, pointerType: "touch", clientX: 12, clientY: 11 });
		fireEvent.pointerUp(handle, { pointerId: 2, pointerType: "touch", clientX: 12, clientY: 11 });
		expect(onDrop).not.toHaveBeenCalled();
	});

	function dragElement(element: HTMLElement, pointerId: number, dx: number, dy: number) {
		fireEvent.pointerDown(element, { pointerId, button: 0, pointerType: "mouse", clientX: 0, clientY: 0 });
		fireEvent.pointerMove(element, { pointerId, pointerType: "mouse", clientX: dx, clientY: dy });
		fireEvent.pointerUp(element, { pointerId, pointerType: "mouse", clientX: dx, clientY: dy });
	}

	it("документ, брошенный на штамп, раскладывается; следующее нажатие не теряется", () => {
		const handlers = createHandlers();
		render(<DocumentSorting data={easyDocuments} hintsEnabled={false} random={createSeededRandom(1)} {...handlers} />);
		// В jsdom нет раскладки элементов: подменяем поиск цели под указателем.
		Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [stamp("bank")] });
		const paper = documentButton("paymentOrder").closest<HTMLElement>("[data-paper]")!;
		dragElement(documentButton("paymentOrder"), 3, 200, 50);
		expect(journalZone("paymentOrder")).toBe("bank");
		// Во время перетаскивания двигалась вся бумага, а не только кнопка на ней.
		expect(paper.style.transform).toBe("");
		const nextButton = documentButton("supplierUpd");
		fireEvent.pointerDown(nextButton, { pointerId: 4, button: 0, pointerType: "mouse", clientX: 5, clientY: 5 });
		fireEvent.pointerUp(nextButton, { pointerId: 4, pointerType: "mouse", clientX: 5, clientY: 5 });
		fireEvent.click(nextButton, { detail: 1 });
		expect(documentButton("supplierUpd").getAttribute("aria-pressed")).toBe("true");
		Reflect.deleteProperty(document, "elementsFromPoint");
	});

	it("документ, брошенный на пустой стол, остаётся там, куда его положили", () => {
		const handlers = createHandlers();
		render(<DocumentSorting data={easyDocuments} hintsEnabled={false} random={createSeededRandom(1)} {...handlers} />);
		Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [] });
		const paper = documentButton("timesheet").closest<HTMLElement>("[data-paper]")!;
		const startX = Number.parseInt(paper.style.getPropertyValue("--x"), 10);
		const startY = Number.parseInt(paper.style.getPropertyValue("--y"), 10);
		dragElement(documentButton("timesheet"), 5, 120, 40);
		expect(Number.parseInt(paper.style.getPropertyValue("--x"), 10)).toBe(startX + 120);
		expect(Number.parseInt(paper.style.getPropertyValue("--y"), 10)).toBe(startY + 40);
		expect(handlers.onMistake).not.toHaveBeenCalled();
		Reflect.deleteProperty(document, "elementsFromPoint");
	});

	it("бумагу можно двигать за заголовок", () => {
		render(<CashDesk data={easyCash} hintsEnabled={false} {...createHandlers()} />);
		Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [] });
		const cashBox = byAttribute("data-paper", "cashBox");
		const pads = byAttribute("data-paper", "orderPads");
		const header = within(cashBox).getByText(accountantTexts.cashPapers.boxTitle);
		dragElement(header, 6, 30, 15);
		expect(cashBox.style.getPropertyValue("--x")).toBe("50px");
		expect(pads).toBeTruthy();
		Reflect.deleteProperty(document, "elementsFromPoint");
	});
});

describe("анимации и снижение движения", () => {
	it("при снижении движения полёт и тряска заменяются появлением", () => {
		expect(chooseMoveAnimation(false)).toBe("fly");
		expect(chooseMoveAnimation(true)).toBe("appear");
		expect(chooseRejectAnimation(false, true)).toBe("return");
		expect(chooseRejectAnimation(false, false)).toBe("shake");
		expect(chooseRejectAnimation(true, true)).toBe("appear");
		expect(buildMoveKeyframes("appear", { dx: 100, dy: 0 }).some((frame) => "transform" in frame)).toBe(false);
	});

	it("элемент получает кадры выбранной ветки", () => {
		const element = document.createElement("div");
		const animate = vi.fn();
		element.animate = animate;
		expect(playMove(element, { dx: 40, dy: 10 }, true)).toBe("appear");
		expect(animate.mock.calls[0][0]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
		expect(playMove(element, { dx: 40, dy: 10 }, false)).toBe("fly");
		expect(String(animate.mock.calls[1][0][0].transform)).toContain("translate(40px, 10px)");
		expect(playReject(element, { dx: 5, dy: 5 }, true)).toBe("appear");
	});
});

describe("касса у окошка", () => {
	const paperTexts = accountantTexts.cashPapers;

	function serveVisitor(pad: "incomeOrder" | "outcomeOrder", amount: string) {
		fireEvent.click(screen.getByRole("radio", { name: pad === "incomeOrder" ? paperTexts.incomePad : paperTexts.outcomePad }));
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.cashDesk.amountLabel, { selector: "input" }), { target: { value: amount } });
		fireEvent.click(screen.getByRole("button", { name: paperTexts.handOver }));
	}

	it("посетитель в окошке и его просьба берутся из данных уровня", () => {
		render(<CashDesk data={easyCash} hintsEnabled={false} {...createHandlers()} />);
		const firstVisitor = accountantTexts.cashVisitors[easyCash.visitors[0].id];
		expect(screen.getByRole("img", { name: firstVisitor.name })).toBeTruthy();
		expect(screen.getByTestId("booth-speech").textContent).toBe(firstVisitor.speech);
	});

	it("бланк отрывается от блока, ввод «12 500,00» засчитывается, ордер уходит в окошко со штампом", () => {
		const handlers = createHandlers();
		render(<CashDesk data={easyCash} hintsEnabled={false} {...handlers} />);
		expect(screen.queryByRole("button", { name: paperTexts.handOver })).toBeNull();
		serveVisitor("incomeOrder", "12 500,00");
		expect(handlers.onMistake).not.toHaveBeenCalled();
		expect(handlers.onProgress).toHaveBeenLastCalledWith({ earned: 2, possible: 2 });
		const handed = screen.getByTestId("handed-order");
		expect(within(handed).getByRole("img", { name: accountantTexts.stamps.posted })).toBeTruthy();
		// Следующий посетитель уже в окошке.
		expect(screen.getByTestId("booth-speech").textContent).toBe(accountantTexts.cashVisitors.employeeOrlov.speech);
	});

	it("итог кассы: ошибка в документе, верные суммы и излишек 7 500 дают 9 очков", () => {
		const handlers = createHandlers();
		render(<CashDesk data={easyCash} hintsEnabled={false} {...handlers} />);
		serveVisitor("incomeOrder", "12500");
		serveVisitor("incomeOrder", "3000");
		serveVisitor("incomeOrder", "700");
		serveVisitor("incomeOrder", "9 300");
		expect(handlers.onMistake).toHaveBeenCalledWith({
			explanationId: "cash.document.employeeOrlov",
			values: { document: accountantTexts.cashDocumentTypes.outcomeOrder },
		});
		expect(screen.getByRole("img", { name: accountantTexts.boothCharacters.collector })).toBeTruthy();
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.cashDesk.surplusLabel, { selector: "input" }), { target: { value: "7 500" } });
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.post }));
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith({ score: 9, hintsUsed: 0, mistakes: ["cash.document.employeeOrlov"] });
	});

	it("неверная сумма к сдаче не даёт 2 очков, буквы в сумме не проводятся", () => {
		const handlers = createHandlers();
		render(<CashDesk data={easyCash} hintsEnabled={false} {...handlers} />);
		serveVisitor("incomeOrder", "сто");
		expect(screen.getByRole("alert").textContent).toBe(accountantTexts.miniGames.cashDesk.amountInvalid);
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.cashDesk.amountLabel, { selector: "input" }), { target: { value: "12500" } });
		fireEvent.click(screen.getByRole("button", { name: paperTexts.handOver }));
		serveVisitor("outcomeOrder", "3000");
		serveVisitor("incomeOrder", "700");
		serveVisitor("incomeOrder", "9300");
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.cashDesk.surplusLabel, { selector: "input" }), { target: { value: "27500" } });
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.post }));
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 8, mistakes: ["cash.surplus"] }));
	});
});

describe("проводки Дт/Кт", () => {
	function postCurrent(debit: string, credit: string, amount: string) {
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.postings.debitLabel), { target: { value: debit } });
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.postings.creditLabel), { target: { value: credit } });
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.postings.amountLabel, { selector: "input" }), { target: { value: amount } });
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.post }));
	}

	it("форма принимает счета из данных уровня, первичка лежит на столе", () => {
		render(<Postings data={mediumOperations} hintsEnabled {...createHandlers()} />);
		const debitSelect = screen.getByLabelText(accountantTexts.miniGames.postings.debitLabel) as HTMLSelectElement;
		const values = Array.from(debitSelect.options)
			.map((option) => option.value)
			.filter(Boolean);
		expect(values).toEqual(mediumOperations.accounts);
		for (const operation of mediumOperations.operations) {
			expect(screen.getByText(accountantTexts.operationPapers[operation.id].title)).toBeTruthy();
		}
	});

	it("неверный счёт: правильная проводка и причина до шутки; журнал и бумага отмечают проведение", () => {
		const handlers = createHandlers();
		render(<Postings data={mediumOperations} hintsEnabled={false} {...handlers} />);
		postCurrent("51", "60", "18 000");
		const mistake = handlers.onMistake.mock.calls[0][0];
		expect(mistake.explanationId).toBe("postings.paySupplier");
		const reply = buildChiefReply(mistake, accountantTexts.explanations)!;
		expect(reply.correct.replace(/\s/g, " ")).toBe("Правильно: Дт 60 Кт 51 на 18 000 ₽.");
		expect(reply.text.indexOf("Дт 60 Кт 51")).toBeLessThan(reply.text.indexOf(reply.reason));
		expect(reply.text.indexOf(reply.reason)).toBeLessThan(reply.text.indexOf(reply.joke));
		expect(document.querySelectorAll('[data-posted="true"]').length).toBe(1);
		const primary = byAttribute("data-paper", "primary-paySupplier");
		expect(within(primary).getByRole("img", { name: accountantTexts.stamps.posted })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.movements }));
		const movements = screen.getByRole("region", { name: accountantTexts.miniGames.postings.movementsTitle });
		expect(within(movements).getByText(/Дт 51/)).toBeTruthy();
	});

	it("подсказка отмечается и считается в итоге, все проводки верны", () => {
		const handlers = createHandlers();
		render(<Postings data={mediumOperations} hintsEnabled {...handlers} />);
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.hint }));
		expect(screen.getByText("Подсказка: Дт 60 Кт 51.")).toBeTruthy();
		for (const operation of mediumOperations.operations) {
			postCurrent(operation.debit, operation.credit, String(operation.amount));
		}
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith({ score: 10, hintsUsed: 1, mistakes: [] });
	});
});

describe("зарплата с НДФЛ", () => {
	function fillRow(employeeId: string, deduction: string, ndfl: string) {
		const name = accountantTexts.employees[employeeId];
		const texts = accountantTexts.miniGames.payroll;
		fireEvent.change(screen.getByLabelText(`${texts.deductionColumn}: ${name}`), { target: { value: deduction } });
		fireEvent.change(screen.getByLabelText(`${texts.ndflColumn}: ${name}`), { target: { value: ndfl } });
	}

	it("дети видны только в заявлениях на столе, у кого заявления нет, вычета нет", () => {
		render(<Payroll data={mediumStaff} hintsEnabled={false} {...createHandlers()} />);
		for (const employee of mediumStaff.employees) {
			const children = accountantTexts.deductionApplications.employees[employee.id] ?? [];
			expect(children).toHaveLength(employee.childrenCount);
			if (children.length > 0) {
				const application = byAttribute("data-paper", `application-${employee.id}`);
				expect(within(application).getAllByRole("listitem")).toHaveLength(children.length);
			} else {
				expect(document.querySelector(`[data-paper="application-${employee.id}"]`)).toBeNull();
			}
		}
		expect(screen.queryByRole("columnheader", { name: accountantTexts.miniGames.payroll.childrenColumn })).toBeNull();
	});

	it("сотрудник со стандартным вычетом: НДФЛ (52 000 - 1 400) × 13% = 6 578, к выплате 45 422", () => {
		render(<Payroll data={mediumStaff} hintsEnabled={false} {...createHandlers()} />);
		fillRow("petrov", "1400", "6 578");
		const row = screen.getByRole("row", { name: new RegExp(accountantTexts.employees.petrov) });
		expect(row.textContent?.replace(/\s/g, "")).toContain("45422");
	});

	it("6 верных из 8 полей дают 8 очков, весы наклоняются по доле верных", () => {
		const handlers = createHandlers();
		render(<Payroll data={mediumStaff} hintsEnabled={false} {...handlers} />);
		expect(Number(screen.getByTestId("payroll-scales").dataset.tilt)).toBe(16);
		fillRow("ivanova", "0", "5850");
		fillRow("petrov", "1400", "6578");
		fillRow("sidorova", "10 200", "3679");
		fillRow("kuznetsov", "0", "7976");
		expect(Number(screen.getByTestId("payroll-scales").dataset.tilt)).toBe(calculateScalesTilt(6, 8));
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith({ score: 8, hintsUsed: 0, mistakes: ["payroll.deduction", "payroll.ndfl"] });
		expect(handlers.onMistake).toHaveBeenCalledWith({
			explanationId: "payroll.ndfl",
			values: { name: accountantTexts.employees.kuznetsov, expected: expect.stringMatching(/7\s794/) },
		});
	});

	it("при всех верных полях весы уравновешены", () => {
		render(<Payroll data={mediumStaff} hintsEnabled={false} {...createHandlers()} />);
		fillRow("ivanova", "0", "5850");
		fillRow("petrov", "1400", "6578");
		fillRow("sidorova", "10200", "3679");
		fillRow("kuznetsov", "1400", "7794");
		expect(Number(screen.getByTestId("payroll-scales").dataset.tilt)).toBe(0);
		expect(screen.getByTestId("payroll-scales").textContent).toContain(accountantTexts.miniGames.payroll.scalesBalanced);
	});
});

describe("сверка с выпиской на двух листах", () => {
	const texts = accountantTexts.miniGames.bankReconciliation;

	function markRow(rowId: string, reason: string | null) {
		const rowText = accountantTexts.statementRows[rowId];
		fireEvent.click(screen.getAllByRole("button", { name: `${texts.markDiscrepancy}: ${rowText}` })[0]);
		if (reason) {
			fireEvent.change(screen.getAllByLabelText(`${texts.reasonLabel}: ${rowText}`)[0], { target: { value: reason } });
		}
	}

	it("сопоставление выбором: верная пара связывается, неверная возвращается с объяснением", () => {
		const handlers = createHandlers();
		render(<BankReconciliation data={hardStatement} hintsEnabled={false} random={createSeededRandom(5)} {...handlers} />);
		fireEvent.click(byAttribute("data-item-id", "bankVector"));
		fireEvent.click(byAttribute("data-drop-target", "ledgerPower"));
		expect(handlers.onMistake).toHaveBeenCalledWith({ explanationId: "reconciliation.badMatch" });
		fireEvent.click(byAttribute("data-item-id", "bankVector"));
		fireEvent.click(byAttribute("data-drop-target", "ledgerVector"));
		expect(screen.getAllByText(texts.matched)).toHaveLength(2);
	});

	it("1,5 за расхождение, 1 за причину, минус 1 за ложную отметку", () => {
		const handlers = createHandlers();
		render(<BankReconciliation data={hardStatement} hintsEnabled={false} random={createSeededRandom(5)} {...handlers} />);
		markRow("bankFee", "bankFee");
		markRow("ledgerPower", "inTransit");
		markRow("ledgerNdfl", null);
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 4 }));
		expect(handlers.onMistake).toHaveBeenCalledWith({
			explanationId: "reconciliation.falseMark",
			values: { row: accountantTexts.statementRows.ledgerNdfl },
		});
	});

	it("одна только ложная отметка даёт 0, а не минус", () => {
		const handlers = createHandlers();
		render(<BankReconciliation data={hardStatement} hintsEnabled={false} random={createSeededRandom(5)} {...handlers} />);
		markRow("ledgerVector", "bankFee");
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith(expect.objectContaining({ score: 0 }));
	});

	it("клавиатура: строка выписки, стрелки к строке учёта, Enter", () => {
		render(<BankReconciliation data={hardStatement} hintsEnabled={false} random={createSeededRandom(5)} {...createHandlers()} />);
		const bankRow = byAttribute("data-item-id", "bankNdfl");
		bankRow.focus();
		fireEvent.keyDown(bankRow, { key: "Enter" });
		for (let step = 0; step < 10 && document.activeElement?.getAttribute("data-drop-target") !== "ledgerNdfl"; step += 1) {
			fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
		}
		expect(document.activeElement?.getAttribute("data-drop-target")).toBe("ledgerNdfl");
		fireEvent.keyDown(document.activeElement!, { key: "Enter" });
		expect(screen.getAllByText(texts.matched)).toHaveLength(2);
	});
});

describe("бухгалтерский баланс", () => {
	function placeItem(itemId: string, lineId: string) {
		fireEvent.click(byAttribute("data-item-id", itemId));
		fireEvent.click(byAttribute("data-drop-target", lineId));
	}

	it("показывает все строки актива и пассива из данных", () => {
		render(<BalanceSheet data={hardBalance} hintsEnabled={false} {...createHandlers()} />);
		for (const lineId of [...hardBalance.assetLines, ...hardBalance.liabilityLines]) {
			expect(screen.getByText(accountantTexts.balanceLines[lineId])).toBeTruthy();
		}
	});

	it("сумма попадает в выбранную статью", () => {
		render(<BalanceSheet data={hardBalance} hintsEnabled={false} {...createHandlers()} />);
		placeItem("bankLoan", "borrowings");
		expect(within(byAttribute("data-drop-target", "borrowings")).getByText(accountantTexts.balanceItems.bankLoan)).toBeTruthy();
	});

	it("1 за каждую статью и 2 за нераспределённую прибыль, весы уравновешиваются", () => {
		const handlers = createHandlers();
		render(<BalanceSheet data={hardBalance} hintsEnabled={false} {...handlers} />);
		placeItem("machines", "inventories");
		expect(handlers.onMistake).toHaveBeenCalledWith({
			explanationId: "balance.item",
			values: { target: accountantTexts.balanceLines.fixedAssets, itemReason: accountantTexts.balanceItemReasons.machines },
		});
		for (const item of hardBalance.items) {
			placeItem(item.id, item.lineId);
		}
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.balanceSheet.computedLabel, { selector: "input" }), { target: { value: "95 000" } });
		expect(Number(screen.getByTestId("balance-scales").dataset.tilt)).toBe(0);
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith({ score: 9, hintsUsed: 0, mistakes: ["balance.item"] });
	});

	it("неверная прибыль не даёт 2 очков", () => {
		const handlers = createHandlers();
		render(<BalanceSheet data={hardBalance} hintsEnabled={false} {...handlers} />);
		for (const item of hardBalance.items) {
			placeItem(item.id, item.lineId);
		}
		fireEvent.change(screen.getByLabelText(accountantTexts.miniGames.balanceSheet.computedLabel, { selector: "input" }), { target: { value: "315000" } });
		expect(calculateBalanceTilt(315000, 535000)).toBeLessThan(0);
		fireEvent.click(screen.getByRole("button", { name: accountantTexts.buttons.postAndClose }));
		expect(handlers.onComplete).toHaveBeenCalledWith({ score: 8, hintsUsed: 0, mistakes: ["balance.computed"] });
	});
});

describe("кнопки формы", () => {
	it("подписи «Провести и закрыть», «Записать», «Провести», «Дт/Кт» берутся из texts", () => {
		const noop = () => undefined;
		render(<FormToolbar onPostAndClose={noop} onSave={noop} onPost={noop} onMovements={noop} />);
		const labels = screen.getAllByRole("button").map((button) => button.textContent);
		expect(labels).toEqual([
			accountantTexts.buttons.postAndClose,
			accountantTexts.buttons.save,
			accountantTexts.buttons.post,
			accountantTexts.buttons.movements,
		]);
		expect(labels).toEqual(["Провести и закрыть", "Записать", "Провести", "Дт/Кт"]);
	});
});
