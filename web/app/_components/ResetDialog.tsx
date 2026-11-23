"use client";

import { useEffect, useRef } from "react";
import { commonTexts } from "@/texts/common";
import styles from "./ResetDialog.module.css";

interface ResetDialogProps {
	onConfirm: () => void;
	onCancel: () => void;
}

export function ResetDialog({ onConfirm, onCancel }: ResetDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const opener = document.activeElement;
		dialog.showModal();
		cancelRef.current?.focus();
		return () => {
			dialog.close();
			if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
		};
	}, []);

	return (
		<dialog
			ref={dialogRef}
			className={styles.dialog}
			aria-labelledby="reset-dialog-title"
			aria-describedby="reset-dialog-body"
			onCancel={(event) => {
				event.preventDefault();
				onCancel();
			}}
		>
			<h2 id="reset-dialog-title">{commonTexts.resetTitle}</h2>
			<p id="reset-dialog-body">{commonTexts.resetBody}</p>
			<div className={styles.actions}>
				<button ref={cancelRef} type="button" onClick={onCancel}>{commonTexts.resetCancel}</button>
				<button type="button" className={styles.confirm} onClick={onConfirm}>{commonTexts.resetConfirm}</button>
			</div>
		</dialog>
	);
}
