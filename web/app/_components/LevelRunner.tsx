"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { gameRegistry } from "@/core/registry";
import { recordLevelResult } from "@/core/progress";
import type { LevelResult } from "@/core/contract/types";
import { achievementDefinitions, type AwardedAchievement } from "@/core/achievements";
import { commonTexts } from "@/texts/common";
import type { PracticeResult } from "@/core/bridge/protocol";
import { uavTexts } from "@/games/uav-operator/texts";
import { IframeLevel } from "./IframeLevel";
import { LevelErrorBoundary } from "./LevelErrorBoundary";
import { ResultDiploma } from "./ResultDiploma";
import styles from "./LevelRunner.module.css";
import ui from "./ui.module.css";

interface LevelRunnerProps {
	gameId: string;
	levelId: string;
}

// Запускает игру и предлагает именной диплом после успешного прохождения.
export function LevelRunner({ gameId, levelId }: LevelRunnerProps) {
	const [lastResult, setLastResult] = useState<LevelResult | null>(null);
	const resultHeading = useRef<HTMLHeadingElement>(null);
	const [practice, setPractice] = useState<PracticeResult | null>(null);
	const [isSaveFailed, setIsSaveFailed] = useState(false);
	// Результат не прошёл проверку платформы и не засчитан.
	const [isResultRejected, setIsResultRejected] = useState(false);
	const [newlyAwarded, setNewlyAwarded] = useState<AwardedAchievement[]>([]);
	// Номер запуска уровня: повтор после сбоя меняет его, и уровень монтируется заново.
	const [launchNumber, setLaunchNumber] = useState(0);
	// iframe-игра сообщила о выходе без результата: экран незавершённого уровня без сохранения.
	const [hasExitedWithoutResult, setHasExitedWithoutResult] = useState(false);

	const game = gameRegistry.games.find((registered) => registered.manifest.gameId === gameId);
	const isFree = gameId === "uav-operator" && levelId === "free";
	const level = isFree ? { id: "easy" as const, title: uavTexts.free } : game?.manifest.levels.find((definition) => definition.id === levelId);

	useEffect(() => {
		if (lastResult) resultHeading.current?.focus();
	}, [lastResult]);

	if (!game || !level) {
		return (
			<section className={`${ui.card} ${styles.notFound}`}>
				<h1>{commonTexts.notFoundTitle}</h1>
				<p>{commonTexts.notFoundBody}</p>
				<Link href="/games" className="button-primary">
					{commonTexts.backToGames}
				</Link>
			</section>
		);
	}

	function handleFinish(result: LevelResult) {
		if (result.gameId !== gameId || result.levelId !== levelId) {
			return;
		}
		const outcome = recordLevelResult(result, undefined, undefined, false);
		setIsResultRejected(!outcome.accepted);
		setIsSaveFailed(!outcome.writeResult.ok);
		setNewlyAwarded(outcome.newlyAwarded);
		setLastResult(result);
	}

	function handlePractice(result: PracticeResult) {
		setPractice(result);
		setLastResult({ gameId, levelId: result.difficulty ?? "easy", score: result.score,
			maxScore: 100, completed: result.completed, durationSec: result.durationSec });
	}

	if (hasExitedWithoutResult) {
		return (
			<section className={`${ui.card} ${styles.result}`} data-completed="false">
				<span className={styles.badge} aria-hidden="true" />
				<h1>{commonTexts.levelAbandonedTitle}</h1>
				<p className={styles.message}>{commonTexts.levelExitedBody}</p>
				<div className={styles.actions}>
					<button
						type="button"
						onClick={() => {
							setHasExitedWithoutResult(false);
							setLaunchNumber((number) => number + 1);
						}}
					>
						{commonTexts.levelRetry}
					</button>{" "}
					<Link href="/games" className="button-primary">
						{commonTexts.backToGames}
					</Link>
				</div>
			</section>
		);
	}

	if (lastResult && isResultRejected) {
		return (
			<section className={`${ui.card} ${styles.result}`} data-completed="false">
				<span className={styles.badge} aria-hidden="true" />
				<h1>{commonTexts.levelRejectedTitle}</h1>
				<p role="alert" className={styles.error}>
					{commonTexts.levelRejectedBody}
				</p>
				<div className={styles.actions}>
					<button
						type="button"
						onClick={() => {
							setLastResult(null);
							setIsResultRejected(false);
						}}
					>
						{commonTexts.levelRetry}
					</button>{" "}
					<Link href="/games" className="button-primary">
						{commonTexts.backToGames}
					</Link>
				</div>
			</section>
		);
	}

	if (lastResult) {
		return (
			<section className={`${ui.card} ${styles.result}`} data-completed={lastResult.completed ? "true" : "false"}>
				<span className={styles.badge} aria-hidden="true" />
				<h1 ref={resultHeading} tabIndex={-1}>{lastResult.completed ? commonTexts.levelCompletedTitle : commonTexts.levelAbandonedTitle}</h1>
				<div className={styles.stats}>
					<p className={styles.stat}>
						<span className={styles.statLabel}>{commonTexts.levelScoreLabel}:</span>{" "}
						<span className={styles.statValue}>
							{lastResult.score} / {lastResult.maxScore}
						</span>
					</p>
					<p className={styles.stat}>
						<span className={styles.statLabel}>{commonTexts.levelDurationLabel}:</span>{" "}
						<span className={styles.statValue}>{lastResult.durationSec}</span>
					</p>
				</div>
				{lastResult.completed && practice?.activity !== "race" && practice?.activity !== "field" ? <ResultDiploma result={lastResult} gameTitle={game.manifest.title}
					levelTitle={practice ? uavTexts.practice[practice.activity] : level.title}
					difficulty={practice ? game.manifest.levels.find((definition) => definition.id === practice.difficulty)?.title ?? uavTexts.freeDifficulty : level.title} /> : null}
				{isSaveFailed ? (
					<p role="alert" className={styles.error}>
						{commonTexts.levelSaveError}
					</p>
				) : null}
				{newlyAwarded.length > 0 ? (
					<section role="status" aria-label={commonTexts.achievementNoticeTitle} className={styles.achievementNotice}>
						<h2>{commonTexts.achievementNoticeTitle}</h2>
						<ul>
							{newlyAwarded.map((awarded) => (
								<li key={awarded.id}>{achievementDefinitions.find((definition) => definition.id === awarded.id)?.title ?? awarded.id}</li>
							))}
						</ul>
					</section>
				) : null}
				<div className={styles.actions}>
					<button
						type="button"
						onClick={() => {
							setLastResult(null);
							setPractice(null);
							setNewlyAwarded([]);
						}}
					>
						{isFree ? uavTexts.freeBack : commonTexts.levelRetry}
					</button>{" "}
					<Link href="/games" className="button-primary">
						{commonTexts.backToGames}
					</Link>
				</div>
			</section>
		);
	}

	// Игра из готовой веб-сборки: уровень во фрейме по протоколу моста.
	if (game.manifest.runtime) {
		return (
			<IframeLevel
				key={launchNumber}
				gameId={game.manifest.gameId}
				gameTitle={game.manifest.title}
				level={level}
				runtime={game.manifest.runtime}
				onFinish={handleFinish}
				onPracticeFinish={isFree ? handlePractice : undefined}
				onExitWithoutResult={() => setHasExitedWithoutResult(true)}
			/>
		);
	}

	// React-игра: компонент уровня из модуля игры.
	const LevelComponent = game.module.levelComponents?.[level.id];
	if (!LevelComponent) {
		return (
			<p role="alert" className={styles.missing}>
				{commonTexts.levelMissingComponent}
			</p>
		);
	}

	return (
		<LevelErrorBoundary key={launchNumber} onRetry={() => setLaunchNumber((number) => number + 1)}>
			<LevelComponent level={level} onFinish={handleFinish} />
		</LevelErrorBoundary>
	);
}
