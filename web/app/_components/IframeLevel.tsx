"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildLevelUrl, buildStartMessage, parseGameMessage } from "@/core/bridge";
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
	// Игра сообщила о выходе без результата: показать экран незавершённого уровня, ничего не сохранять.
	onExitWithoutResult: () => void;
}

// Этапы уровня на стороне портала (docs/game-bridge-protocol.md). finished и abandoned рисует LevelRunner.
type LevelPhase = "loading" | "running" | "failed";

// Уровень iframe-игры (capability game-iframe-bridge): сборка в изолированном фрейме и обмен сообщениями по протоколу.
export function IframeLevel({ gameId, gameTitle, level, runtime, onFinish, onExitWithoutResult }: IframeLevelProps) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [phase, setPhase] = useState<LevelPhase>("loading");
	// Номер попытки: повтор после сбоя пересоздаёт фрейм через key.
	const [attempt, setAttempt] = useState(0);

	// Обработчик сообщений читает свежие значения через ref, чтобы не переподписываться на каждое изменение.
	const phaseRef = useRef<LevelPhase>("loading");
	const startedAtRef = useRef(0);
	const hasResultRef = useRef(false);
	const callbacksRef = useRef({ onFinish, onExitWithoutResult });
	useEffect(() => {
		callbacksRef.current = { onFinish, onExitWithoutResult };
	}, [onFinish, onExitWithoutResult]);

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
				frameWindow.postMessage(buildStartMessage(gameId, level.id), "*");
				startedAtRef.current = Date.now();
				phaseRef.current = "running";
				setPhase("running");
				frameRef.current?.focus();
				return;
			}
			if (message.type === "level-result" && currentPhase === "running" && !hasResultRef.current) {
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
				return;
			}
			debugLog("bridge", `сообщение ${message.type} не подходит этапу ${currentPhase}`);
		}

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [gameId, level.id, attempt]);

	// Таймаут загрузки: если игра не прислала ready вовремя, показывается запасной экран.
	useEffect(() => {
		if (phase !== "loading") {
			return;
		}
		const timeoutMs = (runtime.readyTimeoutSec ?? defaultReadyTimeoutSec) * 1000;
		const timerId = window.setTimeout(() => {
			debugLog("bridge", `игра не прислала ready за ${timeoutMs} мс`);
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
					setAttempt((number) => number + 1);
				}}
			/>
		);
	}

	return (
		<section className={styles.level}>
			<div className={styles.header}>
				<div className={styles.titles}>
					<p className={styles.gameTitle}>{gameTitle}</p>
					<h1>{level.title}</h1>
				</div>
				{/* Выход портала работает, даже если игра зависла, и ничего не сохраняет */}
				<Link href="/games" className="button-secondary">
					{commonTexts.levelExit}
				</Link>
			</div>
			<div className={styles.stage} data-phase={phase}>
				<iframe
					key={attempt}
					ref={frameRef}
					className={styles.frame}
					src={buildLevelUrl(runtime.entry, level.id)}
					title={gameTitle}
					sandbox="allow-scripts"
					allow="autoplay; gamepad"
				/>
				{phase === "loading" ? (
					<div className={styles.loading} role="status">
						<span className={styles.spinner} aria-hidden="true" />
						{commonTexts.levelLoading}
					</div>
				) : null}
			</div>
		</section>
	);
}
