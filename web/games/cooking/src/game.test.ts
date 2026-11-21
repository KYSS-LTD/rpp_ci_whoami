// Тесты сборки игры (задачи 9.1 и 9.2) с подменой моста, моделей, сцены, HUD, ввода и цикла кадров:
// готовность после загрузки, уровень из сообщения старта, один результат, провал, выход, пауза, скрытая вкладка.
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_INPUT, type GameSnapshot, type HudOptions, type LevelId, type PortalBridgeApi, type ShiftPhase, type ShiftResult, type Simulation } from "./contracts";
import { createResultReporter } from "./hud/reporter";
import { createSimulation } from "./sim/simulation";
import { startGame, type GameModules } from "./game";

// Мост с шпионами: onStart запоминает обработчик, тест сам присылает старт.
function createFakeBridge() {
	let startHandler: ((start: { gameId: string; levelId: string; progress: unknown }) => void) | null = null;
	const bridge = {
		protocolVersion: 1,
		isEmbedded: true,
		getLevelId: (): LevelId => "easy",
		onStart: vi.fn((callback: (start: { gameId: string; levelId: string; progress: unknown }) => void) => {
			startHandler = callback;
		}),
		saveProgress: vi.fn(() => true),
		finish: vi.fn(() => true),
		exit: vi.fn(),
		reportError: vi.fn(),
	};
	return {
		bridge: bridge as unknown as PortalBridgeApi & typeof bridge,
		sendStart: (levelId: string, progress: unknown = null) => startHandler?.({ gameId: "cooking", levelId, progress }),
	};
}

// Подделки модулей. Симуляция по умолчанию настоящая, цикл кадров ручной.
function createFakeModules(overrides: Partial<GameModules> = {}) {
	const state = {
		onFrame: null as null | ((frameDtSec: number, nowMs: number) => void),
		loopRunning: false,
		hudOptions: null as HudOptions | null,
		sceneLevelId: null as LevelId | null,
		simulationSeed: null as number | null,
	};
	const scene = { render: vi.fn(), handleEvents: vi.fn(), setDebugInfo: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
	const hud = { update: vi.fn(), handleEvents: vi.fn(), setInputMode: vi.fn(), setPaused: vi.fn(), showDayComplete: vi.fn(), dispose: vi.fn() };
	const input = {
		read: vi.fn(() => EMPTY_INPUT),
		reset: vi.fn(),
		setEnabled: vi.fn(),
		getMode: vi.fn(() => "keyboard" as const),
		onModeChange: vi.fn(() => () => undefined),
		dispose: vi.fn(),
	};
	const loop = {
		start: vi.fn(() => {
			state.loopRunning = true;
		}),
		stop: vi.fn(() => {
			state.loopRunning = false;
		}),
		get isRunning() {
			return state.loopRunning;
		},
	};
	const modules: Partial<GameModules> = {
		prepareAssets: vi.fn(async () => ({}) as never),
		createDishIcons: vi.fn(() => ({})),
		createSceneRenderer: vi.fn((options: { level: { id: LevelId } }) => {
			state.sceneLevelId = options.level.id;
			return scene as never;
		}) as unknown as GameModules["createSceneRenderer"],
		createFrameLoop: vi.fn((options: { onFrame: (frameDtSec: number, nowMs: number) => void }) => {
			state.onFrame = options.onFrame;
			return loop as never;
		}) as unknown as GameModules["createFrameLoop"],
		createHud: vi.fn((options: HudOptions) => {
			state.hudOptions = options;
			return hud as never;
		}) as unknown as GameModules["createHud"],
		createInputSystem: vi.fn(() => input as never),
		createResultReporter,
		createSimulation: vi.fn((options: { level: Parameters<typeof createSimulation>[0]["level"]; seed: number }) => {
			state.simulationSeed = options.seed;
			return createSimulation(options);
		}) as unknown as GameModules["createSimulation"],
		...overrides,
	};
	return { modules, state, scene, hud, input, loop };
}

// Подставная симуляция с управляемой фазой для проверки логики main без игровой механики.
function createScriptedSimulation(initialPhase: ShiftPhase = "ready") {
	let phase: ShiftPhase = initialPhase;
	let result: ShiftResult | null = null;
	let advanceCalls = 0;
	const makeSnapshot = (): GameSnapshot =>
		({ phase, result, failure: null, tick: advanceCalls, elapsedSec: advanceCalls, timeLeftSec: 100 - advanceCalls }) as unknown as GameSnapshot;
	const listeners: Array<(event: unknown) => void> = [];
	const simulation = {
		subscribe: vi.fn((listener: (event: unknown) => void) => {
			listeners.push(listener);
			return () => undefined;
		}),
		start: vi.fn(() => {
			phase = "running";
		}),
		advance: vi.fn(() => {
			advanceCalls += 1;
			return 1;
		}),
		getSnapshot: vi.fn(makeSnapshot),
		drainEvents: vi.fn(() => []),
		getDebugInfo: vi.fn(() => ({ collisionGrid: {}, navGrid: {}, paths: [], chefProbe: null })),
	};
	return {
		simulation: simulation as unknown as Simulation & typeof simulation,
		setPhase: (nextPhase: ShiftPhase, nextResult: ShiftResult | null = null) => {
			phase = nextPhase;
			result = nextResult;
		},
		getAdvanceCalls: () => advanceCalls,
		emit: (event: unknown) => listeners.forEach((listener) => listener(event)),
	};
}

// Прогресс перед последним днём недели: завершение дня уже уходит порталу итогом.
const FINAL = { version: 2, cookedDishes: [], completedDays: { easy: 4, medium: 0, hard: 0 }, weekScores: { easy: { score: 120, maxScore: 160 }, medium: { score: 0, maxScore: 0 }, hard: { score: 0, maxScore: 0 } } };

// Запускает игру до подписки на старт и присылает старт уровня.
async function launch(levelId: string, overrides: Partial<GameModules> = {}, progress: unknown = null) {
	const fakeBridge = createFakeBridge();
	const fakes = createFakeModules(overrides);
	const root = document.createElement("div");
	document.body.append(root);
	const handle = await startGame({ bridge: fakeBridge.bridge, root, modules: fakes.modules, random: () => 0 });
	fakeBridge.sendStart(levelId, progress);
	return { ...fakeBridge, ...fakes, handle, root };
}

// Задаёт видимость вкладки и уведомляет подписчиков.
function setVisibility(state: "visible" | "hidden"): void {
	Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
	document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
	setVisibility("visible");
	document.body.innerHTML = "";
});

