import { db } from "./db";

// F1 edge state: "Storage unavailable (private mode): banner 'This browser
// can't save your claim. Use a normal tab.' Flow continues but warns before
// leaving." A real read is more reliable than feature-detecting
// `window.indexedDB`, since some private modes expose the API but throw on
// first use.
export async function isStorageAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    await db.incidents.limit(1).toArray();
    return true;
  } catch {
    return false;
  }
}
