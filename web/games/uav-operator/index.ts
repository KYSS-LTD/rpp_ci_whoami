import type { GameModuleInput } from "@/core/contract/types";
import { uavTexts } from "./texts";

export const uavGameModule: GameModuleInput = {
	manifest: {
		gameId: "uav-operator",
		contractVersion: 1,
		title: uavTexts.title,
		description: uavTexts.description,
		levels: [
			{ id: "easy", title: uavTexts.easy },
			{ id: "medium", title: uavTexts.medium },
			{ id: "hard", title: uavTexts.hard },
		],
		format: "3d",
		professionTags: [{ professionId: "uav-operator", weight: 1 }],
		preview: {
			frames: ["/game-previews/uav-operator/coast.webp"],
			animation: "/game-previews/uav-operator/flight.webp",
		},
		runtime: { kind: "iframe", entry: "/game-builds/uav-operator/index.html", readyTimeoutSec: 60 },
	},
};
