"use client";

import Link from "next/link";
import { readGameRatings, readLevelResults, saveGameRating } from "@/core/progress";
import { useState } from "react";
import type { GameManifest } from "@/core/contract/types";
import { gamesTexts } from "@/texts/games";
import { useProgressVersion } from "../_hooks/useProgressVersion";
import styles from "./GamesList.module.css";
import ui from "./ui.module.css";

interface GamesListProps {
	games: GameManifest[];
}

// Список всех зарегистрированных игр с тремя уровнями и отметкой о прохождении.
export function GamesList({ games }: GamesListProps) {
	const progressVersion = useProgressVersion();
	const results = readLevelResults();
	const ratings = readGameRatings();
	const [ratingMessage, setRatingMessage] = useState("");
	const isLevelCompleted = (gameId: string, levelId: string) =>
		results.some((result) => result.gameId === gameId && result.levelId === levelId && result.completed);

	if (games.length === 0) {
		return (
			<section className={ui.page}>
				<h1>{gamesTexts.title}</h1>
				<div className={ui.empty}>
					<h2>{gamesTexts.emptyTitle}</h2>
					<p>{gamesTexts.emptyBody}</p>
				</div>
			</section>
		);
	}

	return (
		<section data-progress-version={progressVersion} className={ui.page}>
			<div className={ui.pageHeader}>
				<h1>{gamesTexts.title}</h1>
				<p className={ui.lead}>{gamesTexts.intro}</p>
			</div>
			{games.map((game) => (
				<article key={game.gameId} className={styles.gameCard}>
					<div className={styles.gameHead}>
						<h2>{game.title}</h2>
						<p>{game.description}</p>
					</div>
					<ul className={styles.levels}>
						{game.levels.map((level, levelIndex) => {
							const completed = isLevelCompleted(game.gameId, level.id);
							return (
								<li key={level.id} className={styles.level} data-completed={completed ? "true" : "false"}>
									<span className={styles.levelTitle}>{level.title}</span>{" "}
									{/* Полоски сложности по порядку уровня, только для вида */}
									<span className={styles.bars} data-difficulty={levelIndex + 1} aria-hidden="true">
										<span />
										<span />
										<span />
									</span>
									<span className={styles.status}>{completed ? gamesTexts.levelDone : gamesTexts.levelOpen}</span>{" "}
									<Link href={`/games/${game.gameId}/${level.id}`} className={`button-primary ${styles.play}`}>
										{gamesTexts.playLevel}
									</Link>
								</li>
							);
						})}
					</ul>
					<fieldset className={styles.rating}>
						<legend>{gamesTexts.ratingTitle}</legend>
						<div className={styles.ratingButtons}>
							{[1, 2, 3, 4, 5].map((value) => (
								<button
									key={value}
									type="button"
									aria-pressed={ratings[game.gameId] === value}
									onClick={() => {
										const saveResult = saveGameRating(game.gameId, value);
										setRatingMessage(saveResult.ok ? gamesTexts.ratingSaved : gamesTexts.ratingUnavailable);
									}}
								>
									{value}
								</button>
							))}
						</div>
					</fieldset>
				</article>
			))}
			{ratingMessage ? (
				<p role="status" className={styles.ratingMessage}>
					{ratingMessage}
				</p>
			) : null}
		</section>
	);
}
