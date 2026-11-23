"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bridgeProtocolVersion, buildLevelUrl, buildStartMessage, parseGameMessage, portalMessageSource } from "@/core/bridge";
import type { PracticeResult } from "@/core/bridge/protocol";
import { defaultReadyTimeoutSec, type IframeRuntime, type LevelDefinition, type LevelResult } from "@/core/contract/types";
import type { Checkpoint } from "@/core/progress/checkpoints";
import { debugLog } from "@/core/debug";
import { commonTexts } from "@/texts/common";
import { GameViewport } from "./GameViewport";
import { LevelFallback } from "./LevelFallback";
import styles from "./GameViewport.module.css";

interface IframeLevelProps {
	gameId: string;
	gameTitle: string;
	level: LevelDefinition;
	runtime: IframeRuntime;
	// Результат уровня с gameId, levelId и временем запуска. Проверку и сохранение делает LevelRunner.
	onFinish: (result: LevelResult) => void;
	onPracticeFinish?: (result: PracticeResult) => void;
	// Игра вышла без итогового результата.
	onExitWithoutResult: (saveFailed: boolean) => void;
	progress?: unknown;
	loadProgress?: () => { progress: unknown; checkpoints: Record<string, Checkpoint> };
	onCheckpoint?: (slot: string, data: Checkpoint | null) => boolean;
	onSaveProgress?: (data: Record<string, unknown>) => void;
}

// Этапы уровня на стороне портала (docs/game-bridge-protocol.md). finished и abandoned рисует LevelRunner.
type LevelPhase = "loading" | "running" | "failed";

