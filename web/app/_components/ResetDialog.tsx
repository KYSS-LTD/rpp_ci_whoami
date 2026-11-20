"use client";

import { commonTexts } from "@/texts/common";
import styles from "./ResetDialog.module.css";

interface ResetDialogProps {
	onConfirm: () => void;
	onCancel: () => void;
}

// Окно подтверждения сброса. Без подтверждения данные не меняются.
export function ResetDialog({ onConfirm, onCancel }: ResetDialogProps) {
	return (
		<>
			{/* Затемнение фона, только для вида */}
			<div className={styles.backdrop} aria-hidden="true" />
			<div role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title" className={styles.dialog}>
				<h2 id="reset-dialog-title">{commonTexts.resetTitle}</h2>
				<p>{commonTexts.resetBody}</p>
				<div className={styles.actions}>
					<button type="button" className={styles.confirm} onClick={onConfirm}>
						{commonTexts.resetConfirm}
					</button>
					<button type="button" onClick={onCancel}>
						{commonTexts.resetCancel}
					</button>
				</div>
			</div>
		</>
	);
}
