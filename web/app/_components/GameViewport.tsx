"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { debugLog } from "@/core/debug";
import { commonTexts } from "@/texts/common";
import styles from "./GameViewport.module.css";

interface GameViewportProps {
	title: string;
	heading?: string;
	actions?: ReactNode;
	children: ReactNode;
	afterToggle?: () => void;
	alwaysExpanded?: boolean;
	className?: string;
}

const mobileStageQuery = "(pointer: coarse) and (max-width: 900px), (pointer: coarse) and (max-height: 600px)";

function subscribeToMobileStage(onChange: () => void) {
	const query = window.matchMedia?.(mobileStageQuery);
	query?.addEventListener("change", onChange);
	return () => query?.removeEventListener("change", onChange);
}

function showHomeScreenInstructions() {
	const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
		|| window.matchMedia?.("(display-mode: standalone)").matches;
	return /iPhone|iPod/.test(navigator.userAgent) && !isStandalone;
}

export function GameViewport({ title, heading, actions, children, afterToggle, alwaysExpanded = false, className }: GameViewportProps) {
	const levelRef = useRef<HTMLElement>(null);
	const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
	const [nativeFullscreen, setNativeFullscreen] = useState(false);
	const autoExpanded = useSyncExternalStore(subscribeToMobileStage, () => window.matchMedia?.(mobileStageQuery).matches === true, () => false);
	const [expandedOverride, setExpanded] = useState<boolean | null>(null);
	const expanded = alwaysExpanded || (expandedOverride ?? autoExpanded);
	const isFullscreen = nativeFullscreen || (!alwaysExpanded && expandedOverride === true);
	const [fullscreenHint, setFullscreenHint] = useState<string | null>(null);

	useEffect(() => {
		function syncFullscreen() {
			setNativeFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === levelRef.current));
		}
		document.addEventListener("fullscreenchange", syncFullscreen);
		return () => document.removeEventListener("fullscreenchange", syncFullscreen);
	}, []);

	useEffect(() => {
		if (!expanded) return;
		const overflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape" && !document.fullscreenElement) {
				setExpanded(false);
				setFullscreenHint(null);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.documentElement.style.overflow = overflow;
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [expanded]);

	async function toggleFullscreen() {
		const stage = levelRef.current;
		if (!stage) return;

		if (document.fullscreenElement === stage) {
			try {
				await document.exitFullscreen();
			} catch (error) {
				debugLog("portal", "браузер не вышел из полноэкранного режима", error);
			}
		} else if (!alwaysExpanded && expandedOverride === true) {
			setExpanded(false);
			setFullscreenHint(null);
		} else {
			try {
				if (document.fullscreenEnabled && stage.requestFullscreen) {
					await stage.requestFullscreen({ navigationUI: "hide" });
					setFullscreenHint(null);
					afterToggle?.();
					return;
				}
			} catch (error) {
				debugLog("portal", "браузер отклонил полноэкранный режим", error);
			}
			if (levelRef.current !== stage) return;
			if (!alwaysExpanded) setExpanded(true);
			if (showHomeScreenInstructions()) {
				setFullscreenHint(commonTexts.fullscreenHomeScreen);
				return;
			}
			if (alwaysExpanded) setFullscreenHint(commonTexts.fullscreenUnavailable);
		}
		afterToggle?.();
	}
	return (
		<section ref={levelRef} className={className ? `${styles.level} ${className}` : styles.level} data-expanded={expanded} aria-label={title}>
			<div className={styles.header}>
				{heading ? (
					<div className={styles.titles}>
						<p className={styles.gameTitle}>{title}</p>
						<h1>{heading}</h1>
					</div>
				) : null}
				<div className={styles.actions}>
					<button type="button" className={styles.fullscreenButton} ref={fullscreenButtonRef} onClick={toggleFullscreen}
						aria-label={isFullscreen ? commonTexts.fullscreenExit : commonTexts.fullscreenEnter}
						title={isFullscreen ? commonTexts.fullscreenExit : commonTexts.fullscreenEnter}>
						<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
							<path d={isFullscreen ? "M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5" : "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"} />
						</svg>
					</button>
					{actions}
				</div>
			</div>
			{fullscreenHint ? (
				<div className={styles.fullscreenHint}>
					<p role="status">{fullscreenHint}</p>
					<button type="button" className={styles.fullscreenButton} aria-label={commonTexts.fullscreenHintDismiss} onClick={() => {
						setFullscreenHint(null);
						fullscreenButtonRef.current?.focus();
						afterToggle?.();
					}}><span aria-hidden="true">×</span></button>
				</div>
			) : null}
			{children}
		</section>
	);
}
