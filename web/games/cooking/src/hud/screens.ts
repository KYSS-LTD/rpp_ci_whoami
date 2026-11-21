// Экраны HUD (задачи 7.5 и 7.6): стартовый экран с подсказками управления, пауза (кнопка и Escape), оверлей провала с причиной,
// просьба повернуть экран на телефоне. Все экраны это нативные модальные <dialog> (руководство modern-web-guidance: dialog):
// браузер сам делает страницу инертной, держит фокус внутри и возвращает его после закрытия.
// Время симуляции HUD не останавливает: пауза и старт идут через колбэки main (HudCallbacks), итог и выход отправляет reporter.
import type { FailureInfo, GameSnapshot, HudCallbacks, InputMode, ResultReporter, ShiftPhase, ShiftResult } from "../contracts";
import { controlsTexts, hudTexts } from "../texts";
import { closeModal, openModal } from "./dialogs";
import { createElement, setAttribute, setText } from "./dom";

// Строка подсказки управления: что нажать и что произойдёт (формат texts/controls.ts).
interface ControlHint {
	keys: string;
	action: string;
}

// Структура controlsTexts, которую читает HUD. Если поля нет (файл ещё не заполнен), список подсказок пуст.
interface ControlsTextsShape {
	hints?: { title?: string } & Partial<Record<InputMode, readonly ControlHint[]>>;
}

// Подсказки управления для режима ввода.
export function getControlHints(mode: InputMode, source: unknown = controlsTexts): { title: string; hints: readonly ControlHint[] } {
	const hints = (source as ControlsTextsShape).hints;
	return { title: hints?.title ?? "", hints: hints?.[mode] ?? [] };
}

// Параметры экранов.
export interface ScreensDeps {
	root: HTMLElement;
	callbacks: HudCallbacks;
	reporter: ResultReporter;
	inputMode: InputMode;
}

// Экраны HUD.
export interface Screens {
	readonly pauseButton: HTMLButtonElement;
	update(snapshot: GameSnapshot): void;
	setInputMode(mode: InputMode): void;
	setPaused(paused: boolean): void;
	// Пересчитывает ориентацию (вызывается при resize и смене режима).
	dispose(): void;
}

// Счётчик для уникальных идентификаторов заголовков диалогов (несколько HUD на странице в тестах).
let idCounter = 0;