describe("запуск по сообщению портала", () => {
	it("сценарий 'Готовность после загрузки': пока модели грузятся, порталу о готовности не сообщается", async () => {
		const fakeBridge = createFakeBridge();
		let resolveAssets: (value: never) => void = () => undefined;
		const fakes = createFakeModules({ prepareAssets: vi.fn(() => new Promise((resolve) => (resolveAssets = resolve as typeof resolveAssets))) as unknown as GameModules["prepareAssets"] });
		const pending = startGame({ bridge: fakeBridge.bridge, root: document.createElement("div"), modules: fakes.modules });
		await Promise.resolve();
		expect(fakeBridge.bridge.onStart).not.toHaveBeenCalled();
		resolveAssets({} as never);
		const handle = await pending;
		expect(handle).not.toBeNull();
		expect(fakeBridge.bridge.onStart).toHaveBeenCalledTimes(1);
		// Смена не начинается без старта: симуляции ещё нет.
		expect(handle?.getSimulation()).toBeNull();
		expect(fakes.modules.createSimulation).not.toHaveBeenCalled();
	});

	it("сценарий 'Ошибка загрузки модели' и 'Нет WebGL': подготовка вернула null, готовность не сообщается, результата нет", async () => {
		const fakeBridge = createFakeBridge();
		const fakes = createFakeModules({ prepareAssets: vi.fn(async () => null) as unknown as GameModules["prepareAssets"] });
		const handle = await startGame({ bridge: fakeBridge.bridge, root: document.createElement("div"), modules: fakes.modules });
		expect(handle).toBeNull();
		expect(fakeBridge.bridge.onStart).not.toHaveBeenCalled();
		expect(fakeBridge.bridge.finish).not.toHaveBeenCalled();
	});

	it("падение загрузки с исключением сообщается порталу как ошибка", async () => {
		const fakeBridge = createFakeBridge();
		const fakes = createFakeModules({
			prepareAssets: vi.fn(async () => {
				throw new Error("сеть");
			}) as unknown as GameModules["prepareAssets"],
		});
		const handle = await startGame({ bridge: fakeBridge.bridge, root: document.createElement("div"), modules: fakes.modules });
		expect(handle).toBeNull();
		expect(fakeBridge.bridge.reportError).toHaveBeenCalledTimes(1);
		expect(fakeBridge.bridge.onStart).not.toHaveBeenCalled();
	});

	it.each(["easy", "medium", "hard"] as const)("сценарий 'Уровень из сообщения старта': старт с уровнем %s запускает параметры этого уровня", async (levelId) => {
		const game = await launch(levelId);
		expect(game.state.sceneLevelId).toBe(levelId);
		expect(game.state.hudOptions?.level.id).toBe(levelId);
		expect(game.handle?.getSimulation()?.level.id).toBe(levelId);
		// Seed взят из списка проверенных этого уровня.
		expect(game.handle?.getSimulation()?.level.verifiedSeeds).toContain(game.state.simulationSeed);
		expect(game.loop.start).toHaveBeenCalledTimes(1);
		expect(game.bridge.finish).not.toHaveBeenCalled();
	});

	it("неизвестный уровень в сообщении старта сообщается порталу как ошибка", async () => {
		const game = await launch("extreme");
		expect(game.bridge.reportError).toHaveBeenCalledTimes(1);
		expect(game.handle?.getSimulation()).toBeNull();
	});

	it("до 'Начать' время не идёт, ввод выключен; после 'Начать' смена идёт, ввод включён", async () => {
		const game = await launch("easy");
		expect(game.input.setEnabled).toHaveBeenLastCalledWith(false);
		for (let frame = 0; frame < 120; frame += 1) {
			game.state.onFrame?.(1 / 60, frame * 16);
		}
		expect(game.handle?.getSimulation()?.getSnapshot().tick).toBe(0);
		expect(game.hud.update).toHaveBeenCalled();
		game.state.hudOptions?.callbacks.onStartPressed();
		expect(game.input.setEnabled).toHaveBeenLastCalledWith(true);
		for (let frame = 0; frame < 60; frame += 1) {
			game.state.onFrame?.(1 / 60, frame * 16);
		}
		expect(game.handle?.getSimulation()?.getSnapshot().tick).toBeGreaterThan(50);
		expect(game.scene.render).toHaveBeenCalled();
	});
});

