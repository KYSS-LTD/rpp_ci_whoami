"use client";

import Image from "next/image";
import Link from "next/link";
import type { LevelComponentProps } from "@/core/contract/types";
import { pixelLabManifest } from "../manifest";
import { pixelLabTexts } from "../texts";
import styles from "./PixelLabLevel.module.css";

// Уровень игры-заглушки. Когда игра будет готова, вместо картинки в блоке stage появится 2D-сцена
// (например, canvas с игровым циклом), а по завершении уровня компонент вызовет onFinish с результатом.
// Пока onFinish не вызывается: заглушка не должна создавать результаты, ачивки и дипломы.
export function PixelLabLevel({ level }: LevelComponentProps) {
	const stageFrame = pixelLabManifest.preview?.frames[0];

	return (
		<section className={styles.level}>
			<h1>{level.title}</h1>
			<div className={styles.stage}>
				{stageFrame ? <Image src={stageFrame} alt={pixelLabTexts.stageAlt} fill sizes="(max-width: 800px) 100vw, 760px" /> : null}
			</div>
			<div className={styles.notice}>
				<h2>{pixelLabTexts.developmentTitle}</h2>
				<p>{pixelLabTexts.developmentBody}</p>
				<Link href="/games" className="button-primary">
					{pixelLabTexts.backToLibrary}
				</Link>
			</div>
		</section>
	);
}