// Создаёт экраны и добавляет диалоги в корень HUD.
export function createScreens(deps: ScreensDeps): Screens {
	const { root, callbacks, reporter } = deps;
	const ownerWindow = root.ownerDocument.defaultView ?? window;
	idCounter += 1;
	const idPrefix = `hud-${idCounter}`;

	let inputMode: InputMode = deps.inputMode;
	let phase: ShiftPhase = "ready";
	let paused = false;
	let startRequested = false;
	let lastSnapshot: GameSnapshot | null = null;

	// Создаёт модальный диалог с заголовком; closedby="none" запрещает закрытие без выбора игрока.
	function createDialog(name: string, titleText: string, options: { dismissible: boolean }): { dialog: HTMLDialogElement; title: HTMLHeadingElement } {
		const dialog = createElement("dialog", { className: `hud-dialog hud-dialog--${name}`, attributes: { "aria-labelledby": `${idPrefix}-${name}-title`, "data-input-ignore": "" } });
		if (!options.dismissible) {
			dialog.setAttribute("closedby", "none");
		}
		const title = createElement("h2", { className: "hud-dialog__title", text: titleText, attributes: { id: `${idPrefix}-${name}-title` } });
		dialog.append(title);
		return { dialog, title };
	}

	function createButton(text: string, className: string): HTMLButtonElement {
		return createElement("button", { className: `hud-button ${className}`, text, attributes: { type: "button" } });
	}

	// --- Стартовый экран ---
	const start = createDialog("start", hudTexts.start.title, { dismissible: false });
	const startGoal = createElement("p", { className: "hud-dialog__lead", text: hudTexts.start.goal });
	const rules = createElement("ul", { className: "hud-rules" });
	for (const rule of hudTexts.start.rules) {
		rules.append(createElement("li", { text: rule }));
	}
	const controlsSection = createElement("section", { className: "hud-controls", attributes: { "aria-labelledby": `${idPrefix}-controls-title` } });
	const controlsTitle = createElement("h3", { className: "hud-controls__title", attributes: { id: `${idPrefix}-controls-title` } });
	const controlsList = createElement("dl", { className: "hud-controls__list" });
	const pauseHint = createElement("p", { className: "hud-controls__pause-hint" });
	controlsSection.append(controlsTitle, controlsList, pauseHint);
	const startButton = createButton(hudTexts.start.startButton, "hud-button--primary");
	startButton.setAttribute("autofocus", "");
	const startActions = createElement("div", { className: "hud-start-actions" });
	startActions.append(startButton);
	start.dialog.append(startGoal, rules, controlsSection, startActions);

	// Список подсказок управления для текущего режима ввода.
	function renderControls(): void {
		const { title, hints } = getControlHints(inputMode);
		setText(controlsTitle, title);
		controlsSection.hidden = hints.length === 0;
		controlsList.replaceChildren(
			...hints.map((hint) => {
				const group = createElement("div", { className: "hud-controls__item" });
				group.append(createElement("dt", { text: hint.keys }), createElement("dd", { text: hint.action }));
				return group;
			}),
		);
		setText(pauseHint, inputMode === "touch" ? hudTexts.start.pauseHintTouch : hudTexts.start.pauseHintKeyboard);
	}

	// --- Пауза ---
	const pause = createDialog("pause", hudTexts.pause.title, { dismissible: true });
	const pauseActions = createElement("div", { className: "hud-dialog__actions" });
	const resumeButton = createButton(hudTexts.pause.resume, "hud-button--primary");
	resumeButton.setAttribute("autofocus", "");
	const exitButton = createButton("×", "hud-button--secondary hud-icon-button");
	exitButton.setAttribute("aria-label", hudTexts.pause.exit);
	exitButton.title = hudTexts.pause.exit;
	pauseActions.append(resumeButton, exitButton);
	const exitNote = createElement("p", { className: "hud-dialog__note", text: hudTexts.pause.exitHint });
	pause.dialog.append(pauseActions, exitNote);

	// Кнопка паузы в углу: значок из двух полос рисуется стилем, имя задаёт aria-label.
	const pauseButton = createElement("button", { className: "hud-pause-button", attributes: { type: "button", "aria-label": hudTexts.pause.buttonLabel, "data-input-ignore": "", "data-zone": "top-right" } });
	pauseButton.append(createElement("span", { className: "hud-pause-button__icon", attributes: { "aria-hidden": "true" } }));

	// --- Провал ---
	const failure = createDialog("failure", hudTexts.failure.title, { dismissible: false });
	const failureReason = createElement("p", { className: "hud-failure__reason", attributes: { id: `${idPrefix}-failure-reason` } });
	failure.dialog.setAttribute("aria-describedby", `${idPrefix}-failure-reason`);
	const failureScore = createElement("p", { className: "hud-failure__score" });
	const failureButton = createButton(hudTexts.failure.continueButton, "hud-button--primary");
	failureButton.setAttribute("autofocus", "");
	failure.dialog.append(failureReason, failureScore, failureButton);

	root.append(start.dialog, pause.dialog, failure.dialog);
	renderControls();

	// Итог для кнопки "Продолжить": результат смены из снимка или собранный по набранным очкам.
	function getFailureResult(): ShiftResult | null {
		if (lastSnapshot === null) {
			return null;
		}
		return lastSnapshot.result ?? { completed: false, score: lastSnapshot.score, maxScore: lastSnapshot.maxScore, reason: "failed" };
	}

	function fillFailure(snapshot: GameSnapshot): void {
		const info: FailureInfo | null = snapshot.failure;
		const dishName = info?.dish ? hudTexts.dishNames[info.dish] : null;
		setText(failureReason, info ? hudTexts.failure.reason(info.place, info.tableNumber, dishName) : hudTexts.failure.reason("table", null, null));
		setText(failureScore, hudTexts.failure.scoreSummary(snapshot.score, snapshot.maxScore));
	}

	// --- Обработчики ---
	function handleStart(): void {
		if (startRequested || phase !== "ready") {
			return;
		}
		startRequested = true;
		closeModal(start.dialog);
		callbacks.onStartPressed();
	}

	function handleFailureContinue(): void {
		const result = getFailureResult();
		if (result === null || reporter.isClosed) {
			return;
		}
		if (reporter.reportResult(result)) {
			failureButton.disabled = true;
		}
	}

	function handleExit(): void {
		if (reporter.reportExit()) {
			exitButton.disabled = true;
			resumeButton.disabled = true;
		}
	}

	function handlePauseButton(): void {
		if (phase === "running" && !paused && !reporter.isClosed) {
			callbacks.onPauseRequested();
		}
	}

	function handleResume(): void {
		if (paused && !reporter.isClosed) {
			callbacks.onResumeRequested();
		}
	}

	// Escape: во время смены просит паузу, на паузе просит продолжить. Нативное закрытие диалога подавляется.
	function handleKeyDown(event: KeyboardEvent): void {
		if ((event.key !== "Escape" && event.code !== "KeyP") || event.repeat || reporter.isClosed) {
			return;
		}
		if (paused) {
			event.preventDefault();
			callbacks.onResumeRequested();
		} else if (phase === "running") {
			event.preventDefault();
			callbacks.onPauseRequested();
		}
	}

	// Диалоги без права закрытия не закрываются Escape и жестом "назад".
	function preventCancel(event: Event): void {
		event.preventDefault();
	}

	// Escape или жест "назад" на паузе означают "продолжить".
	function handlePauseCancel(event: Event): void {
		event.preventDefault();
		handleResume();
	}

	startButton.addEventListener("click", handleStart);
	failureButton.addEventListener("click", handleFailureContinue);
	exitButton.addEventListener("click", handleExit);
	resumeButton.addEventListener("click", handleResume);
	pauseButton.addEventListener("click", handlePauseButton);
	pause.dialog.addEventListener("cancel", handlePauseCancel);
	for (const dialog of [start.dialog, failure.dialog]) {
		dialog.addEventListener("cancel", preventCancel);
	}
	ownerWindow.addEventListener("keydown", handleKeyDown);

	return {
		pauseButton,
		update(snapshot) {
			lastSnapshot = snapshot;
			phase = snapshot.phase;
			setAttribute(root, "data-phase", phase);
			pauseButton.hidden = phase !== "running";

			if (phase === "ready") {
				if (!startRequested) {
					openModal(start.dialog);
				}
			} else {
				startRequested = true;
				closeModal(start.dialog);
			}

			if (phase === "failed") {
				fillFailure(snapshot);
				openModal(failure.dialog);
				if (paused) {
					paused = false;
					closeModal(pause.dialog);
				}
			} else {
				closeModal(failure.dialog);
			}
		},
		setInputMode(mode) {
			inputMode = mode;
			renderControls();
		},
		setPaused(nextPaused) {
			paused = nextPaused;
			if (paused) {
				openModal(pause.dialog);
			} else {
				closeModal(pause.dialog);
			}
		},
		dispose() {
			ownerWindow.removeEventListener("keydown", handleKeyDown);
			for (const dialog of [start.dialog, pause.dialog, failure.dialog]) {
				closeModal(dialog);
				dialog.remove();
			}
			pauseButton.remove();
		},
	};
}
