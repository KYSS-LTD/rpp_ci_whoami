"use client";

import { useState, type FormEvent } from "react";
import { notifyProgressChanged } from "@/core/progress";
import { platformStorage, storageKeys } from "@/core/storage";
import { commonTexts } from "@/texts/common";
import styles from "./NameForm.module.css";
import ui from "./ui.module.css";

interface NameFormProps {
	onSaved: (name: string) => void;
}

// Форма ввода имени перед первым прохождением. Пустое имя отклоняется, имя сохраняется в LocalStorage.
export function NameForm({ onSaved }: NameFormProps) {
	const [name, setName] = useState("");
	const [errorMessage, setErrorMessage] = useState("");

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmedName = name.trim();
		if (trimmedName.length === 0) {
			setErrorMessage(commonTexts.nameEmptyError);
			return;
		}
		const writeResult = platformStorage.write(storageKeys.playerName, trimmedName);
		if (!writeResult.ok) {
			setErrorMessage(commonTexts.nameSaveError);
			return;
		}
		notifyProgressChanged();
		onSaved(trimmedName);
	}

	return (
		<section className={`${ui.card} ${styles.wrapper}`}>
			<h2>{commonTexts.nameTitle}</h2>
			<p>{commonTexts.nameBody}</p>
			<form onSubmit={handleSubmit} noValidate className={styles.form}>
				<label className={styles.label}>
					{commonTexts.nameLabel}
					<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
				</label>
				{errorMessage ? (
					<p role="alert" className={styles.error}>
						{errorMessage}
					</p>
				) : null}
				<button type="submit" className={`button-primary ${styles.submit}`}>{commonTexts.nameSubmit}</button>
			</form>
		</section>
	);
}
