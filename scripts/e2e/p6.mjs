import fs from "node:fs";

export default async function p6({ p, hub, step, out, tag }) {
  await step("pack build + download PDF", async () => {
    await p.goto(hub + "/pack");
    await p.getByText("Required for your claim pack").waitFor({ timeout: 15000 });
    const reg = p.locator('input[placeholder="KDA 123A"]');
    if (await reg.count()) {
      await reg.fill("KDA 123A");
      await p.getByRole("button", { name: "Save", exact: true }).click();
      await p.waitForTimeout(800);
    }
    await p.screenshot({ path: out + `e2e-${tag}-pack-ready.png`, fullPage: true });
    await p.getByRole("button", { name: "Build claim pack" }).click();
    await p.getByRole("button", { name: "Download PDF" }).waitFor({ timeout: 60000 });
    const [dl] = await Promise.all([
      p.waitForEvent("download", { timeout: 20000 }),
      p.getByRole("button", { name: "Download PDF" }).click(),
    ]);
    const f = out + `e2e-${tag}-claim-pack.pdf`;
    await dl.saveAs(f);
    const head = fs.readFileSync(f).subarray(0, 5).toString();
    console.log("     pdf:", dl.suggestedFilename(), fs.statSync(f).size, "bytes, header", head);
    if (head !== "%PDF-") throw new Error("not a pdf");
    await p.screenshot({ path: out + `e2e-${tag}-pack-built.png`, fullPage: true });
  });
  await step("print fallback", async () => {
    await p.goto(hub + "/pack/print");
    await p.waitForTimeout(3000);
    const text = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    console.log("     print page text:", text.slice(0, 200));
    await p.screenshot({ path: out + `e2e-${tag}-print.png`, fullPage: true });
    // Codex review finding 3: this used to be a log line only, so a page
    // that silently fell back to "Incident not found" or "not ready yet"
    // (for example if an earlier step did not actually leave the pack
    // ready) still reported the step as OK.
    if (/Incident not found|not ready yet/i.test(text)) throw new Error(`print page did not render the pack: ${text.slice(0, 120)}`);
    if (text.length < 100) throw new Error("print page content looks too short to be the real pack");
  });
}
