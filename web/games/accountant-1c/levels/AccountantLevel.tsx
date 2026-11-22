"use client";

// Уровень игры "Закрытие квартала" (design.md, D2): утро (газета и письмо), мини-игра A, перерыв на чай, мини-игра B, итоги дня.
// Один компонент на все три уровня: какие мини-игры идут, описано в data/levels.ts.
// Все фазы идут на одном рабочем месте (D11), уровень отдаёт ему очки, часы, сообщения и замечания главбуха.
// Результат уходит в портал ровно один раз за запуск (D9): "Сдать отчёт" или "Уйти домой пораньше".
import { useCallback, useRef, useState, type ComponentType } from "react";
import type { LevelComponentProps, LevelId } from "@/core/contract/types";
import { commonTexts } from "@/texts/common";
import { debugLog } from "@/core/debug";
import { LevelChromeProvider, type LevelChrome, type Slip } from "../desk/contexts";
import { Paper } from "../desk/Paper";
import { Workplace } from "../desk/Workplace";
import { levelTutorials } from "../data/tutorials";
import { CheckpointProvider, useCheckpoint, useSavedState } from "../hooks/checkpoint";
import { useTutorial } from "../hooks/useTutorial";
import { hintLevels, levelMaxScore, levelScenarios, miniGameMaxScore, type MiniGameData } from "../data/levels";
import { buildChiefReply, fillTemplate, type MistakeRecord } from "../logic/feedback";
import { buildLevelResult, getNextPhase, type LevelPhase } from "../logic/levelFlow";
import { calculateShare, getFicusState } from "../logic/mood";
import { applyHintPenalty } from "../logic/scoring";
import type { RandomSource } from "../logic/shuffle";
import { accountantManifest } from "../manifest";
import { miniGameComponents, type MiniGameOutcome, type MiniGameProgress, type MiniGameProps } from "../minigames";
import { accountantTexts } from "../texts";
import type { WindowMessage, WindowNotification } from "../ui/AppWindow";
import { MonthClose } from "../ui/parts";
import styles from "./AccountantLevel.module.css";

const debugScope = "accountant-1c";

// Номер рабочего дня для газеты и полосы дня.
const dayNumbers: Record<LevelId, number> = { easy: 1, medium: 2, hard: 3 };

export interface AccountantLevelProps extends LevelComponentProps {
	// Генератор перемешивания для тестов. По умолчанию Math.random.
	random?: RandomSource;
}

const emptyProgress: MiniGameProgress = { earned: 0, possible: 0 };

// Текущее время для длительности уровня. Вызывается только из обработчиков, не во время отрисовки.
function readClockMs(): number {
	return Date.now();
}

export function AccountantLevel(props: AccountantLevelProps) {
	return (
		<CheckpointProvider key={props.level.id} checkpoint={props.checkpoint} onSave={props.onCheckpoint}>
			<AccountantRun {...props} />
		</CheckpointProvider>
	);
}

