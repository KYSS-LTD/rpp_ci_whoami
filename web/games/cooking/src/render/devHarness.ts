// Харнесс для визуальной проверки сцены и HUD (страница harness.html, не часть игры и не попадает в сборку).
// Загружает настоящие модели, строит сцену и по самодельному снимку (render/demoSnapshot.ts) гоняет персонажей и предметы.
// Параметры адреса описаны в harness.html. Тексты здесь отладочные и в файлы текстов не выносятся.
import "../base.css";
import { getLevelConfig, isLevelId } from "../config/levels";
import { applyCampaignDay, LAST_CAMPAIGN_DAY } from "../config/levels/campaign";
import { isDebugEnabled } from "../config/debug";
import { EMPTY_INPUT, SIM_STEP_SEC, type FailureInfo, type GameSnapshot, type InputMode, type PortalBridgeApi, type ShiftPhase } from "../contracts";
import { createBot } from "../bot/bot";
import { createInputSystem } from "../input";
import { createSimulation } from "../sim/simulation";
import { createHud } from "../hud";
import { createResultReporter } from "../hud/reporter";
import { CAMERA_PITCH_DEG } from "./camera";
import { createDemoSnapshot, type DemoOptions } from "./demoSnapshot";
import { createFrameLoop } from "./frameLoop";
import { createDishIcons, prepareAssets } from "./index";
import { createSceneRendererCore, createWebGLBackend } from "./sceneRenderer";

// Мост-заглушка: пишет вызовы в консоль, портала в харнессе нет.
function createLoggingBridge(): PortalBridgeApi {
	const log = (name: string, ...details: unknown[]) => console.info(`[harness bridge] ${name}`, ...details);
	return {
		protocolVersion: 1,
		isEmbedded: false,
		getLevelId: () => "easy",
		onStart: (callback) => callback({ gameId: "harness", levelId: "easy", progress: null }),
		finish: (result) => {
			log("finish", result);
			return true;
		},
		exit: () => log("exit"),
		saveProgress: () => true,
		reportError: (message) => {
			log("reportError", message);
			document.body.insertAdjacentText("afterbegin", `Ошибка: ${message}`);
		},
	};
}

// Параметры харнесса из адреса.
function readParams() {
	const params = new URLSearchParams(window.location.search);
	const levelParam = params.get("level") ?? "easy";
	const phaseParam = params.get("phase");
	const modeParam = params.get("mode");
	const elapsedParam = params.get("elapsed");
	return {
		levelId: isLevelId(levelParam) ? levelParam : "easy",
		phase: (phaseParam === "ready" || phaseParam === "failed" || phaseParam === "finished" ? phaseParam : "running") as ShiftPhase,
		mode: (modeParam === "touch" ? "touch" : "keyboard") as InputMode,
		elapsedSec: elapsedParam === null ? undefined : Number(elapsedParam),
		failKind: params.get("fail") === "queue" ? "queue" : "table",
		freeze: params.has("freeze"),
		// ?full: все места за всеми столами заняты заказами (демо-снимок).
		full: params.has("full"),
		// ?sim: вместо демо-снимка работает настоящая симуляция с вводом (клавиатура, мышь, касания).
		sim: params.has("sim") || params.has("bot"),
		// ?bot: вместо игрока играет эталонный бот (чтобы увидеть полный цикл готовки и подачи на живых данных); ?speed=N ускоряет.
		bot: params.has("bot"),
		speed: params.has("speed") ? Number(params.get("speed")) : 1,
		// ?debug: отладочный оверлей независимо от NEXT_PUBLIC_DEBUG.
		debug: params.has("debug"),
		// ?cam=x,z,расстояние: камера крупным планом на точке пола (для осмотра деталей).
		cam: params.get("cam")?.split(",").map(Number) ?? null,
		// ?time=секунды: начальное время демо-сценария.
		time: params.has("time") ? Number(params.get("time")) : 3,
		// ?day=1..5: рабочий день кампании (меню и мебель кухни этого дня). По умолчанию пятый день: кухня целиком.
		day: params.has("day") ? Number(params.get("day")) : LAST_CAMPAIGN_DAY,
	};
}