describe("результат и выход", () => {
	it("сценарий 'Следующий день': успешный день не последний, итог порталу не уходит, игра показывает экран дня и по кнопке запускает следующий", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] });
		game.state.hudOptions?.callbacks.onStartPressed();
		game.state.onFrame?.(1 / 60, 0);
		scripted.setPhase("finished", { completed: true, score: 40, maxScore: 50, reason: "allServed" });
		game.state.onFrame?.(1 / 60, 16);
		game.state.onFrame?.(1 / 60, 32);
		expect(game.hud.showDayComplete).toHaveBeenCalledTimes(1);
		expect(game.hud.showDayComplete).toHaveBeenCalledWith({ day: 1, score: 40, maxScore: 50 });
		expect(game.bridge.finish).not.toHaveBeenCalled();
		expect(game.bridge.saveProgress).toHaveBeenLastCalledWith(expect.objectContaining({ weekScores: expect.objectContaining({ easy: { score: 40, maxScore: 50 } }) }));
		expect(game.handle?.isClosed()).toBe(false);
		const firstHud = game.state.hudOptions;
		firstHud?.callbacks.onNextDayRequested?.();
		expect(game.hud.dispose).toHaveBeenCalledTimes(1);
		expect(game.scene.dispose).toHaveBeenCalledTimes(1);
		expect(game.state.hudOptions).not.toBe(firstHud);
		expect(game.state.hudOptions?.campaignDay).toBe(2);
		expect(game.handle?.isClosed()).toBe(false);
	});

	it("сценарий 'Результат передан один раз': успешное завершение последнего дня отправляется ровно один раз с общими очками недели (120 + 40 из 160 + 50), затем всё останавливается", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] }, FINAL);
		game.state.hudOptions?.callbacks.onStartPressed();
		game.state.onFrame?.(1 / 60, 0);
		expect(scripted.simulation.advance).toHaveBeenCalledTimes(1);
		scripted.setPhase("finished", { completed: true, score: 40, maxScore: 50, reason: "allServed" });
		game.state.onFrame?.(1 / 60, 16);
		expect(game.bridge.finish).toHaveBeenCalledTimes(1);
		expect(game.bridge.finish).toHaveBeenCalledWith({ score: 160, maxScore: 210, completed: true });
		expect(game.loop.stop).toHaveBeenCalledTimes(1);
		expect(game.input.dispose).toHaveBeenCalledTimes(1);
		expect(game.hud.dispose).toHaveBeenCalledTimes(1);
		expect(game.scene.dispose).toHaveBeenCalledTimes(1);
		expect(game.handle?.isClosed()).toBe(true);
		// Сценарий 'Повторная передача исключена': новые кадры и кнопки HUD ничего не отправляют.
		const advanceCalls = scripted.getAdvanceCalls();
		game.state.onFrame?.(1 / 60, 32);
		expect(scripted.getAdvanceCalls()).toBe(advanceCalls);
		expect(game.state.hudOptions?.reporter.reportResult({ completed: false, score: 0, maxScore: 50, reason: "failed" })).toBe(false);
		expect(game.state.hudOptions?.reporter.reportExit()).toBe(false);
		expect(game.bridge.finish).toHaveBeenCalledTimes(1);
		expect(game.bridge.exit).not.toHaveBeenCalled();
	});

	it("сценарий 'Клиент ушёл': провал сам результат не отправляет, итог уходит только после 'Продолжить' в HUD, один раз", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] });
		game.state.hudOptions?.callbacks.onStartPressed();
		game.state.onFrame?.(1 / 60, 0);
		const failedResult: ShiftResult = { completed: false, score: 12, maxScore: 50, reason: "failed" };
		scripted.setPhase("failed", failedResult);
		game.state.onFrame?.(1 / 60, 16);
		// Игра замерла, ввод выключен, результата порталу ещё нет.
		expect(game.input.setEnabled).toHaveBeenLastCalledWith(false);
		expect(game.bridge.finish).not.toHaveBeenCalled();
		const advanceCalls = scripted.getAdvanceCalls();
		game.state.onFrame?.(1 / 60, 32);
		expect(scripted.getAdvanceCalls()).toBe(advanceCalls);
		// Игрок нажал "Продолжить": HUD отправляет итог через reporter.
		expect(game.state.hudOptions?.reporter.reportResult(failedResult)).toBe(true);
		expect(game.state.hudOptions?.reporter.reportResult(failedResult)).toBe(false);
		expect(game.bridge.finish).toHaveBeenCalledTimes(1);
		expect(game.bridge.finish).toHaveBeenCalledWith({ score: 12, maxScore: 50, completed: false });
		expect(game.handle?.isClosed()).toBe(true);
		expect(game.loop.stop).toHaveBeenCalled();
	});

	it("сценарий 'Игрок вышел посреди смены': выход из паузы сообщает порталу exit без результата", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] });
		game.state.hudOptions?.callbacks.onStartPressed();
		game.state.onFrame?.(1 / 60, 0);
		game.state.hudOptions?.callbacks.onPauseRequested();
		expect(game.hud.setPaused).toHaveBeenLastCalledWith(true);
		expect(game.input.reset).toHaveBeenCalled();
		expect(game.handle?.isPaused()).toBe(true);
		expect(game.state.hudOptions?.reporter.reportExit()).toBe(true);
		expect(game.bridge.exit).toHaveBeenCalledTimes(1);
		expect(game.bridge.finish).not.toHaveBeenCalled();
		expect(game.loop.stop).toHaveBeenCalledTimes(1);
		expect(game.handle?.isClosed()).toBe(true);
	});
});

