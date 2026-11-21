"use client";

import Image from "next/image";
import { achievementDefinitions } from "@/core/achievements";
import { readAwardedAchievements } from "@/core/progress";
import { commonTexts } from "@/texts/common";
import { useProgressVersion } from "../_hooks/useProgressVersion";
import styles from "./AchievementsList.module.css";
import ui from "./ui.module.css";

// Список всех ачивок: полученные помечены датой, неполученные показаны закрытыми.
export function AchievementsList() {
	useProgressVersion();
	const awarded = readAwardedAchievements();

	return (
		<section className={ui.page}>
			<div className={ui.pageHeader}>
				<h1>{commonTexts.achievementsTitle}</h1>
				<p className={ui.lead}>{commonTexts.achievementsIntro}</p>
			</div>
			<ul className={styles.list}>
				{achievementDefinitions.map((definition) => {
					const awardedItem = awarded.find((item) => item.id === definition.id);
					return (
						<li key={definition.id} className={styles.item} data-awarded={Boolean(awardedItem)} data-illustrated={Boolean(definition.icon)}>
							{definition.icon ? <Image src={definition.icon} className={styles.icon} alt="" width={56} height={56} unoptimized /> : null}
							<h2>{definition.title}</h2>
							<p className={styles.description}>{definition.description}</p>
							{awardedItem ? (
								<p className={styles.date}>
									{commonTexts.achievementAwardedOn}: {new Date(awardedItem.awardedAt).toLocaleDateString("ru-RU")}
								</p>
							) : <p className={styles.locked}>{commonTexts.achievementLocked}</p>}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
