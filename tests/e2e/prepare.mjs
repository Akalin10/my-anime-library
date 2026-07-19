import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve, sep } from "node:path";

const workspace = process.cwd();
const testRoot = resolve(workspace, ".tmp", "round16-e2e");

if (!testRoot.startsWith(`${resolve(workspace)}${sep}`)) {
  throw new Error("E2E temporary directory escaped the workspace");
}

rmSync(testRoot, { recursive: true, force: true });
mkdirSync(resolve(testRoot, "posters", "default"), { recursive: true });
mkdirSync(resolve(testRoot, "posters", "custom"), { recursive: true });

const database = new Database(resolve(testRoot, "anime.db"));
database.pragma("foreign_keys = ON");

for (const filename of readdirSync(resolve(workspace, "drizzle"))
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  const migration = readFileSync(resolve(workspace, "drizzle", filename), "utf8")
    .replaceAll("--> statement-breakpoint", "");
  database.exec(migration);
}

database
  .prepare("INSERT INTO app_setting (key, value) VALUES (?, ?)")
  .run("enabled_sources", JSON.stringify(["anilist"]));
database.close();
