// Экраны HUD (задачи 7.5 и 7.6): стартовый экран с подсказками управления, пауза (кнопка и Escape), оверлей провала с причиной,
// просьба повернуть экран на телефоне. Все экраны это нативные модальные <dialog> (руководство modern-web-guidance: dialog):
// браузер сам делает страницу инертной, держит фокус внутри и возвращает его после закрытия.
// Время симуляции HUD не останавливает: пауза и старт идут через колбэки main (HudCallbacks), итог и выход отправляет reporter.
import type { DishId, FailureInfo, GameSnapshot, HudCallbacks, InputMode, ResultReporter, ShiftPhase, ShiftResult } from "../contracts";
import { dishTutorials } from "../config/tutorial";
import { controlsTexts, hudTexts } from "../texts";
import { closeModal, openModal } from "./dialogs";
import { preloadTutorialImages, TUTORIAL_DIR } from "./tutorialPreload";
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
	tutorialDishes: readonly DishId[];
	campaignDay: number;
}

// Экраны HUD.
export interface Screens {
	readonly pauseButton: HTMLButtonElement;
	update(snapshot: GameSnapshot): void;
	setInputMode(mode: InputMode): void;
	setPaused(paused: boolean): void;
	showDayComplete(info: { day: number; score: number; maxScore: number }): void;
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
	let tutorialDismissed = deps.tutorialDishes.length === 0;
	let tutorialDishIndex = 0;
	let tutorialStepIndex = 0;
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
	const prologue = createElement("p", { className: "hud-dialog__note", text: hudTexts.start.prologue });
	const dayLabel = createElement("p", { className: "hud-day-label", text: hudTexts.start.dayLabel(deps.campaignDay) });
	const dayGoal = createElement("p", { className: "hud-dialog__lead", text: hudTexts.start.dayGoal });
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
	const startButton = createButton(deps.tutorialDishes.length > 0 ? hudTexts.start.tutorialButton : hudTexts.start.startButton, "hud-button--primary");
	startButton.setAttribute("autofocus", "");
	const startActions = createElement("div", { className: "hud-start-actions" });
	startActions.append(startButton);
	start.dialog.append(prologue, dayLabel, dayGoal, startGoal, rules, controlsSection, startActions);

	// Подсказки рецептов открываются до смены. Для reduced motion <picture> подставляет неподвижный постер вместо GIF.
	// Картинки всех шагов начинают грузиться сразу, пока игрок читает стартовый экран (hud/tutorialPreload.ts).
	const tutorialPreload = { images: preloadTutorialImages(deps.tutorialDishes) };
	const tutorial = createDialog("tutorial", "", { dismissible: false });
	const tutorialCount = createElement("p", { className: "hud-day-label", attributes: { "aria-live": "polite" } });
	const tutorialCaption = createElement("p", { className: "hud-dialog__lead", attributes: { "aria-live": "polite" } });
	const tutorialPicture = createElement("picture", { className: "hud-tutorial__picture" });
	const tutorialPoster = createElement("source", { attributes: { media: "(prefers-reduced-motion: reduce)" } });
	const tutorialImage = createElement("img", { className: "hud-tutorial__image", attributes: { alt: "" } });
	tutorialPicture.append(tutorialPoster, tutorialImage);
	const tutorialActions = createElement("div", { className: "hud-dialog__actions" });
	const tutorialNext = createButton(hudTexts.tutorial.next, "hud-button--primary");
	const tutorialSkip = createButton(hudTexts.tutorial.skip, "hud-button--secondary");
	tutorialActions.append(tutorialNext, tutorialSkip);
	tutorial.dialog.append(tutorialCount, tutorialPicture, tutorialCaption, tutorialActions);

	function currentTutorial() {
		const dish = deps.tutorialDishes[tutorialDishIndex];
		return dish ? dishTutorials[dish] : null;
	}

	function renderTutorialStep(): void {
		const config = currentTutorial();
		const dish = deps.tutorialDishes[tutorialDishIndex];
		const step = config?.steps[tutorialStepIndex];
		if (!dish || !step || !config) return;
		setText(tutorial.title, hudTexts.tutorial.title(hudTexts.dishNames[dish]));
		setText(tutorialCount, hudTexts.tutorial.stepLabel(tutorialStepIndex + 1, config.steps.length));
		setText(tutorialCaption, hudTexts.tutorial.steps[step.id as keyof typeof hudTexts.tutorial.steps]);
		tutorialPoster.setAttribute("srcset", `${TUTORIAL_DIR}${step.posterFile}`);
		tutorialImage.src = `${TUTORIAL_DIR}${step.animationFile}`;
		tutorialImage.alt = hudTexts.dishNames[dish];
		setText(tutorialNext, tutorialStepIndex + 1 < config.steps.length || tutorialDishIndex + 1 < deps.tutorialDishes.length
			? hudTexts.tutorial.next : hudTexts.tutorial.done);
	}

