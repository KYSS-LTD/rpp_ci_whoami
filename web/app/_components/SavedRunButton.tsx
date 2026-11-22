"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { commonTexts } from "@/texts/common";
import { reset_SavedRun } from "./savedRun";
import styles from "./SavedRunButton.module.css";

interface SavedRunButtonProps {
	gameId: string;
	route: string;
	onLaunch: () => void;
	className?: string;
}

export function SavedRunButton({ gameId, route, onLaunch, className }: SavedRunButtonProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const descriptionId = useId();
	const [resetFailed, setResetFailed] = useState(false);

	function submit_Choice(event: FormEvent<HTMLFormElement>) {
		const submitter = (event.nativeEvent as SubmitEvent).submitter;
		if (!(submitter instanceof HTMLButtonElement) || submitter.value === "cancel") return;
		event.preventDefault();
		if (submitter.value === "reset" && !reset_SavedRun(gameId, route)) {
			setResetFailed(true);
			return;
		}
		dialogRef.current?.close();
		onLaunch();
	}

	return (
		<>
			<button type="button" className={className} onClick={() => {
				setResetFailed(false);
				dialogRef.current?.showModal();
			}}>
				{commonTexts.levelContinue}
			</button>
			<dialog ref={dialogRef} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}>
				<h2 id={titleId}>{commonTexts.savedRunTitle}</h2>
				<p id={descriptionId}>{commonTexts.savedRunBody}</p>
				{resetFailed ? <p role="alert">{commonTexts.savedRunResetError}</p> : null}
				<form method="dialog" className={styles.actions} onSubmit={submit_Choice}>
					<button type="submit" value="resume" className="button-primary" autoFocus>{commonTexts.savedRunResume}</button>
					<button type="submit" value="reset">{commonTexts.savedRunReset}</button>
					<button type="submit" value="cancel">{commonTexts.resetCancel}</button>
				</form>
			</dialog>
		</>
	);
}
