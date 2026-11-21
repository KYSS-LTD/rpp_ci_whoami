import type { DishId, DishTutorialConfig } from "../contracts";

function steps(dish: DishId, ids: readonly string[]) {
	return ids.map((id, index) => ({ id, animationFile: `${dish}-${index + 1}.gif`, posterFile: `${dish}-${index + 1}.png` }));
}

export const dishTutorials: Record<DishId, DishTutorialConfig> = {
	ham: { dish: "ham", steps: steps("ham", ["hamTake", "hamCook", "hamPlate", "hamServe"]) },
	steak: { dish: "steak", steps: steps("steak", ["steakTake", "steakCook", "steakPlate", "steakServe"]) },
	burger: { dish: "burger", steps: steps("burger", ["burgerPrepare", "burgerCook", "burgerAssemble", "burgerServe"]) },
	veggieBurger: { dish: "veggieBurger", steps: steps("veggieBurger", ["veggiePrepare", "veggieCook", "veggieAssemble", "veggieServe"]) },
	stew: { dish: "stew", steps: steps("stew", ["stewPot", "stewWater", "stewChop", "stewFill", "stewCook", "stewServe"]) },
};
