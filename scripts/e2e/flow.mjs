// P7.4 headless Chrome smoke run. Copied from the build bot's /workspace/ak-e2e
// scripts, with hardcoded paths made repo-relative: screenshots go to
// e2e-output/ (gitignored) instead of a fixed absolute path, the Chrome
// binary comes from CHROME_PATH, and the base URL from E2E_BASE_URL. Needs a
// dev server already running (AJALI_MOCK=1 so every AI call is a fixture,
// no key and no real Meta API calls) and playwright-core's own browser
// support for a system Chrome, not a bundled one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.E2E_BASE_URL || "http://localhost:3100";
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const out = path.join(process.cwd(), "e2e-output") + path.sep;
fs.mkdirSync(out, { recursive: true });
const carJpg = path.join(here, "fixtures", "car.jpg");
const tag = process.env.TAG || "flow";

const b = await chromium.launch({ executablePath: chromePath, headless: true });
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: -1.3, longitude: 36.82 },
  permissions: ["geolocation"],
});
// Codex review finding 4: relying only on the operator having started the
// dev server with AJALI_MOCK=1 means a misconfigured target (a server with
// a real MODEL_API_KEY and AJALI_MOCK unset) silently makes real, billed
// Meta Model API calls during a "smoke test". Forcing mock.ts's own request
// header on every request from this context (see src/lib/mock.ts's
// MOCK_HEADER) guarantees every AI route stays in its mock branch
// regardless of the server's own env var, matching the project rule that
// e2e runs never make a real API call.
await ctx.setExtraHTTPHeaders({ "x-ajali-mock": "1" });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
// Codex review finding 2: the original script only logged a failed step or a
// page error, so a broken flow still exited 0 and a CI-style caller (this
// npm script included) would read it as a pass. Collect every failure and
// set process.exitCode once, after the browser closes.
const failures = [];
const step = async (name, fn) => {
  try {
    await fn();
    console.log("OK  ", name);
  } catch (e) {
    console.log("FAIL", name, "-", e.message.split("\n")[0]);
    failures.push(name);
    await p.screenshot({ path: out + `e2e-${tag}-fail-${name.replace(/\W+/g, "_")}.png` });
  }
};

let hub;
await step("home -> safety", async () => {
  await p.goto(base + "/");
  // A fresh browser context has never completed onboarding, so Home
  // redirects there first (F1's "Returning user: skip onboarding" edge
  // state, the other way around). Skip it to reach Home itself; the click
  // auto-waits for the button, so this is a no-op if there is no redirect.
  await p.getByRole("button", { name: "Skip" }).click({ timeout: 5000 }).catch(() => {});
  await p.getByText("I have had an accident").waitFor({ timeout: 10000 });
  await p.getByText("I have had an accident").click();
  await p.getByText("Is anyone hurt?").waitFor({ timeout: 10000 });
});
await step("safety -> basics", async () => {
  await p.getByRole("button", { name: "No", exact: true }).click();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.waitForURL(/\/basics/, { timeout: 15000 });
  hub = p.url().replace(/\/basics.*/, "");
});
await step("basics fill", async () => {
  await p.locator("#locationText").fill("Mombasa Road near Capital Centre");
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out + `e2e-${tag}-basics.png` });
});
await step("photos upload 3", async () => {
  await p.goto(hub + "/photos");
  await p.getByText("Choose from gallery").first().waitFor();
  for (let i = 0; i < 3; i++) {
    await p.locator("input[type=file]:not([capture])").nth(i).setInputFiles(carJpg);
    await p.waitForTimeout(1200);
    await p.getByRole("button", { name: /Use photo/ }).click({ timeout: 15000 });
    await p.waitForTimeout(2500);
  }
  await p.reload();
  await p.waitForTimeout(1000);
  const n = await p.getByText(/^Done$/).count();
  console.log("     done badges after reload:", n, "|", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200));
  await p.screenshot({ path: out + `e2e-${tag}-photos.png`, fullPage: true });
});
await step("hub status", async () => {
  await p.goto(hub);
  await p.waitForTimeout(800);
  console.log("     hub text:", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300));
  await p.screenshot({ path: out + `e2e-${tag}-hub.png`, fullPage: true });
});
if (process.env.EXTRA) {
  const m = await import(process.env.EXTRA);
  await m.default({ p, hub, step, base, out, tag });
}
console.log("page errors:", errs.length ? errs : "none");
await b.close();

if (failures.length || errs.length) {
  console.log(`FAILED: ${failures.length} step(s), ${errs.length} page error(s)`);
  process.exitCode = 1;
} else {
  console.log("All steps passed, no page errors.");
}