function AccountantRun({ level, onFinish, onPause, random }: AccountantLevelProps) {
	const session = useCheckpoint();
	const [previousDuration] = useSavedState("elapsedMs", 0);
	const levelId = level.id as LevelId;
	const scenario = levelScenarios[levelId];
	const [startedAtMs] = useState(() => Date.now() - previousDuration);
	const [phase, setPhase] = useSavedState<LevelPhase>("level.phase", "intro");
	const [isLetterOpen, setIsLetterOpen] = useSavedState("level.isLetterOpen", false);
	const [isOverviewOpen, setIsOverviewOpen] = useSavedState("level.isOverviewOpen", false);
	const overview = useTutorial("level.tutorial", isOverviewOpen, levelTutorials[levelId], () => {
		setIsOverviewOpen(false);
		notifyDirector("start");
		goToPhase(getNextPhase("intro"));
	});
	const [outcomes, setOutcomes] = useSavedState<MiniGameOutcome[]>("level.outcomes", []);
	const [liveProgress, setLiveProgress] = useSavedState<MiniGameProgress>("level.liveProgress", emptyProgress);
	const [messages, setMessages] = useSavedState<WindowMessage[]>("level.messages", []);
	const [slips, setSlips] = useSavedState<Slip[]>("level.slips", []);
	const [mistakesCount, setMistakesCount] = useSavedState("level.mistakesCount", 0);
	const [notifications, setNotifications] = useSavedState<WindowNotification[]>("level.notifications", []);
	const [isSent, setIsSent] = useState(false);
	// Флаг отправки в ref: защищает от двойного вызова onFinish даже при двух быстрых нажатиях до перерисовки.
	const isSentRef = useRef(false);
	const nextMessageIdRef = useRef(Math.max(0, ...messages.map(({ id }) => id),
		...slips.map(({ id }) => id), ...notifications.map(({ id }) => id)) + 1);
	const focusLetterHeading = useCallback((heading: HTMLHeadingElement | null) => {
		heading?.focus();
	}, []);

	const finalScores = outcomes.map((outcome) => applyHintPenalty(levelId, outcome.score, outcome.hintsUsed));
	const levelScore = finalScores.reduce((total, score) => total + score, 0);
	const share = calculateShare(levelScore + liveProgress.earned, miniGameMaxScore * outcomes.length + liveProgress.possible);

	function takeMessageId(): number {
		const id = nextMessageIdRef.current;
		nextMessageIdRef.current += 1;
		return id;
	}

	function notifyDirector(key: keyof (typeof accountantTexts.notifications)["easy"]) {
		setNotifications((previous) => [...previous, { id: takeMessageId(), text: accountantTexts.notifications[levelId][key] }]);
	}

	const closeNotification = useCallback((id: number) => {
		setNotifications((previous) => previous.filter((notification) => notification.id !== id));
	}, [setNotifications]);

	const removeSlip = useCallback((id: number) => {
		setSlips((previous) => previous.filter((slip) => slip.id !== id));
	}, [setSlips]);

	function goToPhase(nextPhase: LevelPhase) {
		debugLog(debugScope, "фаза", levelId, nextPhase);
		setPhase(nextPhase);
	}

	// Ошибка: строка в «Сообщениях» программы и листок «Замечание» от главбуха на столе.
	function handleMistake(mistake: MistakeRecord) {
		const reply = buildChiefReply(mistake, accountantTexts.explanations);
		debugLog(debugScope, "ошибка", mistake.explanationId, mistake.values);
		if (!reply) {
			return;
		}
		setMistakesCount((count) => count + 1);
		setMessages((previous) => [...previous, { id: takeMessageId(), kind: "mistake", text: reply.correct }]);
		setSlips((previous) => [...previous, { id: takeMessageId(), correct: reply.correct, reason: reply.reason, joke: reply.joke }]);
	}

	function handleNotice(text: string) {
		setMessages((previous) => [...previous, { id: takeMessageId(), kind: "info", text }]);
	}

	function handleMiniGameComplete(outcome: MiniGameOutcome) {
		debugLog(debugScope, "мини-игра завершена", levelId, phase, outcome);
		setOutcomes((previous) => [...previous, outcome]);
		setLiveProgress(emptyProgress);
		setSlips([]);
		if (phase === "gameA") {
			goToPhase("summaryA");
		} else if (phase === "gameB") {
			notifyDirector("beforeClose");
			goToPhase("monthClose");
		}
	}

	function sendResult(completed: boolean) {
		if (isSentRef.current) {
			debugLog(debugScope, "повторная отправка результата отклонена");
			return;
		}
		isSentRef.current = true;
		setIsSent(true);
		const result = buildLevelResult({
			gameId: accountantManifest.gameId,
			levelId,
			score: levelScore,
			completed,
			startedAtMs,
			finishedAtMs: readClockMs(),
		});
		debugLog(debugScope, "результат уровня", result);
		onFinish(result);
	}

	const chrome: LevelChrome = {
		dayNumber: dayNumbers[levelId],
		levelTitle: level.title,
		startedAtMs,
		scoreText: `${levelScore} / ${levelMaxScore}`,
		share,
		messages,
		slips,
		notifications,
		removeSlip,
		closeNotification,
		exitLabel: onPause ? commonTexts.saveAndExit : undefined,
		onExitEarly: () => {
			if (!onPause) {
				sendResult(false);
				return;
			}
			session?.update("elapsedMs", readClockMs() - startedAtMs);
			session?.flush();
			onPause();
		},
		isExitDisabled: isSent,
	};

	function renderIntro() {
		const intro = accountantTexts.intros[levelId];
		const paper = accountantTexts.newspaper;
		const news = paper[levelId];
		const isFromDirector = intro.from === accountantTexts.characters.directorShort;
		return (
			<Workplace
				booth={{
					character: isFromDirector ? "director" : "chief",
					name: isFromDirector ? accountantTexts.boothCharacters.director : accountantTexts.boothCharacters.chief,
					speech: isLetterOpen ? intro.body[0] : paper.greeting,
				}}
				monitorSection="home"
				rulebookTab="documents"
				tutorial={overview}
				monitorTitle={null}
				monitor={
					<div className={styles.monitorNote}>
						<p className={styles.monitorHeading}>{accountantTexts.window.homeTab}</p>
						<ol className={styles.taskList}>
							{scenario.map((miniGame) => (
								<li key={miniGame.kind}>{accountantTexts.miniGames[miniGame.kind].tab}</li>
							))}
						</ol>
					</div>
				}
				desk={
					<>
						<Paper id="newspaper" variant="newspaper" defaultPosition={{ x: 24, y: 20 }} width={360} tilt={-2} title={paper.name}>
							<div className={styles.newspaper}>
								<p className={styles.newsDate}>{fillTemplate(paper.dateLine, { day: String(dayNumbers[levelId]) })}</p>
								<p className={styles.headline}>{news.headline}</p>
								<div className={styles.newsColumns}>
									{news.articles.map((article) => (
										<p key={article}>{article}</p>
									))}
								</div>
								{!isLetterOpen ? (
									<button type="button" className={`${styles.bigButton} ${styles.openLetter}`} onClick={() => setIsLetterOpen(true)}>
										{paper.openLetter}
									</button>
								) : null}
							</div>
						</Paper>
						{isLetterOpen ? (
							<Paper id="letter" variant="form" defaultPosition={{ x: 410, y: 60 }} width={380} tilt={1.5} title={intro.from}>
								<article className={styles.letter} aria-labelledby="accountant-intro-subject">
									<h2 id="accountant-intro-subject" className={styles.letterSubject} ref={focusLetterHeading} tabIndex={-1}>
										{intro.subject}
									</h2>
									{intro.body.map((line) => (
										<p key={line}>{line}</p>
									))}
									<button
										type="button"
										className={styles.bigButton}
										onClick={() => setIsOverviewOpen(true)}
									>
										{paper.start}
									</button>
								</article>
							</Paper>
						) : null}
					</>
				}
			/>
		);
	}

	function renderSummary() {
		const scoreA = finalScores[0] ?? 0;
		const ficusState = getFicusState(calculateShare(scoreA, miniGameMaxScore));
		return (
			<Workplace
				booth={{ character: "chief", name: accountantTexts.boothCharacters.chief, speech: accountantTexts.summaryScene.comments[ficusState] }}
				monitorSection="home"
				monitorTitle={null}
				monitor={<p className={styles.monitorHeading}>{accountantTexts.boothSpeech.summary}</p>}
				desk={
					<Paper id="teaBreak" variant="note" defaultPosition={{ x: 220, y: 70 }} width={320} tilt={-2.5} title={accountantTexts.summaryScene.title}>
						<section className={styles.letter} aria-labelledby="accountant-summary-title">
							<h2 id="accountant-summary-title" className={styles.letterSubject}>
								{accountantTexts.summaryScene.title}
							</h2>
							<p className={styles.bigNumber}>
								{accountantTexts.summaryScene.scoreLabel}:{" "}
								<strong data-testid="summary-score">
									{scoreA} / {miniGameMaxScore}
								</strong>
							</p>
							<p>{accountantTexts.story[levelId].handoff}</p>
							<button
								type="button"
								className={styles.bigButton}
								onClick={() => {
									notifyDirector("beforeSecond");
									goToPhase(getNextPhase("summaryA"));
								}}
							>
								{accountantTexts.buttons.next}
							</button>
						</section>
					</Paper>
				}
			/>
		);
	}

	function renderMonthClose() {
		return (
			<Workplace
				booth={{ character: "director", name: accountantTexts.boothCharacters.director, speech: accountantTexts.boothSpeech.monthClose }}
				monitorSection="reports"
				monitorTitle={accountantTexts.monthClose.title}
				monitor={<p className={styles.monitorHeading}>{accountantTexts.monthClose.lead}</p>}
				desk={
					<Paper id="daySummary" variant="form" defaultPosition={{ x: 32, y: 16 }} width={770} title={accountantTexts.daySummary.title} className={styles.finalReport}>
						<MonthClose
							levelScore={levelScore}
							isSent={isSent}
							onSubmit={() => sendResult(true)}
							taskLines={scenario.map((miniGame, index) => ({
								title: accountantTexts.miniGames[miniGame.kind].tab,
								score: finalScores[index] ?? 0,
							}))}
							hintsUsed={outcomes.reduce((total, outcome) => total + outcome.hintsUsed, 0)}
							mistakesCount={mistakesCount}
							epilogue={accountantTexts.story[levelId].ending}
						/>
					</Paper>
				}
			/>
		);
	}

	function renderPhase() {
		if (phase === "intro") {
			return renderIntro();
		}
		if (phase === "summaryA") {
			return renderSummary();
		}
		if (phase === "monthClose") {
			return renderMonthClose();
		}
		const currentMiniGame: MiniGameData = phase === "gameA" ? scenario[0] : scenario[1];
		const MiniGame = miniGameComponents[currentMiniGame.kind] as ComponentType<MiniGameProps<MiniGameData>>;
		return (
			<div data-testid={`minigame-${currentMiniGame.kind}`}>
				<MiniGame
					key={phase}
					data={currentMiniGame}
					hintsEnabled={hintLevels.includes(levelId)}
					tutorialEnabled
					random={random}
					onComplete={handleMiniGameComplete}
					onMistake={handleMistake}
					onNotice={handleNotice}
					onProgress={setLiveProgress}
				/>
			</div>
		);
	}

	return (
		<section className={styles.level} data-phase={phase} aria-label={level.title}>
			<h1 className={styles.levelTitle}>
				{accountantTexts.title}: {level.title}
			</h1>
			<LevelChromeProvider value={chrome}>{renderPhase()}</LevelChromeProvider>
		</section>
	);
}
