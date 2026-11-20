"use client";

import Link from "next/link";
import { useState } from "react";
import { gameRegistry } from "@/core/registry";
import { readPlayerName, recordLevelResult } from "@/core/progress";
import type { LevelResult } from "@/core/contract/types";
import { achievementDefinitions, type AwardedAchievement } from "@/core/achievements";
import { commonTexts } from "@/texts/common";
import { useProgressVersion } from "../_hooks/useProgressVersion";
import { NameForm } from "./NameForm";
import styles from "./LevelRunner.module.css";
import ui from "./ui.module.css";

interface LevelRunnerProps {
	gameId: string;
	levelId: string;
}

// Запускает уровень: сначала запрашивает имя, затем показывает компонент уровня и сохраняет результат.
export function LevelRunner({ gameId, levelId }: LevelRunnerProps) {
	// Перерисовка при сохранении имени или результатов.
	useProgressVersion();
	const [lastResult, setLastResult] = useState<LevelResult | null>(null);
	const [isSaveFailed, setIsSaveFailed] = useState(false);
	const [newlyAwarded, setNewlyAwarded] = useState<AwardedAchievement[]>([]);

	const game = gameRegistry.games.find((registered) => registered.manifest.gameId === gameId);
	const level = game?.manifest.levels.find((definition) => definition.id === levelId);

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

	if (readPlayerName() === "") {
		return <NameForm onSaved={() => undefined} />;
	}

	function handleFinish(result: LevelResult) {
		if (result.gameId !== gameId || result.levelId !== levelId) {
			return;
		}
		const outcome = recordLevelResult(result);
		setIsSaveFailed(!outcome.writeResult.ok);
		setNewlyAwarded(outcome.newlyAwarded);
		setLastResult(result);
	}

	if (lastResult) {
		return (
			<section className={`${ui.card} ${styles.result}`} data-completed={lastResult.completed ? "true" : "false"}>
				<span className={styles.badge} aria-hidden="true" />
				<h1>{lastResult.completed ? commonTexts.levelCompletedTitle : commonTexts.levelAbandonedTitle}</h1>
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
							setNewlyAwarded([]);
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

	const LevelComponent = game.module.levelComponents?.[level.id];
	if (!LevelComponent) {
		return (
			<p role="alert" className={styles.missing}>
				{commonTexts.levelMissingComponent}
			</p>
		);
	}

	return <LevelComponent level={level} onFinish={handleFinish} />;
}
