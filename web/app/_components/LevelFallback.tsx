"use client";

import Link from "next/link";
import { commonTexts } from "@/texts/common";
import styles from "./LevelFallback.module.css";
import ui from "./ui.module.css";

interface LevelFallbackProps {
	// Запускает уровень заново с начала.
	onRetry: () => void;
}

// Запасной экран уровня (core-platform, "Level failure fallback"): игра упала, сообщила об ошибке или не загрузилась.
// Шапка и навигация сайта при этом продолжают работать, потому что экран рисуется вместо уровня, а не вместо страницы.
export function LevelFallback({ onRetry }: LevelFallbackProps) {
	return (
		<section className={`${ui.card} ${styles.fallback}`} role="alert" aria-labelledby="level-fallback-title">
			<span className={styles.icon} aria-hidden="true" />
			<h1 id="level-fallback-title">{commonTexts.levelFailedTitle}</h1>
			<p>{commonTexts.levelFailedBody}</p>
			<div className={styles.actions}>
				<button type="button" className="button-primary" onClick={onRetry}>
					{commonTexts.levelFailedRetry}
				</button>
				<Link href="/games" className="button-secondary">
					{commonTexts.backToGames}
				</Link>
			</div>
		</section>
	);
}
