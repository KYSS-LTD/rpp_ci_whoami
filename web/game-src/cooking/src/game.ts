// Сборка игры целиком (задачи 9.1 и 9.2): загрузка моделей, сообщение порталу о готовности, запуск симуляции, ввода, рендера
// и HUD по уровню из сообщения старта, цикл кадров, пауза (в том числе при скрытой вкладке), один итог порталу.
// Порядок и вызовы по interfaces.md (раздел 9) и записи SONNET-3 в inbox-opus.md. Все зависимости подменяются в тестах
// (GameModules). Точка входа страницы: main.ts. Владелец: Opus-агент.
import type { GameSnapshot, Hud, InputSource, LevelConfig, PortalBridgeApi, ResultReporter, SceneRenderer, ShiftPhase, Simulation } from "./contracts";
import { debugLog, isDebugEnabled } from "./config/debug";
import { getLevelConfig, isLevelId, pickVerifiedSeed } from "./config/levels";
import { createHud } from "./hud";
import { createResultReporter } from "./hud/reporter";
import { createInputSystem } from "./input";
import { createDishIcons, createFrameLoop, createSceneRenderer, prepareAssets } from "./render";
import { createSimulation } from "./sim/simulation";
import { systemTexts } from "./texts";

// Модули, из которых собирается игра. В тестах подменяются поддельными (в jsdom нет WebGL).
export interface GameModules {
	prepareAssets: typeof prepareAssets;
	createDishIcons: typeof createDishIcons;
	createSceneRenderer: typeof createSceneRenderer;
	createFrameLoop: typeof createFrameLoop;
	createHud: typeof createHud;
	createInputSystem: typeof createInputSystem;
	createResultReporter: typeof createResultReporter;
	createSimulation: typeof createSimulation;
}

// Настоящие модули игры.
export const defaultGameModules: GameModules = {
	prepareAssets,
	createDishIcons,
	createSceneRenderer,
	createFrameLoop,
	createHud,
	createInputSystem,
	createResultReporter,
	createSimulation,
};

// Зависимости игры.
export interface GameDeps {
	bridge: PortalBridgeApi;
	// Корневой элемент страницы (#game-root): в нём canvas, слой касаний и HUD.
	root: HTMLElement;
	// Подмена модулей (тесты).
	modules?: Partial<GameModules>;
	// Источник случайных чисел для выбора seed из проверенных (по умолчанию Math.random).
	random?: () => number;
	// Режим отладки (по умолчанию NEXT_PUBLIC_DEBUG).
	debug?: boolean;
	// Документ для слежения за видимостью вкладки (по умолчанию document).
	documentRef?: Document;
}

// Управление запущенной игрой (для тестов и main).
export interface GameHandle {
	// Освобождает всё без отправки результата порталу (аварийное закрытие).
	dispose(): void;
	// true после отправки результата или выхода (или после dispose).
	isClosed(): boolean;
	// Симуляция текущего уровня (null, пока старт от портала не пришёл).
	getSimulation(): Simulation | null;
	// Стоит ли игра на паузе.
	isPaused(): boolean;
}

