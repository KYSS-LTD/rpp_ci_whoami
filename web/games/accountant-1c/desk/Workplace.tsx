"use client";

// Рабочее место бухгалтера (design.md, D11): своя раскладка.
// Сверху полоса дня (день, часы, фикус, очки, «Уйти домой пораньше»), под ней окошко в коридор с персонажем
// и монитор с программой, ниже во всю ширину стол с бумагами, калькулятором, справочником и замечаниями.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TutorialOverlay } from "../components/TutorialOverlay";
import type { TutorialController } from "../hooks/useTutorial";
import { tutorialTexts } from "../texts/tutorial";
import { fillTemplate } from "../logic/feedback";
import { getFicusState } from "../logic/mood";
import { accountantTexts } from "../texts";
import { Ficus } from "../ui/art";
import { AppWindow, type WindowSectionId } from "../ui/AppWindow";
import { fontVariables } from "../ui/fonts";
import { PixelCharacter, type CharacterId } from "../ui/pixel";
import { Calculator } from "./Calculator";
import { AmountTargetProvider, DeskLayoutProvider, useLevelChrome } from "./contexts";
import { Rulebook, type RulebookTabId } from "./Rulebook";
import styles from "./desk.module.css";

// ---------- Часы рабочего дня ----------

// Начало дня в минутах от полуночи и конец, на котором часы останавливаются.
const dayStartMinutes = 9 * 60;
const dayEndMinutes = 18 * 60;
// Сколько игровых минут проходит за секунду игры.
const gameMinutesPerSecond = 2;

// Время на часах по прошедшим секундам: 09:00 и дальше, но не позже 18:00.
export function formatWorkClock(elapsedSec: number): string {
	const minutes = Math.min(dayEndMinutes, dayStartMinutes + Math.floor(Math.max(0, elapsedSec) * gameMinutesPerSecond));
	const hours = Math.floor(minutes / 60);
	return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function WorkClock({ startedAtMs }: { startedAtMs: number }) {
	const [nowMs, setNowMs] = useState(startedAtMs);

	useEffect(() => {
		const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
		return () => window.clearInterval(timerId);
	}, []);

	const elapsedSec = startedAtMs > 0 ? (nowMs - startedAtMs) / 1000 : 0;
	return (
		<time className={styles.clock} aria-label={accountantTexts.workplace.clockLabel}>
			{formatWorkClock(elapsedSec)}
		</time>
	);
}

// ---------- Замечания главбуха ----------

function SlipStack() {
	const chrome = useLevelChrome();
	const texts = accountantTexts.slips;
	// Показываем последние три листка: старые уходят под низ стопки.
	const visibleSlips = chrome.slips.slice(-3);
	return (
		<aside className={styles.slips} aria-label={texts.regionLabel}>
			<ul>
				{visibleSlips.map((slip, index) => (
					<li key={slip.id} className={styles.slip} style={{ "--slip-index": visibleSlips.length - 1 - index } as React.CSSProperties}>
						<p className={styles.slipTitle}>{texts.title}</p>
						<p className={styles.slipFrom}>{texts.from}</p>
						<p className={styles.slipText}>
							<strong>{slip.correct}</strong> {slip.reason} <em>{slip.joke}</em>
						</p>
						<button type="button" className={styles.slipRemove} aria-label={texts.removeLabel} onClick={() => chrome.removeSlip(slip.id)}>
							{texts.remove}
						</button>
					</li>
				))}
			</ul>
		</aside>
	);
}

// ---------- Рабочее место ----------

export interface BoothScene {
	character: CharacterId;
	variant?: number;
	name: string;
	speech: string;
	// Что лежит на подоконнике окошка (например, бланк, который отдают посетителю).
	counter?: ReactNode;
}

interface WorkplaceProps {
	booth: BoothScene;
	monitorSection: WindowSectionId;
	monitorTitle: string | null;
	monitor: ReactNode;
	desk: ReactNode;
	// Нужна ли на столе папка-справочник и с какой вкладки её открывать.
	rulebookTab?: RulebookTabId;
	// Высота стола в пикселях на широком экране.
	deskHeight?: number;
	tutorial?: TutorialController;
}

export function Workplace({ booth, monitorSection, monitorTitle, monitor, desk, rulebookTab, deskHeight = 500, tutorial }: WorkplaceProps) {
	const chrome = useLevelChrome();
	const rootRef = useRef<HTMLElement>(null);
	const deskRef = useRef<HTMLDivElement>(null);
	const ficusState = getFicusState(chrome.share);
	const texts = accountantTexts.workplace;

	return (
		<AmountTargetProvider>
			<section ref={rootRef} className={`${styles.workplace} ${fontVariables}`} aria-label={texts.deskLabel}>
				<header className={styles.dayBar}>
					<p className={styles.dayLabel}>
						{fillTemplate(texts.dayLabel, { day: String(chrome.dayNumber) })}
						{chrome.levelTitle ? <span className={styles.levelName}>{chrome.levelTitle}</span> : null}
					</p>
					<WorkClock startedAtMs={chrome.startedAtMs} />
					<div className={styles.dayFicus} data-testid="ficus" data-state={ficusState}>
						<Ficus state={ficusState} label={accountantTexts.desk.ficusStates[ficusState]} />
					</div>
					<p className={styles.dayScore}>
						{texts.scoreLabel}: <strong>{chrome.scoreText}</strong>
					</p>
					{tutorial?.enabled ? (
						<button type="button" className={styles.tutorialHelp} data-tutorial-help aria-label={tutorialTexts.replay} onClick={tutorial.replay}>?</button>
					) : null}
					<button type="button" className={styles.exitButton} onClick={chrome.onExitEarly} disabled={chrome.isExitDisabled}>
						{accountantTexts.window.exitEarly}
					</button>
				</header>

				<div className={styles.upper}>
					<section className={styles.booth} data-tutorial-id="booth" aria-label={texts.boothLabel}>
						<div className={styles.boothWindow}>
							<PixelCharacter
								key={`${booth.character}-${booth.variant ?? 0}-${booth.name}`}
								character={booth.character}
								variant={booth.variant}
								label={booth.name}
								className={styles.boothCharacter}
							/>
							<p className={styles.boothName}>{booth.name}</p>
							{/* Подоконник окошка: сюда кладут бумаги, которые отдают посетителю. */}
							<div className={styles.boothCounter}>{booth.counter}</div>
						</div>
						<p className={styles.speech} data-testid="booth-speech" key={booth.speech}>
							{booth.speech}
						</p>
					</section>

					<AppWindow
						activeSection={monitorSection}
						formTitle={monitorTitle}
						messages={chrome.messages}
						notifications={chrome.notifications}
						hideNotifications={!!tutorial?.current}
						onCloseNotification={chrome.closeNotification}
					>
						{monitor}
					</AppWindow>
				</div>

				<DeskLayoutProvider deskRef={deskRef}>
					<div className={styles.desk} data-tutorial-id="desk" ref={deskRef} style={{ "--desk-height": `${deskHeight}px` } as React.CSSProperties}>
						{desk}
						{rulebookTab ? <Rulebook defaultPosition={{ x: 850, y: 374 }} initialTab={rulebookTab} /> : null}
						<Calculator defaultPosition={{ x: 830, y: 16 }} />
						<SlipStack />
					</div>
				</DeskLayoutProvider>
				{tutorial?.current ? <TutorialOverlay rootRef={rootRef} tutorial={tutorial} step={tutorial.current} /> : null}
			</section>
		</AmountTargetProvider>
	);
}
