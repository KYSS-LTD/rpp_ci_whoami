import Link from "next/link";
import { landingTexts } from "@/texts/landing";
import styles from "./page.module.css";

// Лендинг: описание проекта и кнопка перехода к играм.
export default function LandingPage() {
	return (
		<div className={styles.landing}>
			<section className={styles.hero}>
				<h1>{landingTexts.heading}</h1>
				<p className={styles.intro}>{landingTexts.intro}</p>
				<div className={styles.actions}>
					<Link href="/games" className={`button-primary ${styles.cta}`}>
						{landingTexts.gamesButton}
					</Link>
					<p className={styles.privacy}>{landingTexts.privacyNote}</p>
				</div>
			</section>
			<section className={styles.benefits}>
				<h2>{landingTexts.benefitsTitle}</h2>
				<ul className={styles.benefitList}>
					{landingTexts.benefits.map((benefit) => (
						<li key={benefit}>{benefit}</li>
					))}
				</ul>
			</section>
		</div>
	);
}