// Запускает игру: грузит модели, сообщает порталу о готовности и по сообщению старта начинает уровень. Возвращает управление
// сразу после того, как модели загружены и подписка на старт оформлена (или null, если игра не может работать: портал уже
// получил сообщение об ошибке).
export async function startGame(deps: GameDeps): Promise<GameHandle | null> {
	const { bridge, root } = deps;
	const modules: GameModules = { ...defaultGameModules, ...deps.modules };
	const debug = deps.debug ?? isDebugEnabled;
	const random = deps.random ?? Math.random;
	const documentRef = deps.documentRef ?? document;
	const handle: { simulation: Simulation | null; paused: boolean; closed: boolean; cleanup: () => void } = { simulation: null, paused: false, closed: false, cleanup: () => undefined };

	let assets: Awaited<ReturnType<typeof prepareAssets>>;
	try {
		assets = await modules.prepareAssets({ bridge });
	} catch (error) {
		debugLog("game", "загрузка ресурсов упала", error);
		bridge.reportError(systemTexts.assetsFailed);
		return null;
	}
	// null: prepareAssets уже сообщил порталу об ошибке (нет WebGL или не загрузилась модель), результат не передаётся.
	if (!assets) {
		return null;
	}
	const loadedAssets = assets;

	// Готовность сообщается только теперь: первый вызов onStart это сообщение "ready". Уровень берётся из сообщения старта.
	bridge.onStart((start) => {
		if (handle.closed) {
			return;
		}
		if (!isLevelId(start.levelId)) {
			bridge.reportError(systemTexts.unexpectedError);
			return;
		}
		try {
			runLevel(getLevelConfig(start.levelId));
		} catch (error) {
			debugLog("game", "ошибка запуска уровня", error);
			handle.cleanup();
			bridge.reportError(systemTexts.unexpectedError);
		}
	});

	// Запуск уровня: симуляция, ввод, сцена, HUD, цикл кадров.
	function runLevel(level: LevelConfig): void {
		documentRef.title = systemTexts.documentTitle;
		const simulation = modules.createSimulation({ level, seed: pickVerifiedSeed(level, random) });
		handle.simulation = simulation;
		const input: InputSource = modules.createInputSystem({ root });
		let scene: SceneRenderer | null = null;
		let hud: Hud | null = null;
		let loop: ReturnType<typeof createFrameLoop> | null = null;
		let removeVisibilityListener: () => void = () => undefined;

		// Очистка снимает всё, что успело создаться (в том числе при сбое посреди запуска): цикл, подписку, ввод, HUD, сцену.
		handle.cleanup = () => {
			if (handle.closed) {
				return;
			}
			handle.closed = true;
			loop?.stop();
			removeVisibilityListener();
			input.dispose();
			hud?.dispose();
			scene?.dispose();
		};

		// Итог или выход отправлены: цикл останавливается, обработчики и ресурсы снимаются.
		const reporter: ResultReporter = modules.createResultReporter(bridge, () => {
			handle.cleanup();
		});

		const activeScene: SceneRenderer = modules.createSceneRenderer({ container: root, level, debug }, loadedAssets);
		scene = activeScene;
		const icons = modules.createDishIcons(loadedAssets);

		// Фаза смены по последнему снимку: время идёт только в running.
		let lastPhase: ShiftPhase = "ready";
		let inputEnabled = true;

		// Ввод включён, только пока смена идёт и пауза не включена: на стартовом экране, провале и паузе он не нужен.
		function syncInput(): void {
			const shouldBeEnabled = lastPhase === "running" && !handle.paused;
			if (shouldBeEnabled !== inputEnabled) {
				inputEnabled = shouldBeEnabled;
				input.setEnabled(shouldBeEnabled);
			}
		}

		function pauseGame(): void {
			if (handle.paused) {
				return;
			}
			handle.paused = true;
			input.reset();
			syncInput();
			hud?.setPaused(true);
		}

		function resumeGame(): void {
			if (!handle.paused) {
				return;
			}
			handle.paused = false;
			syncInput();
			hud?.setPaused(false);
		}

		hud = modules.createHud({
			root,
			level,
			callbacks: {
				onStartPressed: () => {
					simulation.start();
					lastPhase = simulation.getSnapshot().phase;
					syncInput();
				},
				onPauseRequested: pauseGame,
				onResumeRequested: resumeGame,
			},
			reporter,
			dishIcons: icons,
			inputMode: input.getMode(),
		});
		input.onModeChange((mode) => hud?.setInputMode(mode));
		// До нажатия "Начать" ввод выключен.
		input.setEnabled(false);
		inputEnabled = false;

		// Скрытая вкладка ставит игру на паузу: время симуляции не идёт, вернувшийся игрок видит меню паузы.
		const onVisibilityChange = (): void => {
			if (documentRef.visibilityState === "hidden" && lastPhase === "running") {
				pauseGame();
			}
		};
		documentRef.addEventListener("visibilitychange", onVisibilityChange);
		removeVisibilityListener = () => documentRef.removeEventListener("visibilitychange", onVisibilityChange);

		// Фатальная ошибка во время игры: порталу уходит одно сообщение об ошибке (без результата), игра закрывается.
		function failFatally(error: unknown): void {
			debugLog("game", "ошибка в кадре", error);
			if (!handle.closed) {
				bridge.reportError(systemTexts.unexpectedError);
			}
			handle.cleanup();
		}

		// Один кадр: шаги симуляции по вводу, снимок, события, сцена и HUD.
		function handleFrame(frameDtSec: number, nowMs: number): void {
			if (handle.closed) {
				return;
			}
			try {
				if (lastPhase === "running" && !handle.paused) {
					simulation.advance(frameDtSec, input.read());
				}
				const snapshot: GameSnapshot = simulation.getSnapshot();
				lastPhase = snapshot.phase;
				syncInput();
				// Смена завершена успешно или по времени: результат уходит порталу один раз, дальше игра закрывается.
				if (snapshot.phase === "finished" && snapshot.result) {
					const isSent = reporter.reportResult(snapshot.result);
					if (!isSent && !handle.closed) {
						// Мост отклонил результат (неверные числа): повторять каждый кадр бессмысленно, сообщаем об ошибке один раз.
						failFatally(new Error("мост отклонил итог смены"));
					}
					if (handle.closed) {
						return;
					}
				}
				const events = simulation.drainEvents();
				activeScene.render(snapshot, frameDtSec);
				activeScene.handleEvents(events);
				if (debug) {
					activeScene.setDebugInfo(simulation.getDebugInfo());
				}
				hud?.handleEvents(events);
				hud?.update(snapshot, nowMs);
			} catch (error) {
				failFatally(error);
			}
		}

		loop = modules.createFrameLoop({ onFrame: handleFrame });
		loop.start();
	}

	return {
		dispose: () => {
			handle.cleanup();
			handle.closed = true;
		},
		isClosed: () => handle.closed,
		getSimulation: () => handle.simulation,
		isPaused: () => handle.paused,
	};
}
