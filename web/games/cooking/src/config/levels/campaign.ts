// Кампания: рабочий день недели (1..5) задаёт меню и обстановку кухни. Станция появляется в свой день (StationConfig.fromDay)
// на постоянном месте: первый день окорок (духовка, два прилавка, урна, ветчина, тарелки), второй стейк (ящик стейков, две плиты),
// третий бургер (стол с доской, булочки), четвёртый овощной бургер (картофель, морковь), пятый рагу (лук, раковина, плита с кастрюлей).
import type { LevelConfig } from "../../contracts";
import { getCampaignMenu } from "../../progress";

// Последний день недели: в этот день кухня обставлена полностью (как в данных уровня).
export const LAST_CAMPAIGN_DAY = 5;

// Уровень для рабочего дня: меню дня и станции, которые к этому дню уже стоят на кухне. Окно выдачи есть всегда.
export function applyCampaignDay(level: LevelConfig, day: number): LevelConfig {
	const clampedDay = Math.max(1, Math.min(LAST_CAMPAIGN_DAY, Math.floor(day)));
	return {
		...level,
		params: { ...level.params, menu: getCampaignMenu(clampedDay) },
		stations: level.stations.filter((station) => (station.fromDay ?? 1) <= clampedDay),
	};
}
