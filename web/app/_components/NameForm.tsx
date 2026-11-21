"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { maxPlayerNameLength, savePlayerName } from "@/core/progress";
import { commonTexts } from "@/texts/common";
import styles from "./NameForm.module.css";
import ui from "./ui.module.css";

interface NameFormProps {
	onSaved: (name: string) => void;
	initialName?: string;
}

export function NameForm({ initialName = "", onSaved }: NameFormProps) {
	const [name, setName] = useState(initialName);
	const [errorMessage, setErrorMessage] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const inputId = useId();
	const hintId = `${inputId}-hint`;
	const errorId = `${inputId}-error`;

	useEffect(() => { input.current?.focus(); }, []);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const result = savePlayerName(name);
		if (!result.ok) {
			setErrorMessage(result.reason === "empty" ? commonTexts.nameEmptyError : commonTexts.nameSaveError);
			input.current?.focus();
			return;
		}
		onSaved(result.name);
	}

	return (
		<div className={`${ui.card} ${styles.wrapper}`}>
			<form onSubmit={handleSubmit} noValidate className={styles.form}>
				<label className={styles.label} htmlFor={inputId}>{commonTexts.nameLabel}</label>
				<p id={hintId} className={styles.hint}>{commonTexts.nameBody}</p>
				<input id={inputId} ref={input} name="name" autoComplete="name" required maxLength={maxPlayerNameLength}
					value={name} onChange={(event) => { setName(event.target.value); setErrorMessage(""); }}
					aria-invalid={errorMessage === commonTexts.nameEmptyError || undefined}
					aria-describedby={errorMessage ? `${hintId} ${errorId}` : hintId} />
				{errorMessage ? (
					<p id={errorId} role="alert" className={styles.error}>
						{errorMessage}
					</p>
				) : null}
				<button type="submit" className={`button-primary ${styles.submit}`}>{commonTexts.nameSubmit}</button>
			</form>
		</div>
	);
}
