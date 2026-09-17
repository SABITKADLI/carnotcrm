import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
try {
  process.loadEnvFile();
} catch {
  /* .env is optional */
}
const dir = resolve("data/backups");
mkdirSync(dir, { recursive: true });
const target = resolve(
  dir,
  `carnot-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
backup(db(), target)
  .then(() => console.log(`Consistent SQLite backup saved to ${target}`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
