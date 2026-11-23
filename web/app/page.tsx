import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { landingTexts } from "@/texts/landing";
import styles from "./page.module.css";

const mobileHero = getImageProps({
	src: "/career/workbench-mobile.webp",
	alt: "",
	width: 960,
	height: 640,
	sizes: "94vw",
}).props;

export default function LandingPage() {
	return (
		<div className={styles.landing}>
			<section className={styles.hero} aria-labelledby="landing-title">
				<div className={styles.heroText}>
					<p className={styles.category}>{landingTexts.category}</p>
					<h1 id="landing-title">{landingTexts.headingLead} <em>{landingTexts.headingAccent}</em></h1>
					<p className={styles.intro}>{landingTexts.intro}</p>
					<div className={styles.actions}>
						<Link href="/games" className={`button-primary ${styles.cta}`}>
							{landingTexts.gamesButton}<span className={styles.arrow} aria-hidden="true">↗</span>
						</Link>
						<a className={styles.howLink} href="#how">{landingTexts.benefitsTitle}</a>
					</div>
				</div>
				<div className={styles.heroImage}>
					<picture>
						<source media="(max-width: 699px)" srcSet={mobileHero.srcSet} sizes={mobileHero.sizes} />
						<Image src="/career/workbench.webp" alt="" fill loading="eager" fetchPriority="high" sizes="(max-width: 1240px) 47vw, 550px" />
					</picture>
				</div>
			</section>

			<section className={styles.professions} aria-labelledby="professions-title">
				<div className={styles.sectionHeader}>
					<h2 id="professions-title">{landingTexts.professionsTitle}</h2>
					<Link href="/games" className={styles.catalogLink}>{landingTexts.allGames} <span aria-hidden="true">→</span></Link>
				</div>
				<ul className={styles.cardGrid}>
					{landingTexts.professions.map((profession) => (
						<li key={profession.id}>
							<Link className={styles.profession} href={`/games?game=${profession.id}`}>
								<div className={styles.cardImage}>
									<Image src={`/career/${profession.cover}.webp`} alt="" fill sizes="(max-width: 599px) 110px, (max-width: 1240px) 31vw, 375px" />
								</div>
								<div className={styles.cardText}>
									<h3>{profession.name}</h3>
									<p>{profession.description}</p>
								</div>
								<span className={styles.cardArrow} aria-hidden="true">↗</span>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<section id="how" className={styles.benefits} aria-labelledby="benefits-title">
				<h2 id="benefits-title">{landingTexts.benefitsTitle}</h2>
				<ol className={styles.steps}>
					{landingTexts.benefits.map((step) => (
						<li key={step.title}><h3>{step.title}</h3><p>{step.body}</p></li>
					))}
				</ol>
			</section>
		</div>
	);
}
