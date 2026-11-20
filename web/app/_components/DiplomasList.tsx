"use client";

import { gameRegistry } from "@/core/registry";
import { readDiplomas } from "@/core/progress";
import { buildCertificateFileName, buildCertificateHtml, type Diploma } from "@/core/diplomas";
import { commonTexts } from "@/texts/common";
import { diplomasTexts } from "@/texts/diplomas";
import { useProgressVersion } from "../_hooks/useProgressVersion";
import { downloadTextFile } from "./downloadFile";
import styles from "./DiplomasList.module.css";
import ui from "./ui.module.css";

// Названия игры и уровня из манифеста. Если игра больше не подключена, показываются идентификаторы.
function findTitles(diploma: Diploma): { gameTitle: string; levelTitle: string } {
	const manifest = gameRegistry.games.find((game) => game.manifest.gameId === diploma.gameId)?.manifest;
	const levelTitle = manifest?.levels.find((level) => level.id === diploma.levelId)?.title ?? diploma.levelId;
	return { gameTitle: manifest?.title ?? diploma.gameId, levelTitle };
}

// Формирует сертификат на устройстве пользователя и отдаёт его браузеру как HTML-файл для печати.
function downloadCertificate(diploma: Diploma): void {
	const html = buildCertificateHtml(diploma, findTitles(diploma), diplomasTexts.certificate);
	downloadTextFile(buildCertificateFileName(diploma), html, "text/html;charset=utf-8");
}

// Список дипломов, сгруппированный по игре и внутри игры по уровню сложности.
export function DiplomasList() {
	useProgressVersion();
	const diplomas = readDiplomas();

	const gameIds = Array.from(new Set(diplomas.map((diploma) => diploma.gameId)));

	return (
		<section className={ui.page}>
			<div className={ui.pageHeader}>
				<h1>{diplomasTexts.title}</h1>
				<p role="note" className={ui.note}>
					{commonTexts.localDataNotice}
				</p>
			</div>
			{diplomas.length === 0 ? <p className={ui.empty}>{diplomasTexts.empty}</p> : null}
			{gameIds.map((gameId) => {
				const gameTitle = gameRegistry.games.find((game) => game.manifest.gameId === gameId)?.manifest.title ?? gameId;
				const gameDiplomas = diplomas.filter((diploma) => diploma.gameId === gameId);
				return (
					<article key={gameId} className={styles.game}>
						<h2>{gameTitle}</h2>
						<ul className={styles.list}>
							{gameDiplomas.map((diploma) => (
								<li key={diploma.id} className={styles.diploma} data-rating={diploma.rating}>
									<span className={styles.medal} aria-hidden="true" />
									<span className={styles.level}>{diplomasTexts.levelLabel}: {diploma.levelId}</span>{" "}
									<span className={styles.detail}>
										{diplomasTexts.nameLabel}: {diploma.playerName}
									</span>{" "}
									<span className={styles.detail}>
										{commonTexts.levelScoreLabel}: {diploma.score} / {diploma.maxScore}
									</span>{" "}
									<span className={styles.rating}>{diplomasTexts.ratingLabel}: {diplomasTexts.ratings[diploma.rating]}</span>{" "}
									<button type="button" className={styles.certificate} onClick={() => downloadCertificate(diploma)}>
										{diplomasTexts.certificateButton}
									</button>
								</li>
							))}
						</ul>
					</article>
				);
			})}
		</section>
	);
}
