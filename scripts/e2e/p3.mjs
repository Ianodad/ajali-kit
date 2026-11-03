export default async function p3({ p, hub, step, out, tag }) {
  await step("damage AI (mock)", async () => {
    await p.goto(hub + "/photos");
    await p.getByRole("button", { name: /Check damage with AI/ }).click();
    const c = p.getByRole("button", { name: "Continue", exact: true });
    if (await c.count()) await c.click().catch(() => {});
    await p.waitForURL(/\/damage/, { timeout: 15000 }).catch(() => {});
    if (!/\/damage/.test(p.url())) await p.goto(hub + "/damage");
    const c2 = p.getByRole("button", { name: "Continue", exact: true });
    await p.waitForTimeout(1000);
    if (await c2.count()) await c2.click().catch(() => {});
    await p.getByRole("button", { name: "Confirm" }).first().waitFor({ timeout: 30000 });
    const n = await p.getByRole("button", { name: "Confirm" }).count();
    console.log("     damage items:", n);
    await p.screenshot({ path: out + `e2e-${tag}-damage.png`, fullPage: true });
    await p.getByRole("button", { name: "Confirm" }).first().click();
    await p.waitForTimeout(500);
    const dels = p.getByRole("button", { name: "Delete" });
    if ((await dels.count()) > 1) {
      await dels.last().click();
      await p.waitForTimeout(500);
    }
    await p.reload();
    await p.waitForTimeout(2500);
    console.log(
      "     after reload items:",
      await p.getByRole("button", { name: /Confirm|Edit/ }).count(),
      "| text:",
      (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300),
    );
  });
}
