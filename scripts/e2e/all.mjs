import a from "./p3.mjs";
import b from "./p4.mjs";
import c from "./p5.mjs";

export default async function all(x) {
  await a(x);
  await b(x);
  await c(x);
  for (const f of (process.env.MORE || "").split(",").filter(Boolean)) {
    const m = await import(f);
    await m.default(x);
  }
}
