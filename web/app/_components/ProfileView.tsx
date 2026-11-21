"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { achievementDefinitions } from "@/core/achievements";
import { gameRegistry } from "@/core/registry";
import { readAwardedAchievements, readGameRatings, readLevelResults, readPlayerName, readPracticeResults, saveGameRating } from "@/core/progress";
import { bestCompletedAttempts, bestPracticeAttempts, computeProfessionScores, isValidRating } from "@/core/analysis";
import { uavTexts } from "@/games/uav-operator/texts";
import { profileTexts } from "@/texts/profile";
import { professionNames } from "@/texts/professions";
import { useProgressVersion } from "../_hooks/useProgressVersion";
import { NameForm } from "./NameForm";
import styles from "./ProfileView.module.css";
import ui from "./ui.module.css";

// Личная страница: имя, пройденные уровни, ачивки и ранжированный список профессий.
// Все данные берутся из LocalStorage, сетевых запросов нет.
export function ProfileView() {
	useProgressVersion();
	const [ratingError, setRatingError] = useState<string | null>(null);
	const [editingName, setEditingName] = useState(false);
	const [nameSaved, setNameSaved] = useState(false);
	const editNameButton = useRef<HTMLButtonElement>(null);
	const playerName = readPlayerName();
	const results = readLevelResults();
	const practice = readPracticeResults();
	const completedAttempts = bestCompletedAttempts(results);
	const completedPractice = bestPracticeAttempts(practice);
	const awarded = readAwardedAchievements();
	const ratings = readGameRatings();
	const games = gameRegistry.games.map((registered) => registered.manifest);
	const scores = computeProfessionScores(games, completedAttempts, ratings, completedPractice);
	const playedGames = games.map((game) => ({
		...game,
		attempts: completedAttempts.filter((attempt) => attempt.gameId === game.gameId),
		practice: completedPractice.filter((attempt) => attempt.gameId === game.gameId),
	})).filter((game) => game.attempts.length || game.practice.length);

	return (
		<section className={ui.page}>
			<div className={ui.pageHeader}>
				<h1>{profileTexts.title}</h1>
				<div className={styles.identity}>
					<p className={styles.player}>{playerName || profileTexts.nameMissing}</p>
					<button ref={editNameButton} type="button" className="button-secondary" aria-expanded={editingName} onClick={() => {
						setNameSaved(false);
						setEditingName(!editingName);
					}}>
						{editingName ? profileTexts.cancelNameEdit : playerName ? profileTexts.editName : profileTexts.addName}
					</button>
					<p className="visually-hidden" role="status">{nameSaved ? profileTexts.nameSaved : ""}</p>
				</div>
				{editingName ? <NameForm initialName={playerName} onSaved={() => {
					setEditingName(false);
					setNameSaved(true);
					editNameButton.current?.focus();
				}} /> : null}
			</div>
			<p role="note" className={ui.note}>
				{profileTexts.localAnalysisNotice}
			</p>

			<div className={`${ui.card} ${styles.analysis}`}>
				<h2>{profileTexts.analysisTitle}</h2>
				{scores === null ? (
					<div className={styles.empty}>
						<p className={styles.muted}>{profileTexts.noCompletedLevels}</p>
						<Link href="/games" className="button-primary">{profileTexts.play}</Link>
					</div>
				) : (
					<ol className={styles.professions}>
						{scores.map((item) => {
							const percent = Math.round(item.score * 100);
							const isTop = percent > 0 && Math.abs(item.score - scores[0].score) < 1e-10;
							const sources = playedGames.filter((game) => game.professionTags.some((tag) =>
								tag.professionId === item.professionId && tag.weight > 0));
							return (
								<li key={item.professionId} className={styles.profession} data-top={isTop}>
									{/* Двоеточие и скобки скрыты визуально, но остаются в тексте для экранных дикторов.
									    Процент в разметке идёт сразу за названием, а вправо его переносит CSS (order). */}
									<div className={styles.professionHead}>
										<span className={styles.professionName}>{professionNames[item.professionId] ?? item.professionId}</span>
										<span className="visually-hidden">: </span>
										<span className={styles.professionScore}>
											{percent}
											{profileTexts.percentSuffix}
										</span>
										{isTop ? (
											<>
												<span className="visually-hidden"> (</span>
												<span className={styles.best}>{profileTexts.bestMatch}</span>
												<span className="visually-hidden">)</span>
											</>
										) : null}
									</div>
									<div className={styles.bar} aria-hidden="true">
										<div className={styles.barFill} style={{ width: `${percent}%` }} />
									</div>
									<p className={styles.sources}>{profileTexts.sourcesLabel} · {sources.map((game) => game.title).join(", ")}</p>
								</li>
							);
						})}
					</ol>
				)}
				{scores ? (
					<details className={styles.method}>
						<summary>{profileTexts.howTitle}</summary>
						<p>{profileTexts.howBody}</p>
						<p>{profileTexts.ratingHelp}</p>
					</details>
				) : null}
			</div>

			<div className={styles.columns}>
				<div className={ui.card}>
					<h2>{profileTexts.gamesTitle}</h2>
					{playedGames.length === 0 ? (
						<p className={styles.muted}>{profileTexts.noGames}</p>
					) : (
						<div className={styles.playedGames}>
							{playedGames.map((game) => {
								const rating = ratings[game.gameId];
								const gameHeadingId = `analysis-game-${game.gameId}`;
								const ratingLabelId = `analysis-rating-${game.gameId}`;
								return (
									<section key={game.gameId} className={styles.playedGame}>
										<h3 id={gameHeadingId}>{game.title}</h3>
										<ul className={styles.doneList}>
											{game.attempts.map((attempt) => (
												<li key={attempt.levelId}>
													<span>{game.levels.find((level) => level.id === attempt.levelId)?.title ?? attempt.levelId}</span>
													<strong>{attempt.score} / {attempt.maxScore}</strong>
												</li>
											))}
											{game.practice.map((attempt) => (
												<li key={`${attempt.activity}:${attempt.difficulty ?? ""}`}>
													<span>{uavTexts.practice[attempt.activity]}{attempt.difficulty ? ` · ${uavTexts[attempt.difficulty]}` : ""}</span>
													<strong>{attempt.score} / 100</strong>
												</li>
											))}
										</ul>
										<label className={styles.rating}>
											<span id={ratingLabelId}>{profileTexts.ratingLabel}</span>
											<select aria-labelledby={`${ratingLabelId} ${gameHeadingId}`} value={isValidRating(rating) ? rating : ""} onChange={(event) => {
												const result = saveGameRating(game.gameId, Number(event.target.value));
												setRatingError(result.ok ? null : game.gameId);
											}}>
												<option value="" disabled>{profileTexts.ratingMissing}</option>
												{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
											</select>
										</label>
										{ratingError === game.gameId ? <p role="alert">{profileTexts.ratingError}</p> : null}
									</section>
								);
							})}
						</div>
					)}
				</div>

				<div className={ui.card}>
					<h2>{profileTexts.achievementsTitle}</h2>
					{awarded.length === 0 ? (
						<p className={styles.muted}>{profileTexts.noAchievements}</p>
					) : (
						<ul className={styles.achievementList}>
							{awarded.map((item) => (
								<li key={item.id}>{achievementDefinitions.find((definition) => definition.id === item.id)?.title ?? item.id}</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</section>
	);
}
