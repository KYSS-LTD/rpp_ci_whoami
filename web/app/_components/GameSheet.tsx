"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { GameManifest, LevelId } from "@/core/contract/types";
import { gamesTexts } from "@/texts/games";
import { professionNames } from "@/texts/professions";
import { GamePreview } from "./GamePreview";
import styles from "./GameSheet.module.css";

interface GameSheetProps {
	game: GameManifest;
	completedLevelIds: LevelId[];
	rating: number | undefined;
	ratingMessage: string;
	onRate: (value: number) => void;
	onClose: () => void;
}

// Карточка игры поверх ленты: превью из игры, краткая сводка и выбор сложности.
// На телефоне выезжает снизу, на компьютере открывается по центру. Закрывается кнопкой, клавишей Escape и кликом по фону.
export function GameSheet({ game, completedLevelIds, rating, ratingMessage, onRate, onClose }: GameSheetProps) {
	const dialogRef = useRef<HTMLDivElement>(null);
	// По умолчанию выбран первый непройденный уровень: так игрок продолжает с того места, где остановился.
	const [selectedLevelId, setSelectedLevelId] = useState<LevelId>(
		() => game.levels.find((level) => !completedLevelIds.includes(level.id))?.id ?? game.levels[0].id,
	);

	// Фокус переходит в окно, страница под окном не прокручивается, Escape закрывает окно.
	useEffect(() => {
		const previousFocus = document.activeElement as HTMLElement | null;
		const previousOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
		dialogRef.current?.focus({ preventScroll: true });

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onClose();
			}
		}
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.documentElement.style.overflow = previousOverflow;
			previousFocus?.focus?.();
		};
	}, [onClose]);

	const titleId = `game-sheet-title-${game.gameId}`;

	return (
		<div className={styles.backdrop} onClick={onClose}>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className={styles.sheet}
				onClick={(event) => event.stopPropagation()}
			>
				<button type="button" className={styles.close} aria-label={gamesTexts.sheetClose} onClick={onClose} />
				{/* Слева превью и сводка, справа выбор сложности. На телефоне всё в одну колонку. */}
				<div className={styles.media}>
					<GamePreview frames={game.preview?.frames ?? []} title={game.title} variant="stage" priority />
				</div>

				<div className={styles.about}>
					<div className={styles.badges}>
						{game.format ? <span className={styles.badge}>{gamesTexts.formats[game.format]}</span> : null}
						{game.inDevelopment ? <span className={`${styles.badge} ${styles.badgeWarning}`}>{gamesTexts.inDevelopment}</span> : null}
					</div>
					<h2 id={titleId} className={styles.title}>
						{game.title}
					</h2>
					<p className={styles.summary}>{game.summary ?? game.description}</p>

					<ul className={styles.meta}>
						{game.estimatedMinutes ? (
							<li>
								{gamesTexts.minutesPrefix} {game.estimatedMinutes} {gamesTexts.minutesSuffix}
							</li>
						) : null}
						<li>{gamesTexts.levelsCount}</li>
					</ul>

					{game.professionTags.length > 0 ? (
						<div className={styles.professions}>
							<h3>{gamesTexts.professionsTitle}</h3>
							<ul>
								{game.professionTags.map((tag) => (
									<li key={tag.professionId}>{professionNames[tag.professionId] ?? tag.professionId}</li>
								))}
							</ul>
						</div>
					) : null}
				</div>

				<div className={styles.play}>
					<fieldset className={styles.difficulty}>
						<legend>{gamesTexts.difficultyTitle}</legend>
						<div className={styles.levels}>
							{game.levels.map((level, levelIndex) => {
								const completed = completedLevelIds.includes(level.id);
								return (
									<label key={level.id} className={styles.level} data-completed={completed ? "true" : "false"}>
										<input
											type="radio"
											name={`difficulty-${game.gameId}`}
											value={level.id}
											checked={selectedLevelId === level.id}
											onChange={() => setSelectedLevelId(level.id)}
										/>
										<span className={styles.levelTitle}>{level.title}</span>
										{/* Полоски сложности по порядку уровня, только для вида */}
										<span className={styles.bars} data-difficulty={levelIndex + 1} aria-hidden="true">
											<span />
											<span />
											<span />
										</span>
										<span className={styles.status}>{completed ? gamesTexts.levelDone : gamesTexts.levelOpen}</span>
									</label>
								);
							})}
						</div>
					</fieldset>
				</div>

				<div className={styles.actions}>
					<Link href={`/games/${game.gameId}/${selectedLevelId}`} className={`button-primary ${styles.start}`}>
						{gamesTexts.startLevel}
					</Link>
				</div>

				<fieldset className={styles.rating}>
					<legend>{gamesTexts.ratingTitle}</legend>
					<div className={styles.ratingButtons}>
						{[1, 2, 3, 4, 5].map((value) => (
							<button key={value} type="button" aria-pressed={rating === value} onClick={() => onRate(value)}>
								{value}
							</button>
						))}
					</div>
					{ratingMessage ? (
						<p role="status" className={styles.ratingMessage}>
							{ratingMessage}
						</p>
					) : null}
				</fieldset>
			</div>
		</div>
	);
}
