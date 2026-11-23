"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { gamesTexts } from "@/texts/games";
import styles from "./GamePreview.module.css";

interface GamePreviewProps {
	// Кадры из манифеста игры. Пустой список рисует обложку-заглушку.
	frames: string[];
	animation?: string;
	poster?: string;
	onOpen?: () => void;
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

function watchMotionPreference(notify: () => void) {
	const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
	query?.addEventListener("change", notify);
	return () => query?.removeEventListener("change", notify);
}

// Превью игры. В режиме stage кадры сменяются с плавным приближением, а точки внизу переключают кадр вручную.
export function GamePreview({ frames, animation, poster, onOpen, title, variant, priority = false }: GamePreviewProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const [playbackChoice, setPlaybackChoice] = useState<boolean | null>(null);
	const reducedMotion = useSyncExternalStore(watchMotionPreference, prefersReducedMotion, () => true);
	const isSlideshow = !animation && frames.length > 1;
	const card = variant === "card";
	const playing = playbackChoice ?? (!card && !reducedMotion);

	useEffect(() => {
		if (!isSlideshow || !playing) {
			return;
		}
		const timerId = window.setInterval(() => setActiveIndex((index) => (index + 1) % frames.length), frameDurationMs);
		return () => window.clearInterval(timerId);
	}, [isSlideshow, playing, frames.length, activeIndex]);

	if (!onOpen && !poster && frames.length === 0 && !animation) {
		return <div className={`${styles.preview} ${styles[variant]} ${styles.fallback}`} role="img" aria-label={title} />;
	}

	const cover = playing ? frames[activeIndex] ?? poster : poster ?? frames[0];
	const visibleFrames = card || !frames.length ? [cover] : frames;
	const toggleMotion = () => {
		setPlaybackChoice(!playing);
		if (card) setActiveIndex(0);
	};

	return (
		<div className={`${styles.preview} ${styles[variant]} ${!cover ? styles.fallback : ""}`} data-animation={Boolean(animation)}>
			{visibleFrames.map((frame, index) => {
				const playingAnimation = index === 0 && Boolean(animation) && playing;
				const src = playingAnimation ? animation : frame;
				if (!src) return null;
				return (
				<picture key={index} className={styles.frame} data-active={card || index === activeIndex ? "true" : "false"}>
					<Image
						src={src}
						unoptimized={playingAnimation}
						alt={card && onOpen ? "" : `${gamesTexts.previewAlt}: ${title}`}
						fill
						sizes={variant === "card" ? "(max-width: 700px) 100vw, 420px" : "(max-width: 900px) 100vw, 880px"}
						loading={priority ? "eager" : "lazy"}
					/>
				</picture>
				);
			})}
			{onOpen ? <button type="button" className={styles.coverAction} aria-label={title} onClick={onOpen} /> : null}
			{isSlideshow && !card ? (
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
			{animation || (card && isSlideshow) ? <button type="button" className={styles.motionToggle}
				aria-label={playing ? gamesTexts.pausePreview : gamesTexts.playPreview}
				onClick={toggleMotion}>
				<span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
			</button> : null}
		</div>
	);
}
