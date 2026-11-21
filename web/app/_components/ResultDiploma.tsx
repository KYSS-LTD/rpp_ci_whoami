"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LevelResult } from "@/core/contract/types";
import { ratingForPercent } from "@/core/diplomas";
import { scorePercent } from "@/core/achievements/rules";
import { readPlayerName } from "@/core/progress";
import { diplomasTexts } from "@/texts/diplomas";
import styles from "./LevelRunner.module.css";

const copy = diplomasTexts.result;

export function ResultDiploma({ result, gameTitle, levelTitle, difficulty }: {
	result: LevelResult;
	gameTitle: string;
	levelTitle: string;
	difficulty: string;
}) {
	const [name, setName] = useState(() => readPlayerName().slice(0, 120));
	const [link, setLink] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [issuedAt] = useState(() => new Date().toISOString());
	const generation = useRef<AbortController | null>(null);
	const filename = `diplom-${result.gameId}.pdf`;
	const rating = ratingForPercent(scorePercent(result));

	useEffect(() => () => generation.current?.abort(), []);
	useEffect(() => {
		if (link) return () => URL.revokeObjectURL(link);
	}, [link]);

	async function prepare(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const fullName = name.trim().replace(/\s+/g, " ").normalize("NFC");
		if (generation.current) return;
		if (!fullName) {
			setError(copy.nameRequired);
			return;
		}
		const request = new AbortController();
		generation.current = request;
		setBusy(true);
		setError("");
		try {
			const { createDiplomaPdf } = await import("@/core/diplomas/pdf");
			const file = await createDiplomaPdf(result, fullName, gameTitle, levelTitle, difficulty, issuedAt, request.signal);
			if (request.signal.aborted) return;
			const url = URL.createObjectURL(file);
			setLink(url);
			const download = document.createElement("a");
			download.href = url;
			download.download = filename;
			document.body.append(download);
			download.click();
			download.remove();
		} catch {
			if (!request.signal.aborted) setError(copy.error);
		} finally {
			generation.current = null;
			if (!request.signal.aborted) setBusy(false);
		}
	}

	return (
		<section className={styles.diploma} aria-labelledby="result-diploma-title">
			<h2 id="result-diploma-title">{copy.heading} <span data-rating={rating}>{diplomasTexts.ratings[rating]}</span></h2>
			<form className={styles.diplomaForm} onSubmit={prepare}>
				<label htmlFor="diploma-name">{copy.name}</label>
				<input id="diploma-name" autoComplete="name" required maxLength={120} value={name}
					onChange={(event) => { setName(event.target.value); setLink(""); setError(""); }} disabled={busy} />
				{link ? <a href={link} download={filename} className="button-primary">{copy.download}</a>
					: <button type="submit" className="button-primary" disabled={busy}>{busy ? copy.preparing : copy.download}</button>}
			</form>
			{error ? <p role="alert">{error}</p> : null}
		</section>
	);
}
