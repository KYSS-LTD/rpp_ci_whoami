"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { readGameRatings, readLevelResults, saveGameRating } from "@/core/progress";
import { gameFormats, type GameFormat, type GameManifest, type LevelId } from "@/core/contract/types";
import { gamesTexts } from "@/texts/games";
import { useProgressVersion } from "../_hooks/useProgressVersion";
import { GamePreview } from "./GamePreview";
import { GameSheet } from "./GameSheet";
import styles from "./GamesList.module.css";
import ui from "./ui.module.css";

interface GamesListProps {
	games: GameManifest[];
}

// Значение фильтра: все игры или один формат.
type FormatFilter = "all" | GameFormat;

const covers: Record<string, string> = {
	"uav-operator": "/career/flight.webp",
	"accountant-1c": "/career/finance.webp",
	cooking: "/career/kitchen.webp",
};

// Библиотека игр: лента карточек с фильтром по формату. Кнопка "Играть" открывает карточку игры
// с превью, сводкой и выбором сложности.
export function GamesList({ games }: GamesListProps) {
	const progressVersion = useProgressVersion();
	const results = readLevelResults();
	const ratings = readGameRatings();
	const [formatFilter, setFormatFilter] = useState<FormatFilter>("all");
	const [openGameId, setOpenGameId] = useState<string | null>(null);
	const linkedGame = useSearchParams()?.get("game");
	const [ratingMessage, setRatingMessage] = useState("");

	// Стабильная ссылка на функцию закрытия: от неё зависит эффект внутри карточки игры.
	const closeSheet = useCallback(() => {
		setOpenGameId(null);
		setRatingMessage("");
		const url = new URL(window.location.href);
		if (url.searchParams.has("game")) {
			url.searchParams.delete("game");
			window.history.replaceState(null, "", url);
		}
	}, []);

	const completedLevelIds = (gameId: string): LevelId[] =>
		results.filter((result) => result.gameId === gameId && result.completed).map((result) => result.levelId);

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

	// Фильтр показывается, только если в библиотеке есть игры разных форматов. Порядок форматов как в контракте.
	const presentFormats = gameFormats.filter((format) => games.some((game) => game.format === format));
	const visibleGames = formatFilter === "all" ? games : games.filter((game) => game.format === formatFilter);
	const openGame = games.find((game) => game.gameId === (openGameId ?? linkedGame));

	return (
		<section data-progress-version={progressVersion} className={ui.page}>
			<div className={styles.header}>
				<div className={ui.pageHeader}>
					<h1>{gamesTexts.title}</h1>
					<p className={ui.lead}>{gamesTexts.intro}</p>
				</div>
				{presentFormats.length > 1 ? (
					<div role="group" aria-label={gamesTexts.filterLabel} className={styles.filters}>
						{(["all", ...presentFormats] as FormatFilter[]).map((format) => (
							<button
								key={format}
								type="button"
								className={styles.filter}
								aria-pressed={formatFilter === format}
								onClick={() => setFormatFilter(format)}
							>
								{format === "all" ? gamesTexts.filterAll : gamesTexts.formats[format]}
							</button>
						))}
					</div>
				) : null}
			</div>

			{visibleGames.length === 0 ? <p className={ui.empty}>{gamesTexts.filterEmpty}</p> : null}

			<ul className={styles.feed}>
				{visibleGames.map((game, gameIndex) => {
					const completedCount = new Set(completedLevelIds(game.gameId)).size;
					return (
						<li key={game.gameId}>
							<article className={styles.card} data-in-development={game.inDevelopment ? "true" : "false"}>
								<div className={styles.cover}>
									<GamePreview frames={game.preview?.frames ?? []} animation={game.preview?.animation}
										poster={covers[game.gameId]} title={game.title} variant="card" priority={gameIndex < 3}
										onOpen={() => setOpenGameId(game.gameId)} />
								</div>
								<div className={styles.info}>
									<div className={styles.badges}>
										{game.format ? <span className={styles.badge}>{gamesTexts.formats[game.format]}</span> : null}
										{game.estimatedMinutes ? <span className={styles.duration}>{game.estimatedMinutes} {gamesTexts.minutesSuffix}</span> : null}
										{game.inDevelopment ? (
											<span className={`${styles.badge} ${styles.badgeWarning}`}>{gamesTexts.inDevelopment}</span>
										) : null}
									</div>
									<h2>{game.title}</h2>
									<p className={styles.description}>{game.description}</p>
									<div className={styles.footer}>
										<p className={styles.progress}>
											<span>
												{gamesTexts.progressLabel}: {completedCount} / {game.levels.length}
											</span>
											<span className={styles.progressDots} aria-hidden="true">
												{game.levels.map((level, levelIndex) => (
													<span key={level.id} data-done={levelIndex < completedCount ? "true" : "false"} />
												))}
											</span>
										</p>
										<button type="button" className={`button-primary ${styles.play}`} onClick={() => setOpenGameId(game.gameId)}>
											{gamesTexts.playLevel}
										</button>
									</div>
								</div>
							</article>
						</li>
					);
				})}
			</ul>

			{openGame ? (
				<GameSheet
					key={openGame.gameId}
					game={openGame}
					completedLevelIds={completedLevelIds(openGame.gameId)}
					rating={ratings[openGame.gameId]}
					ratingMessage={ratingMessage}
					onRate={(value) => {
						const saveResult = saveGameRating(openGame.gameId, value);
						setRatingMessage(saveResult.ok ? gamesTexts.ratingSaved : gamesTexts.ratingUnavailable);
					}}
					onClose={closeSheet}
				/>
			) : null}
		</section>
	);
}
