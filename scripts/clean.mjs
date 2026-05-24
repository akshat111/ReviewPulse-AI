import { rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const targets = ["dist", "node_modules", "tsconfig.tsbuildinfo"];

for (const target of targets) {
  const targetPath = join(root, target);
  if (existsSync(targetPath)) {
    console.log(`[clean] Removing ${target}...`);
    try {
      rmSync(targetPath, { recursive: true, force: true });
    } catch (err) {
      console.error(`[clean] Failed to remove ${target}: ${(err as Error).message}`);
    }
  }
}
console.log("[clean] Done!");
