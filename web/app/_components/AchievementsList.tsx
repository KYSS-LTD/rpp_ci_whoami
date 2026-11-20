"use client";

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
						<li key={definition.id} className={styles.item} data-awarded={awardedItem ? "true" : "false"}>
							<h2>{awardedItem ? definition.title : commonTexts.achievementLocked}</h2>
							{awardedItem ? (
								<>
									<p className={styles.description}>{definition.description}</p>
									<p className={styles.date}>
										{commonTexts.achievementAwardedOn}: {new Date(awardedItem.awardedAt).toLocaleDateString("ru-RU")}
									</p>
								</>
							) : null}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