	function finishTutorials(): void {
		tutorialDismissed = true;
		tutorialPreload.images = [];
		setText(startButton, hudTexts.start.startButton);
		closeModal(tutorial.dialog);
		if (phase === "ready" && !startRequested) openModal(start.dialog);
	}

	function advanceTutorial(): void {
		const config = currentTutorial();
		if (!config) return finishTutorials();
		if (tutorialStepIndex + 1 < config.steps.length) {
			tutorialStepIndex += 1;
			renderTutorialStep();
			return;
		}
		if (tutorialDishIndex + 1 < deps.tutorialDishes.length) {
			tutorialDishIndex += 1;
			tutorialStepIndex = 0;
			renderTutorialStep();
			return;
		}
		finishTutorials();
	}

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
	const pauseButton = createElement("button", { className: "hud-pause-button", attributes: { type: "button", "aria-label": hudTexts.pause.buttonLabel, "data-input-ignore": "" } });
	pauseButton.append(createElement("span", { className: "hud-pause-button__icon", attributes: { "aria-hidden": "true" } }));

	// --- Провал ---
	const failure = createDialog("failure", hudTexts.failure.title, { dismissible: false });
	const failureReason = createElement("p", { className: "hud-failure__reason", attributes: { id: `${idPrefix}-failure-reason` } });
	failure.dialog.setAttribute("aria-describedby", `${idPrefix}-failure-reason`);
	const failureScore = createElement("p", { className: "hud-failure__score" });
	const failureButton = createButton(hudTexts.failure.continueButton, "hud-button--primary");
	failureButton.setAttribute("autofocus", "");
	failure.dialog.append(failureReason, failureScore, failureButton);

	// --- Конец рабочего дня ---
	const dayComplete = createDialog("day-complete", "", { dismissible: false });
	const dayCompleteLead = createElement("p", { className: "hud-failure__reason", text: hudTexts.dayComplete.lead });
	const dayCompleteScore = createElement("p", { className: "hud-failure__score" });
	const dayCompleteButton = createButton(hudTexts.dayComplete.nextButton, "hud-button--primary");
	dayCompleteButton.setAttribute("autofocus", "");
	dayComplete.dialog.append(dayCompleteLead, dayCompleteScore, dayCompleteButton);

	root.append(start.dialog, tutorial.dialog, pause.dialog, failure.dialog, dayComplete.dialog);
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
		setText(failureReason, info ? hudTexts.failure.reason(info.place, dishName) : hudTexts.failure.reason("table", null));
		setText(failureScore, hudTexts.failure.scoreSummary(snapshot.score, snapshot.maxScore));
	}

	// --- Обработчики ---
	function handleStart(): void {
		if (startRequested || phase !== "ready") {
			return;
		}
		if (!tutorialDismissed) {
			closeModal(start.dialog);
			renderTutorialStep();
			openModal(tutorial.dialog);
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

	function handleNextDay(): void {
		dayCompleteButton.disabled = true;
		callbacks.onNextDayRequested?.();
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
		if (event.key === "Escape" && tutorial.dialog.open) {
			event.preventDefault();
			finishTutorials();
			return;
		}
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
	tutorialNext.addEventListener("click", advanceTutorial);
	tutorialSkip.addEventListener("click", finishTutorials);
	tutorial.dialog.addEventListener("cancel", (event) => {
		event.preventDefault();
		finishTutorials();
	});
	failureButton.addEventListener("click", handleFailureContinue);
	dayCompleteButton.addEventListener("click", handleNextDay);
	exitButton.addEventListener("click", handleExit);
	resumeButton.addEventListener("click", handleResume);
	pauseButton.addEventListener("click", handlePauseButton);
	pause.dialog.addEventListener("cancel", handlePauseCancel);
	for (const dialog of [start.dialog, failure.dialog, dayComplete.dialog]) {
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
				// Пока открыты подсказки рецептов, стартовое окно не возвращаем: оно перекрыло бы их.
				if (!startRequested && !tutorial.dialog.open) {
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
		showDayComplete(info) {
			setText(dayComplete.title, hudTexts.dayComplete.title(info.day));
			setText(dayCompleteScore, hudTexts.failure.scoreSummary(info.score, info.maxScore));
			dayCompleteButton.disabled = false;
			openModal(dayComplete.dialog);
		},
		dispose() {
			ownerWindow.removeEventListener("keydown", handleKeyDown);
			for (const dialog of [start.dialog, tutorial.dialog, pause.dialog, failure.dialog, dayComplete.dialog]) {
				closeModal(dialog);
				dialog.remove();
			}
			pauseButton.remove();
		},
	};
}
