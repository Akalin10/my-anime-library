import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const workspace = process.cwd();
const testRoot = resolve(workspace, ".tmp", "round16-e2e");

if (!testRoot.startsWith(`${resolve(workspace)}${sep}`)) {
  throw new Error("E2E temporary directory escaped the workspace");
}

const playwrightCli = resolve(workspace, "node_modules", "@playwright", "test", "cli.js");
const nextCli = resolve(workspace, "node_modules", "next", "dist", "bin", "next");
const prepareScript = resolve(workspace, "tests", "e2e", "prepare.mjs");
const mockServerScript = resolve(workspace, "tests", "e2e", "mock-anilist-server.mjs");

function start(script, args = [], options = {}) {
  return spawn(process.execPath, [script, ...args], {
    cwd: workspace,
    stdio: "inherit",
    ...options,
  });
}

function waitForExit(child) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise(code ?? 1));
  });
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stop(child) {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
  }
}

let mockServer;
let appServer;

try {
  const prepare = start(prepareScript);
  if ((await waitForExit(prepare)) !== 0) {
    throw new Error("Unable to prepare the isolated E2E workspace");
  }

  mockServer = start(mockServerScript);
  appServer = start(
    nextCli,
    ["start", "--hostname", "127.0.0.1", "--port", "3130"],
    {
      env: {
        ...process.env,
        DATABASE_URL: resolve(testRoot, "anime.db"),
        POSTER_STORAGE_PATH: resolve(testRoot, "posters"),
        ANILIST_API_URL: "http://127.0.0.1:3131/graphql",
        NEXT_TEST_WASM_DIR: resolve(workspace, "node_modules", "@next", "swc-wasm-nodejs"),
      },
    },
  );

  await Promise.all([
    waitForUrl("http://127.0.0.1:3131/health", 30_000),
    waitForUrl("http://127.0.0.1:3130", 120_000),
  ]);

  const tests = start(playwrightCli, ["test"], { env: process.env });
  process.exitCode = await waitForExit(tests);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stop(appServer);
  stop(mockServer);
  try {
    rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.error("Unable to clean the isolated E2E workspace", error);
    process.exitCode = 1;
  }
}