async function bootHarness(): Promise<void> {
	const root = document.getElementById("game-root");
	if (!root) {
		return;
	}
	const params = readParams();
	const createLevel = () => applyCampaignDay(getLevelConfig(params.levelId), params.day);
	const level = createLevel();
	const bridge = createLoggingBridge();
	const assets = await prepareAssets({ bridge });
	if (!assets) {
		return;
	}
	const scene = createSceneRendererCore({ container: root, level, debug: isDebugEnabled || params.debug }, assets, createWebGLBackend());
	const icons = createDishIcons(assets);
	// Состояние харнесса: фаза смены меняется кнопками HUD, как у main.
	let harnessPhase: ShiftPhase = params.phase;
	let paused = false;
	let timeSec = params.time;
	const failure: FailureInfo =
		params.failKind === "queue"
			? { place: "queue", groupId: "g-9", customerId: "c-9-1", tableId: null, tableNumber: null, dish: null }
			: { place: "table", groupId: "g-3", customerId: "c-3-1", tableId: "table-3", tableNumber: 3, dish: "stew" };
	const loopRef: { current: ReturnType<typeof createFrameLoop> | null } = { current: null };
	const hudRef: { current: ReturnType<typeof createHud> | null } = { current: null };
	const simulationRef: { current: ReturnType<typeof createSimulation> | null } = { current: null };
	const inputRef: { current: ReturnType<typeof createInputSystem> | null } = { current: null };
	const reporter = createResultReporter(bridge, () => {
		// Как в main: после итога или выхода цикл останавливается.
		loopRef.current?.stop();
		console.info("[harness] игра закрыта");
	});
	// Настоящая симуляция: те же вызовы, что у main (шаг по вводу, события, снимок), для проверки рендера и HUD на живых данных.
	const simulation = params.sim ? createSimulation({ level, seed: level.verifiedSeeds[0] }) : null;
	// В демо-режиме со сценарием касаний слой ввода создаётся ради вида стика и кнопок (проверка перекрытия HUD).
	const input = params.sim || params.mode === "touch" ? createInputSystem({ root }) : null;
	simulationRef.current = simulation;
	inputRef.current = input;

	const hud = createHud({
		root,
		level,
		callbacks: {
			onStartPressed: () => {
				harnessPhase = "running";
				simulationRef.current?.start();
			},
			onPauseRequested: () => {
				paused = true;
				inputRef.current?.reset();
				hudRef.current?.setPaused(true);
			},
			onResumeRequested: () => {
				paused = false;
				hudRef.current?.setPaused(false);
			},
		},
		reporter,
		dishIcons: icons,
		inputMode: input ? input.getMode() : params.mode,
		tutorialDishes: [],
		campaignDay: params.day,
	});
	hudRef.current = hud;
	input?.onModeChange((mode) => hud.setInputMode(mode));

	const bot = simulation && params.bot ? createBot(simulation) : null;
	let botTime = 0;

	const loop = createFrameLoop({
		onFrame: (frameDtSec, nowMs) => {
			if (simulation && input) {
				if (!paused) {
					if (bot) {
						// Бот выдаёт ввод на каждый шаг: шаги идут вручную, ускорение повторяет их несколько раз за кадр.
						botTime += frameDtSec * params.speed;
						let steps = 0;
						while (botTime >= SIM_STEP_SEC && steps < 600) {
							simulation.step(bot.nextInput());
							botTime -= SIM_STEP_SEC;
							steps += 1;
						}
					} else {
						simulation.advance(frameDtSec, input.read());
					}
				}
				const liveSnapshot = simulation.getSnapshot();
				const events = simulation.drainEvents();
				scene.render(liveSnapshot, frameDtSec);
				scene.handleEvents(events);
				hud.handleEvents(events);
				if (params.debug || isDebugEnabled) {
					scene.setDebugInfo(simulation.getDebugInfo());
				}
				hud.update(liveSnapshot, nowMs);
				return;
			}
			if (!params.freeze && !paused && harnessPhase !== "failed") {
				timeSec += frameDtSec;
			}
			const elapsedSec = harnessPhase === "ready" ? 0 : (params.elapsedSec ?? timeSec);
			const demoOptions: DemoOptions = { phase: harnessPhase, elapsedSec, failure: harnessPhase === "failed" ? failure : null, fillAllTables: params.full };
			const snapshot = createDemoSnapshot(level, timeSec, demoOptions);
			scene.render(snapshot, frameDtSec);
			hud.update(snapshot, nowMs);
		},
	});
	loopRef.current = loop;
	loop.start();
	// Камера крупным планом: та же наклонная проекция, что у игровой камеры, ближе к точке пола.
	function closeup(x: number, z: number, distance: number): void {
		const pitch = (CAMERA_PITCH_DEG * Math.PI) / 180;
		const camera = scene.camera;
		camera.position.set(x, distance * Math.sin(pitch), z + distance * Math.cos(pitch));
		camera.lookAt(x, 0, z);
		camera.updateMatrixWorld();
	}
	if (params.cam && params.cam.length === 3 && params.cam.every(Number.isFinite)) {
		closeup(params.cam[0], params.cam[1], params.cam[2]);
	}
	// Прокрутка бота без рендера (съёмка кадров превью): шаги идут подряд. Симуляция и бот детерминированы, поэтому лучший момент
	// сначала ищется на отдельной копии симуляции (scanBestStep), а потом основная симуляция проматывается до него (runBotSteps).
	// botSec: сколько секунд играет бот, дальше игрок бездействует (зал наполняется ожидающими заказами).
	function runBotSteps(stepCount: number, botSec = Number.POSITIVE_INFINITY): void {
		if (!simulation || !bot) {
			return;
		}
		for (let step = 0; step < stepCount && simulation.getResult() === null; step += 1) {
			simulation.step(step * SIM_STEP_SEC < botSec ? bot.nextInput() : EMPTY_INPUT);
			if (step % 600 === 0) {
				simulation.drainEvents();
			}
		}
		// События прокрутки не показываются подсказками HUD.
		simulation.drainEvents();
	}
	// Ищет шаг бота с наибольшей оценкой выразительности кадра. Оценка считается каждые 6 шагов не раньше minSec.
	function scanBestStep(score: (snapshot: GameSnapshot) => number, minSec: number, maxSec: number, botSec = Number.POSITIVE_INFINITY): { step: number; score: number } {
		const scanSimulation = createSimulation({ level: createLevel(), seed: level.verifiedSeeds[0] });
		const scanBot = createBot(scanSimulation);
		scanSimulation.start();
		let best = { step: 0, score: Number.NEGATIVE_INFINITY };
		const maxSteps = Math.ceil(maxSec / SIM_STEP_SEC);
		for (let step = 0; step < maxSteps && scanSimulation.getResult() === null; step += 1) {
			scanSimulation.step(step * SIM_STEP_SEC < botSec ? scanBot.nextInput() : EMPTY_INPUT);
			if (step % 6 === 0 && step * SIM_STEP_SEC >= minSec) {
				const value = score(scanSimulation.getSnapshot());
				if (value > best.score) {
					best = { step: step + 1, score: value };
				}
			}
			if (step % 600 === 0) {
				scanSimulation.drainEvents();
			}
		}
		return best;
	}
	const harnessWindow = window as unknown as { harness: unknown };
	harnessWindow.harness = { scene, hud, simulation, input, bot, runBotSteps, scanBestStep, icons, closeup, level, loop, setTime: (value: number) => (timeSec = value), params };
	console.info("[harness] готов", { level: params.levelId, icons: Object.keys(icons) });
}

void bootHarness();
