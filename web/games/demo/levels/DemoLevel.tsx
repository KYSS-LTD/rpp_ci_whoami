"use client";

import { useState } from "react";
import type { LevelComponentProps, LevelId } from "@/core/contract/types";
import { demoTexts } from "../texts";
import { demoManifest } from "../manifest";
import styles from "./DemoLevel.module.css";

// Компонент уровня демо-игры. Один и тот же компонент используется для easy, medium и hard,
// а вопросы берутся из текстов по идентификатору уровня.
export function DemoLevel({ level, onFinish }: LevelComponentProps) {
	const questions = demoTexts.questions[level.id as LevelId];
	const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
	const [startedAt] = useState(() => Date.now());

	const answeredCount = answers.filter((answer) => answer !== -1).length;
	const correctCount = answers.filter((answer, index) => answer === questions[index].correctIndex).length;

	function buildResult(completed: boolean) {
		return {
			gameId: demoManifest.gameId,
			levelId: level.id,
			score: correctCount,
			maxScore: questions.length,
			completed,
			durationSec: Math.round((Date.now() - startedAt) / 1000),
		};
	}

	// Доля отвеченных вопросов для полоски прогресса.
	const answeredPercent = Math.round((answeredCount / questions.length) * 100);

	return (
		<section className={styles.level}>
			<h1>{level.title}</h1>
			{questions.map((question, questionIndex) => (
				<fieldset key={question.text} className={styles.question}>
					<legend>
						<span className={styles.questionNumber}>
							{demoTexts.questionLabel} {questionIndex + 1}:
						</span>{" "}
						{question.text}
					</legend>
					<div className={styles.options}>
						{question.options.map((option, optionIndex) => (
							<label key={option} className={styles.option}>
								<input
									type="radio"
									name={`question-${questionIndex}`}
									checked={answers[questionIndex] === optionIndex}
									onChange={() =>
										setAnswers((previous) => previous.map((value, index) => (index === questionIndex ? optionIndex : value)))
									}
								/>
								{option}
							</label>
						))}
					</div>
				</fieldset>
			))}
			<div className={styles.footer}>
				<div className={styles.progress}>
					<p>
						{demoTexts.progressLabel}: {answeredCount} / {questions.length}
					</p>
					<div className={styles.progressTrack} aria-hidden="true">
						<div className={styles.progressFill} style={{ width: `${answeredPercent}%` }} />
					</div>
				</div>
				<div className={styles.buttons}>
					<button type="button" onClick={() => onFinish(buildResult(false))}>
						{demoTexts.abandon}
					</button>{" "}
					<button
						type="button"
						className="button-primary"
						disabled={answeredCount < questions.length}
						onClick={() => onFinish(buildResult(true))}
					>
						{demoTexts.finish}
					</button>
				</div>
			</div>
		</section>
	);
}
