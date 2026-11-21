"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildLevelUrl, buildStartMessage, parseGameMessage } from "@/core/bridge";
import type { PracticeResult } from "@/core/bridge/protocol";
import { defaultReadyTimeoutSec, type IframeRuntime, type LevelDefinition, type LevelResult } from "@/core/contract/types";
import { debugLog } from "@/core/debug";
import { commonTexts } from "@/texts/common";
import { LevelFallback } from "./LevelFallback";
import styles from "./IframeLevel.module.css";

interface IframeLevelProps {
	gameId: string;
	gameTitle: string;
	level: LevelDefinition;
	runtime: IframeRuntime;
	// Результат уровня с gameId, levelId и временем запуска. Проверку и сохранение делает LevelRunner.
	onFinish: (result: LevelResult) => void;
	onPracticeFinish?: (result: PracticeResult) => void;
	// Игра сообщила о выходе без результата: показать экран незавершённого уровня, ничего не сохранять.
	onExitWithoutResult: () => void;
	progress?: unknown;
	onSaveProgress?: (data: Record<string, unknown>) => void;
}

// Этапы уровня на стороне портала (docs/game-bridge-protocol.md). finished и abandoned рисует LevelRunner.
type LevelPhase = "loading" | "running" | "failed";

// Уровень iframe-игры (capability game-iframe-bridge): сборка в изолированном фрейме и обмен сообщениями по протоколу.
export function IframeLevel({ gameId, gameTitle, level, runtime, onFinish, onPracticeFinish, onExitWithoutResult, progress = null, onSaveProgress }: IframeLevelProps) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const levelRef = useRef<HTMLElement>(null);
	const [nativeFullscreen, setNativeFullscreen] = useState(false);
	const [expanded, setExpanded] = useState(() => typeof window !== "undefined"
		&& window.matchMedia?.("(pointer: coarse) and (max-width: 900px)").matches === true);
	const isFullscreen = nativeFullscreen || expanded;

	useEffect(() => {
		function syncFullscreen() {
			setNativeFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === levelRef.current));
		}
		document.addEventListener("fullscreenchange", syncFullscreen);
		return () => document.removeEventListener("fullscreenchange", syncFullscreen);
	}, []);

	useEffect(() => {
		if (!expanded) return;
		const overflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setExpanded(false);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.documentElement.style.overflow = overflow;
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [expanded]);

	async function toggleFullscreen() {
		if (expanded) {
			setExpanded(false);
		} else if (document.fullscreenElement === levelRef.current) {
			await document.exitFullscreen();
		} else {
			try {
				if (document.fullscreenEnabled && levelRef.current?.requestFullscreen && !matchMedia("(pointer: coarse)").matches) {
					await levelRef.current.requestFullscreen();
				} else {
					setExpanded(true);
				}
			} catch {
				setExpanded(true);
			}
		}
		frameRef.current?.focus();
	}
	const [phase, setPhase] = useState<LevelPhase>("loading");
	// Номер попытки: повтор после сбоя пересоздаёт фрейм через key.
	const [attempt, setAttempt] = useState({ number: 0, automatic: false });

	// Обработчик сообщений читает свежие значения через ref, чтобы не переподписываться на каждое изменение.
	const phaseRef = useRef<LevelPhase>("loading");
	const startedAtRef = useRef(0);
	const hasResultRef = useRef(false);
	const freeMode = Boolean(onPracticeFinish);
	const frameUrl = `${buildLevelUrl(runtime.entry, level.id)}${freeMode ? "&mode=free" : ""}${attempt.number ? `&retry=${attempt.number}` : ""}`;
	const callbacksRef = useRef({ onFinish, onPracticeFinish, onExitWithoutResult, onSaveProgress });
	useEffect(() => {
		callbacksRef.current = { onFinish, onPracticeFinish, onExitWithoutResult, onSaveProgress };
	}, [onFinish, onPracticeFinish, onExitWithoutResult, onSaveProgress]);

	function changePhase(nextPhase: LevelPhase) {
		phaseRef.current = nextPhase;
		setPhase(nextPhase);
	}

	// Подписка на сообщения фрейма текущей попытки.
	useEffect(() => {
		phaseRef.current = "loading";
		hasResultRef.current = false;

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
				frameWindow.postMessage(buildStartMessage(gameId, level.id, progress), "*");
				startedAtRef.current = Date.now();
				phaseRef.current = "running";
				setPhase("running");
				frameRef.current?.focus();
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
				callbacksRef.current.onExitWithoutResult();
				return;
			}
			if (message.type === "error" && currentPhase !== "failed" && !hasResultRef.current) {
				debugLog("bridge", "игра сообщила об ошибке", message.message);
				phaseRef.current = "failed";
				setPhase("failed");
				setExpanded(false);
				return;
			}
			debugLog("bridge", `сообщение ${message.type} не подходит этапу ${currentPhase}`);
		}

		window.addEventListener("message", handleMessage);
		// Быстрая сборка может отправить ready сразу после загрузки. Сначала подключаем обработчик.
		const frame = frameRef.current;
		if (frame && frame.getAttribute("src") !== frameUrl) frame.setAttribute("src", frameUrl);
		return () => window.removeEventListener("message", handleMessage);
	}, [gameId, level.id, frameUrl, freeMode, progress, onSaveProgress]);

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
			setExpanded(false);
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
		<section ref={levelRef} className={styles.level} data-expanded={expanded}>
			<div className={styles.header}>
				<div className={styles.titles}>
					<p className={styles.gameTitle}>{gameTitle}</p>
					<h1>{level.title}</h1>
				</div>
				<div className={styles.actions}>
					<button type="button" className={styles.fullscreenButton} onClick={toggleFullscreen}
						aria-label={isFullscreen ? commonTexts.fullscreenExit : commonTexts.fullscreenEnter}
						title={isFullscreen ? commonTexts.fullscreenExit : commonTexts.fullscreenEnter}>
						<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<path d={isFullscreen ? "M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5" : "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"} />
						</svg>
					</button>
					<Link href="/games" className={`button-secondary ${styles.fullscreenButton}`}
						aria-label={commonTexts.levelExit} title={commonTexts.levelExit}><span aria-hidden="true">×</span></Link>
				</div>
			</div>
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
		</section>
	);
}