describe("прогресс блюд и подсказки", () => {
	const dishAccepted = (dish: string) => ({ type: "dishAccepted", windowDishId: "wd-1", orderId: "o-1", dish, t: 1 });

	it("сценарий 'Первое приготовление': первое принятое окном блюдо отправляется порталу один раз, повтор не отправляется", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] });
		scripted.emit(dishAccepted("burger"));
		expect(game.bridge.saveProgress).toHaveBeenCalledTimes(1);
		expect(game.bridge.saveProgress).toHaveBeenLastCalledWith({ version: 1, cookedDishes: ["burger"] });
		scripted.emit(dishAccepted("burger"));
		expect(game.bridge.saveProgress).toHaveBeenCalledTimes(1);
		scripted.emit(dishAccepted("ham"));
		expect(game.bridge.saveProgress).toHaveBeenCalledTimes(2);
		expect(game.bridge.saveProgress).toHaveBeenLastCalledWith({ version: 1, cookedDishes: ["burger", "ham"] });
	});

	it("сценарий 'Прогресс из старта': знакомые блюда не попадают в список подсказок и не отправляются повторно", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch(
			"medium",
			{ createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] },
			{ version: 1, cookedDishes: ["burger", "ham"] },
		);
		// Сценарий 'Список блюд для подсказок': в меню medium остаётся только овощной бургер.
		expect(game.state.hudOptions?.tutorialDishes).toEqual(["veggieBurger"]);
		scripted.emit(dishAccepted("burger"));
		expect(game.bridge.saveProgress).not.toHaveBeenCalled();
		scripted.emit(dishAccepted("veggieBurger"));
		expect(game.bridge.saveProgress).toHaveBeenLastCalledWith({ version: 1, cookedDishes: ["burger", "ham", "veggieBurger"] });
	});

	it("сценарий 'Битый блок' и старт без блока: подсказки по всем блюдам меню", async () => {
		const withoutBlock = await launch("hard");
		expect(withoutBlock.state.hudOptions?.tutorialDishes).toEqual(["burger", "ham", "veggieBurger", "stew"]);
		const broken = await launch("easy", {}, { version: 99, cookedDishes: "бургер" });
		expect(broken.state.hudOptions?.tutorialDishes).toEqual(["burger", "ham"]);
	});

	it("все блюда меню знакомы: список подсказок пуст", async () => {
		const game = await launch("easy", {}, { version: 1, cookedDishes: ["burger", "ham"] });
		expect(game.state.hudOptions?.tutorialDishes).toEqual([]);
	});

	it("сценарий 'Автоматическое прохождение прогресс не меняет': без ввода игрока блюда не принимаются и блок не отправляется", async () => {
		const game = await launch("easy");
		game.state.hudOptions?.callbacks.onStartPressed();
		for (let frame = 0; frame < 600; frame += 1) {
			game.state.onFrame?.(1 / 60, frame * 16);
		}
		expect(game.handle?.getSimulation()?.getSnapshot().tick).toBeGreaterThan(500);
		expect(game.bridge.saveProgress).not.toHaveBeenCalled();
	});
});