// Уровень iframe-игры (capability game-iframe-bridge): сборка в изолированном фрейме и обмен сообщениями по протоколу.
export function IframeLevel({ gameId, gameTitle, level, runtime, onFinish, onPracticeFinish, onExitWithoutResult, progress = null, onSaveProgress, loadProgress, onCheckpoint }: IframeLevelProps) {
	const router = useRouter();
	const exitTimer = useRef<number | undefined>(undefined);
	const [checkpointFailed, setCheckpointFailed] = useState(false);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [phase, setPhase] = useState<LevelPhase>("loading");
	// Номер попытки: повтор после сбоя пересоздаёт фрейм через key.
	const [attempt, setAttempt] = useState({ number: 0, automatic: false });

	// Обработчик сообщений читает свежие значения через ref, чтобы не переподписываться на каждое изменение.
	const phaseRef = useRef<LevelPhase>("loading");
	const startedAtRef = useRef(0);
	const hasResultRef = useRef(false);
	const freeMode = Boolean(onPracticeFinish);
	const frameUrl = `${buildLevelUrl(runtime.entry, level.id)}${freeMode ? "&mode=free" : ""}${attempt.number ? `&retry=${attempt.number}` : ""}`;
	const callbacksRef = useRef({ onFinish, onPracticeFinish, onExitWithoutResult, onSaveProgress, progress, loadProgress, onCheckpoint });
	useEffect(() => {
		callbacksRef.current = { onFinish, onPracticeFinish, onExitWithoutResult, onSaveProgress, progress, loadProgress, onCheckpoint };
	}, [onFinish, onPracticeFinish, onExitWithoutResult, onSaveProgress, progress, loadProgress, onCheckpoint]);

	function exitToGames() {
		if (exitTimer.current !== undefined) return;
		const frameWindow = frameRef.current?.contentWindow;
		if (!frameWindow || phaseRef.current !== "running") {
			router.push("/games");
			return;
		}
		exitTimer.current = window.setTimeout(() => {
			exitTimer.current = undefined;
			router.push("/games");
		}, 750);
		frameWindow.postMessage({ source: portalMessageSource, version: bridgeProtocolVersion, type: "save-checkpoint" }, "*");
	}

	function changePhase(nextPhase: LevelPhase) {
		phaseRef.current = nextPhase;
		setPhase(nextPhase);
	}

	// Подписка на сообщения фрейма текущей попытки.
	useEffect(() => {
		phaseRef.current = "loading";
		hasResultRef.current = false;
		let lastCheckpointFailed = false;

		function handleMessage(event: MessageEvent) {
			const frameWindow = frameRef.current?.contentWindow;
			// Сообщения принимаются только от своего фрейма. event.origin у изолированного фрейма всегда "null".
			if (!frameWindow || event.source !== frameWindow) {
				return;
			}
			const parsed = parseGameMessage(event.data);
			if (!parsed.ok) {
				debugLog("bridge", "сообщение игры проигнорировано", parsed.reason, event.data);
				return;
			}
			const message = parsed.message;
			const currentPhase = phaseRef.current;

			if (message.type === "ready" && currentPhase === "loading") {
				// targetOrigin "*": у изолированного фрейма нет адресуемого источника, а в сообщении нет секретов.
				const saved = callbacksRef.current.loadProgress?.();
				frameWindow.postMessage(buildStartMessage(gameId, level.id, saved ? saved.progress : callbacksRef.current.progress, saved?.checkpoints), "*");
				startedAtRef.current = Date.now();
				phaseRef.current = "running";
				setPhase("running");
				frameRef.current?.focus();
				return;
			}
			if (message.type === "checkpoint" && currentPhase === "running" && !hasResultRef.current) {
				if (callbacksRef.current.onCheckpoint) {
					const saved = callbacksRef.current.onCheckpoint(message.slot, message.data);
					lastCheckpointFailed = !saved;
					setCheckpointFailed(lastCheckpointFailed);
					if (!saved && exitTimer.current !== undefined) {
						window.clearTimeout(exitTimer.current);
						exitTimer.current = undefined;
					}
				}
				return;
			}
			if (message.type === "checkpoint-saved" && exitTimer.current !== undefined) {
				window.clearTimeout(exitTimer.current);
				exitTimer.current = undefined;
				router.push("/games");
				return;
			}
			if (message.type === "progress" && currentPhase === "running" && !hasResultRef.current) {
				callbacksRef.current.onSaveProgress?.(message.data);
				return;
			}
			if (message.type === "practice-result" && freeMode && currentPhase === "running" && !hasResultRef.current) {
				hasResultRef.current = true;
				callbacksRef.current.onPracticeFinish?.(message);
				return;
			}
			if (message.type === "level-result" && !freeMode && currentPhase === "running" && !hasResultRef.current) {
				hasResultRef.current = true;
				callbacksRef.current.onFinish({
					gameId,
					levelId: level.id,
					score: message.score,
					maxScore: message.maxScore,
					completed: message.completed,
					durationSec: Math.round((Date.now() - startedAtRef.current) / 1000),
				});
				return;
			}
			if (message.type === "exit" && currentPhase !== "failed" && !hasResultRef.current) {
				callbacksRef.current.onExitWithoutResult(lastCheckpointFailed);
				return;
			}
			if (message.type === "error" && currentPhase !== "failed" && !hasResultRef.current) {
				debugLog("bridge", "игра сообщила об ошибке", message.message);
				phaseRef.current = "failed";
				setPhase("failed");

				return;
			}
			debugLog("bridge", `сообщение ${message.type} не подходит этапу ${currentPhase}`);
		}

		window.addEventListener("message", handleMessage);
		// Быстрая сборка может отправить ready сразу после загрузки. Сначала подключаем обработчик.
		const frame = frameRef.current;
		if (frame && frame.getAttribute("src") !== frameUrl) frame.setAttribute("src", frameUrl);
		return () => {
			window.clearTimeout(exitTimer.current);
			exitTimer.current = undefined;
			window.removeEventListener("message", handleMessage);
		};
	}, [gameId, level.id, frameUrl, freeMode, router]);

	// Разрешение Gamepad для изолированного iframe различается между браузерами.
	// В таком случае портал передаёт игре только значения органов управления, без данных об устройстве.
	useEffect(() => {
		if (gameId !== "uav-operator" || phase !== "running" || !navigator.getGamepads) return;
		let frame = 0;
		let lastSample = "";
		function poll() {
			try {
				const pad = !document.hidden && document.activeElement === frameRef.current
					? Array.from(navigator.getGamepads()).find((entry) => entry?.connected && entry.mapping === "standard")
					: undefined;
				const sample = pad ? {
					axes: pad.axes.slice(0, 4).map((axis) => Math.round(axis * 100) / 100),
					buttons: [0, 1, 2, 3, 9].map((index) => Boolean(pad.buttons[index]?.pressed)),
				} : null;
				const serialized = JSON.stringify(sample);
				if (serialized !== lastSample) {
					lastSample = serialized;
					frameRef.current?.contentWindow?.postMessage({ source: "portal", type: "gamepad", sample }, "*");
				}
			} catch {
				return;
			}
			frame = requestAnimationFrame(poll);
		}
		frame = requestAnimationFrame(poll);
		return () => cancelAnimationFrame(frame);
	}, [gameId, phase]);

	// Таймаут загрузки: если игра не прислала ready вовремя, показывается запасной экран.
	useEffect(() => {
		if (phase !== "loading") {
			return;
		}
		const timeoutMs = (runtime.readyTimeoutSec ?? defaultReadyTimeoutSec) * 1000;
		const timerId = window.setTimeout(() => {
			if (phaseRef.current !== "loading") return;
			debugLog("bridge", `игра не прислала ready за ${timeoutMs} мс`);
			if (!attempt.automatic) {
				phaseRef.current = "failed";
				setAttempt({ number: attempt.number + 1, automatic: true });
				return;
			}
			phaseRef.current = "failed";
			setPhase("failed");

		}, timeoutMs);
		return () => window.clearTimeout(timerId);
	}, [phase, attempt, runtime.readyTimeoutSec]);

	if (phase === "failed") {
		return (
			<LevelFallback
				onRetry={() => {
					changePhase("loading");
					setAttempt({ number: attempt.number + 1, automatic: false });
				}}
			/>
		);
	}

	return (
		<GameViewport
			title={gameTitle}
			heading={level.title}
			afterToggle={() => frameRef.current?.focus()}
			actions={
				<Link href="/games" className={`button-secondary ${styles.fullscreenButton}`}
					aria-label={onCheckpoint ? commonTexts.saveAndExit : commonTexts.levelExit} title={onCheckpoint ? commonTexts.saveAndExit : commonTexts.levelExit} onNavigate={(event) => {
						event.preventDefault();
						exitToGames();
					}}><span aria-hidden="true">×</span></Link>
			}
		>
			{checkpointFailed ? <p role="alert">{commonTexts.levelSaveError}</p> : null}
			<div className={styles.stage} data-phase={phase}>
				<iframe
					key={attempt.number}
					ref={frameRef}
					className={styles.frame}
					title={gameTitle}
					sandbox={gameId === "uav-operator" ? "allow-scripts allow-popups allow-popups-to-escape-sandbox" : "allow-scripts"}
					allow="autoplay; gamepad *"
				/>
				{phase === "loading" ? (
					<div className={styles.loading} role="status">
						<span className={styles.spinner} aria-hidden="true" />
						{attempt.automatic ? commonTexts.levelRetrying : commonTexts.levelLoading}
					</div>
				) : null}
			</div>
		</GameViewport>
	);
}
