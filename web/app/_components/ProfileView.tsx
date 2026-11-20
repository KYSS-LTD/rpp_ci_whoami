"use client";

import { achievementDefinitions } from "@/core/achievements";
import { gameRegistry } from "@/core/registry";
import { readAwardedAchievements, readGameRatings, readLevelResults, readPlayerName } from "@/core/progress";
import { bestCompletedAttempts, computeProfessionScores } from "@/core/analysis";
import { commonTexts } from "@/texts/common";
import { profileTexts } from "@/texts/profile";
import { professionNames } from "@/texts/professions";
import { useProgressVersion } from "../_hooks/useProgressVersion";
import styles from "./ProfileView.module.css";
import ui from "./ui.module.css";

// Личная страница: имя, пройденные уровни, ачивки и ранжированный список профессий.
// Все данные берутся из LocalStorage, сетевых запросов нет.
export function ProfileView() {
	useProgressVersion();
	const playerName = readPlayerName();
	const results = readLevelResults();
	const completedAttempts = bestCompletedAttempts(results);
	const awarded = readAwardedAchievements();
	const games = gameRegistry.games.map((registered) => registered.manifest);
	const scores = computeProfessionScores(games, results, readGameRatings());

	const gameTitle = (gameId: string) => games.find((game) => game.gameId === gameId)?.title ?? gameId;

	return (
		<section className={ui.page}>
			<div className={ui.pageHeader}>
				<h1>{profileTexts.title}</h1>
				<p className={styles.player}>
					{profileTexts.nameLabel}: {playerName || profileTexts.nameMissing}
				</p>
			</div>
			<p role="note" className={ui.note}>
				{profileTexts.localAnalysisNotice}
			</p>

			<div className={`${ui.card} ${styles.analysis}`}>
				<h2>{profileTexts.analysisTitle}</h2>
				{scores === null ? (
					<p className={styles.muted}>{profileTexts.noCompletedLevels}</p>
				) : (
					<ol className={styles.professions}>
						{scores.map((item, index) => {
							const percent = Math.round(item.score * 100);
							return (
								<li key={item.professionId} className={styles.profession} data-top={index === 0 ? "true" : "false"}>
									{/* Двоеточие и скобки скрыты визуально, но остаются в тексте для экранных дикторов.
									    Процент в разметке идёт сразу за названием, а вправо его переносит CSS (order). */}
									<div className={styles.professionHead}>
										<span className={styles.professionName}>{professionNames[item.professionId] ?? item.professionId}</span>
										<span className="visually-hidden">: </span>
										<span className={styles.professionScore}>
											{percent}
											{profileTexts.percentSuffix}
										</span>
										{index === 0 ? (
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
								</li>
							);
						})}
					</ol>
				)}
			</div>

			<div className={styles.columns}>
				<div className={ui.card}>
					<h2>{profileTexts.gamesTitle}</h2>
					{completedAttempts.length === 0 ? (
						<p className={styles.muted}>{profileTexts.noGames}</p>
					) : (
						<ul className={styles.doneList}>
							{completedAttempts.map((attempt) => (
								<li key={`${attempt.gameId}:${attempt.levelId}`}>
									{gameTitle(attempt.gameId)}: {attempt.levelId}
								</li>
							))}
						</ul>
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
			<p className={styles.muted}>{commonTexts.localDataNotice}</p>
		</section>
	);
}
