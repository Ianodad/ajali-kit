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
    // The draft account itself renders inside a <textarea>, whose value
    // innerText() does not capture (a real gap found while running this
    // script for real against a mock server, not in the original review):
    // read textarea values too, or the "mentions the real location" check
    // below false-negatives even when the draft is correct.
    const textareaText = (await p.locator("main textarea").evaluateAll((els) => els.map((e) => e.value).join(" "))).replace(/\s+/g, " ");
    const combined = `${t} ${textareaText}`;
    console.log("     draft text:", textareaText.slice(0, 500));
    // Codex review finding 3: these used to be log lines only, so a draft
    // that silently came back empty, or without the real location the mock
    // fixture is supposed to carry (SPEC 8.1/the P5.2 PROGRESS note), still
    // reported the step as OK. Assert instead.
    if (!/Mombasa/.test(combined)) throw new Error("draft account does not mention the real location (Mombasa)");
    const cb = p.locator("input[type=checkbox]");
    if (await cb.count()) await cb.last().check();
    await p.waitForTimeout(1200);
    await p.screenshot({ path: out + `e2e-${tag}-account.png`, fullPage: true });
    await p.reload();
    await p.waitForTimeout(2000);
    const draftPersisted = (await p.getByText("Your claim account").count()) > 0;
    console.log("     after reload draft present:", draftPersisted);
    if (!draftPersisted) throw new Error("draft did not survive a reload");
  });
  await step("hub status final", async () => {
    await p.goto(hub);
    await p.waitForTimeout(1000);
    console.log("     hub:", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 260));
  });
}
