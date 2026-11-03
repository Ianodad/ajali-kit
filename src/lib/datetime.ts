// Small helpers for the <input type="datetime-local"> on the Incident basics
// screen (S06). The value is local wall-clock time with no offset; we convert
// it to an ISO string the same way the rest of the app does (new
// Date().toISOString(), see createIncident in incidents.ts).

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}
