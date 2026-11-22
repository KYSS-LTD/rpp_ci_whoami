import Image from "next/image";
import Link from "next/link";
import { landingTexts } from "@/texts/landing";
import styles from "./page.module.css";

// Кадры для коллажа на первом экране: превью игр из библиотеки. Только для вида, поэтому alt пустой.
const heroFrames = ["/game-previews/uav-operator/coast.webp", "/game-previews/accountant-1c/poster.webp", "/game-previews/cooking/poster.webp"];

// Лендинг: описание проекта и кнопка перехода к играм.
export default function LandingPage() {
	return (
		<div className={styles.landing}>
			<section className={styles.hero}>
				<div className={styles.heroText}>
					<h1>{landingTexts.heading}</h1>
					<p className={styles.intro}>{landingTexts.intro}</p>
					<div className={styles.actions}>
						<Link href="/games" className={`button-primary ${styles.cta}`}>
							{landingTexts.gamesButton}
						</Link>
					</div>
				</div>
				<div className={styles.collage} aria-hidden="true">
					{heroFrames.map((frame, index) => (
						<div key={frame} className={styles.collageFrame} data-position={index + 1}>
							<Image src={frame} alt="" fill sizes="(max-width: 860px) 70vw, 360px" priority={index === 0} />
						</div>
					))}
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