describe("сбои во время игры", () => {
	it("мост отклонил итог: порталу уходит одна ошибка, игра закрывается и больше не зовёт finish", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] }, FINAL);
		game.bridge.finish.mockReturnValue(false);
		game.state.hudOptions?.callbacks.onStartPressed();
		game.state.onFrame?.(1 / 60, 0);
		scripted.setPhase("finished", { completed: true, score: 5, maxScore: 10, reason: "allServed" });
		game.state.onFrame?.(1 / 60, 16);
		expect(game.bridge.reportError).toHaveBeenCalledTimes(1);
		expect(game.handle?.isClosed()).toBe(true);
		expect(game.loop.stop).toHaveBeenCalled();
		game.state.onFrame?.(1 / 60, 32);
		game.state.onFrame?.(1 / 60, 48);
		expect(game.bridge.finish).toHaveBeenCalledTimes(1);
		expect(game.bridge.reportError).toHaveBeenCalledTimes(1);
	});

	it("сбой при создании сцены: порталу уходит одна ошибка, уже созданный ввод освобождается, цикл не запускается", async () => {
		const game = await launch("easy", {
			createSceneRenderer: vi.fn(() => {
				throw new Error("нет контекста WebGL");
			}) as unknown as GameModules["createSceneRenderer"],
		});
		expect(game.bridge.reportError).toHaveBeenCalledTimes(1);
		expect(game.input.dispose).toHaveBeenCalledTimes(1);
		expect(game.loop.start).not.toHaveBeenCalled();
		expect(game.bridge.finish).not.toHaveBeenCalled();
	});

	it("исключение внутри кадра: одно сообщение об ошибке, цикл и обработчики остановлены, результата нет", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] });
		game.state.hudOptions?.callbacks.onStartPressed();
		game.scene.render.mockImplementation(() => {
			throw new Error("сбой отрисовки");
		});
		game.state.onFrame?.(1 / 60, 0);
		expect(game.bridge.reportError).toHaveBeenCalledTimes(1);
		expect(game.handle?.isClosed()).toBe(true);
		expect(game.loop.stop).toHaveBeenCalledTimes(1);
		expect(game.input.dispose).toHaveBeenCalledTimes(1);
		game.state.onFrame?.(1 / 60, 16);
		expect(game.bridge.reportError).toHaveBeenCalledTimes(1);
		expect(game.bridge.finish).not.toHaveBeenCalled();
	});
});

