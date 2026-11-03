export default async function p5({ p, hub, step, out, tag }) {
  await step("account draft (mock)", async () => {
    await p.goto(hub + "/account");
    await p.locator("textarea").first().waitFor();
    await p.locator("textarea").first().fill("I was hit from behind while stopped at the lights on Mombasa Road.");
    await p.getByRole("button", { name: /Draft my claim with AI/ }).click();
    const c = p.getByRole("button", { name: "Continue", exact: true });
    await p.waitForTimeout(800);
    if (await c.count()) await c.click().catch(() => {});
    await p.getByText("Your claim account").waitFor({ timeout: 20000 });
    await p.waitForTimeout(800);
    const t = (await p.locator("main").innerText()).replace(/\s+/g, " ");
    console.log("     draft text:", t.slice(0, 500));
    console.log("     mentions Mombasa:", /Mombasa/.test(t), "| warning shown:", /Check this|front|behind/i.test(t));
    const cb = p.locator("input[type=checkbox]");
    if (await cb.count()) await cb.last().check();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: out + `e2e-${tag}-account.png`, fullPage: true });
    await p.reload();
    await p.waitForTimeout(2000);
    console.log("     after reload draft present:", (await p.getByText("Your claim account").count()) > 0);
  });
  await step("hub status final", async () => {
    await p.goto(hub);
    await p.waitForTimeout(1000);
    console.log("     hub:", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 260));
  });
}
