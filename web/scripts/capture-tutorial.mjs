import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const python = process.platform === "win32" ? "python" : "python3";
const result = spawnSync(python, [resolve(projectRoot, "scripts", "capture-tutorial-assets.py")], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