describe("пауза", () => {
	it("на паузе время не идёт, после продолжения идёт; повторный запрос паузы безопасен", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] });
		game.state.hudOptions?.callbacks.onStartPressed();
		game.state.onFrame?.(1 / 60, 0);
		expect(scripted.getAdvanceCalls()).toBe(1);
		game.state.hudOptions?.callbacks.onPauseRequested();
		game.state.hudOptions?.callbacks.onPauseRequested();
		expect(game.hud.setPaused).toHaveBeenCalledTimes(1);
		for (let frame = 0; frame < 30; frame += 1) {
			game.state.onFrame?.(1 / 60, frame * 16);
		}
		expect(scripted.getAdvanceCalls()).toBe(1);
		// Сцена и HUD при этом продолжают рисоваться.
		expect(game.hud.update).toHaveBeenCalled();
		game.state.hudOptions?.callbacks.onResumeRequested();
		expect(game.hud.setPaused).toHaveBeenLastCalledWith(false);
		expect(game.input.setEnabled).toHaveBeenLastCalledWith(true);
		game.state.onFrame?.(1 / 60, 500);
		expect(scripted.getAdvanceCalls()).toBe(2);
	});

	it("сценарий 'Вкладка скрыта': за 30 секунд в другой вкладке таймер смены не уходит вперёд", async () => {
		const game = await launch("easy");
		game.state.hudOptions?.callbacks.onStartPressed();
		for (let frame = 0; frame < 120; frame += 1) {
			game.state.onFrame?.(1 / 60, frame * 16);
		}
		const before = game.handle?.getSimulation()?.getSnapshot();
		expect(before?.elapsedSec).toBeGreaterThan(1.9);
		// Вкладка скрыта: игра ставится на паузу.
		setVisibility("hidden");
		expect(game.handle?.isPaused()).toBe(true);
		expect(game.hud.setPaused).toHaveBeenLastCalledWith(true);
		// Браузер мог присылать кадры редко и с большим dt: 30 секунд без продвижения времени.
		for (let frame = 0; frame < 300; frame += 1) {
			game.state.onFrame?.(0.1, 10000 + frame * 100);
		}
		setVisibility("visible");
		const after = game.handle?.getSimulation()?.getSnapshot();
		expect(after?.elapsedSec).toBe(before?.elapsedSec);
		expect(after?.timeLeftSec).toBe(before?.timeLeftSec);
		expect(after?.tick).toBe(before?.tick);
		// Игрок возвращается и продолжает: время снова идёт.
		game.state.hudOptions?.callbacks.onResumeRequested();
		game.state.onFrame?.(1 / 60, 50000);
		expect(game.handle?.getSimulation()?.getSnapshot().tick).toBeGreaterThan(before?.tick ?? 0);
	});

	it("скрытая вкладка до начала смены паузу не включает", async () => {
		const game = await launch("easy");
		setVisibility("hidden");
		expect(game.handle?.isPaused()).toBe(false);
		expect(game.hud.setPaused).not.toHaveBeenCalled();
	});

	it("после закрытия подписка на видимость вкладки снята", async () => {
		const scripted = createScriptedSimulation();
		const game = await launch("easy", { createSimulation: vi.fn(() => scripted.simulation) as unknown as GameModules["createSimulation"] });
		game.state.hudOptions?.callbacks.onStartPressed();
		game.state.onFrame?.(1 / 60, 0);
		game.state.hudOptions?.reporter.reportExit();
		setVisibility("hidden");
		expect(game.hud.setPaused).not.toHaveBeenCalled();
	});
});

describe("отладка", () => {
	it("при debug = true сцене каждый кадр отдаются отладочные данные, иначе нет", async () => {
		const fakeBridge = createFakeBridge();
		const withDebug = createFakeModules();
		await startGame({ bridge: fakeBridge.bridge, root: document.createElement("div"), modules: withDebug.modules, debug: true });
		fakeBridge.sendStart("easy");
		withDebug.state.onFrame?.(1 / 60, 0);
		expect(withDebug.scene.setDebugInfo).toHaveBeenCalled();

		const withoutDebug = await launch("easy");
		withoutDebug.state.onFrame?.(1 / 60, 0);
		expect(withoutDebug.scene.setDebugInfo).not.toHaveBeenCalled();
	});
});
