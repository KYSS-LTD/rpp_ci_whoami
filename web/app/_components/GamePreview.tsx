"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { gamesTexts } from "@/texts/games";
import styles from "./GamePreview.module.css";

interface GamePreviewProps {
	// Кадры из манифеста игры. Пустой список рисует обложку-заглушку.
	frames: string[];
	animation?: string;
	// Подпись для экранных дикторов, обычно название игры.
	title: string;
	// card - обложка в ленте (первый кадр), stage - большое превью в карточке игры (кадры листаются).
	variant: "card" | "stage";
	// Отложенная загрузка: первые карточки ленты грузятся сразу, остальные по мере прокрутки.
	priority?: boolean;
}

// Сколько показывается один кадр в большом превью, мс.
const frameDurationMs = 4500;

// Пользователь просит меньше движения: тогда кадры не листаются сами.
function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

// Превью игры. В режиме stage кадры сменяются с плавным приближением, а точки внизу переключают кадр вручную.
export function GamePreview({ frames, animation, title, variant, priority = false }: GamePreviewProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const [motionStopped, setMotionStopped] = useState(false);
	const isSlideshow = !animation && variant === "stage" && frames.length > 1;

	useEffect(() => {
		if (!isSlideshow || prefersReducedMotion()) {
			return;
		}
		const timerId = window.setInterval(() => setActiveIndex((index) => (index + 1) % frames.length), frameDurationMs);
		return () => window.clearInterval(timerId);
	}, [isSlideshow, frames.length, activeIndex]);

	if (frames.length === 0) {
		return <div className={`${styles.preview} ${styles[variant]} ${styles.fallback}`} role="img" aria-label={title} />;
	}

	const visibleFrames = variant === "card" ? frames.slice(0, 1) : frames;

	return (
		<div className={`${styles.preview} ${styles[variant]}`} data-animation={Boolean(animation)}>
			{visibleFrames.map((frame, index) => (
				<picture key={frame} className={styles.frame} data-active={index === activeIndex ? "true" : "false"}>
					{index === 0 && animation && !motionStopped ? (
						<source media="(prefers-reduced-motion: no-preference)" srcSet={animation} />
					) : null}
					<Image
						src={frame}
						alt={`${gamesTexts.previewAlt}: ${title}`}
						fill
						sizes={variant === "card" ? "(max-width: 700px) 100vw, 420px" : "(max-width: 900px) 100vw, 880px"}
						loading={priority ? "eager" : "lazy"}
					/>
				</picture>
			))}
			{isSlideshow ? (
				<div className={styles.dots}>
					{frames.map((frame, index) => (
						<button
							key={frame}
							type="button"
							className={styles.dot}
							aria-label={`${gamesTexts.previewFrameLabel} ${index + 1}`}
							aria-pressed={index === activeIndex}
							onClick={() => setActiveIndex(index)}
						/>
					))}
				</div>
			) : null}
			{animation ? <button type="button" className={styles.motionToggle}
				aria-label={motionStopped ? gamesTexts.playPreview : gamesTexts.pausePreview}
				onClick={(event) => { event.stopPropagation(); setMotionStopped((stopped) => !stopped); }}>
				<span aria-hidden="true">{motionStopped ? "▶" : "Ⅱ"}</span>
			</button> : null}
		</div>
	);
}
