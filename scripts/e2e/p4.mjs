import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const carJpg = path.join(here, "fixtures", "car.jpg");

export default async function p4({ p, hub, step, out, tag }) {
  await step("other party scan licence (mock)", async () => {
    await p.goto(hub + "/other-party");
    await p.getByText("Was another vehicle involved?").waitFor();
    await p.getByRole("button", { name: "Yes", exact: true }).click();
    await p.waitForTimeout(800);
    await p.locator("input[type=file]:not([capture])").first().setInputFiles(carJpg);
    await p.waitForTimeout(1000);
    const c = p.getByRole("button", { name: "Continue", exact: true });
    if (await c.count()) await c.click().catch(() => {});
    await p.waitForTimeout(4000);
    const vals = await p.locator("input").evaluateAll((els) => els.filter((e) => e.type !== "file" && e.value).map((e) => e.value));
    console.log("     filled fields:", vals.length, vals.slice(0, 6).join(" | "));
    console.log("     check-this badges:", await p.getByText("Check this").count());
    await p.screenshot({ path: out + `e2e-${tag}-otherparty.png`, fullPage: true });
    if (!vals.length) throw new Error("no fields filled");
  });
  await step("police save blank OB", async () => {
    await p.goto(hub + "/police");
    await p.locator("#station").waitFor();
    await p.locator("#station").fill("Capitol Hill Police Station");
    await p.getByRole("button", { name: "Save" }).click();
    await p.waitForTimeout(1500);
    console.log("     url after save:", p.url());
  });
  await step("witness add", async () => {
    await p.goto(hub + "/witnesses");
    await p.getByText("Did anyone see what happened?").waitFor();
    await p.getByRole("button", { name: "Yes", exact: true }).click();
    await p.waitForTimeout(500);
    const add = p.getByRole("button", { name: "Add witness" });
    if (await add.count()) await add.click();
    await p.waitForTimeout(500);
    const ins = p.locator("main input[type=text], main input:not([type])");
    console.log("     witness inputs:", await ins.count());
    if (await ins.count()) await ins.first().fill("Test Witness");
    const ta = p.locator("main textarea");
    if (await ta.count()) await ta.first().fill("I saw the blue car reverse into the red car.");
    await p.waitForTimeout(1200);
    await p.reload();
    await p.waitForTimeout(1500);
    console.log("     after reload has witness:", (await p.locator("main input").evaluateAll((e) => e.map((x) => x.value))).includes("Test Witness"));
  });
  await step("hub status", async () => {
    await p.goto(hub);
    await p.waitForTimeout(1000);
    console.log("     hub:", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 260));
  });
}
