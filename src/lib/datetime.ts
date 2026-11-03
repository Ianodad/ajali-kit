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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Display formatting for the claim pack (SPEC F9 cover and captions), on a
// local wall-clock value (a toLocalInputValue() result, or a plain
// "YYYY-MM-DD" date), not a raw ISO instant: string slicing only, so it never
// re-applies a timezone shift on a value that is already local.
export function formatLocalDate(localValue: string): string {
  const [year, month, day] = localValue.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatLocalDateTime(localValue: string): string {
  const time = localValue.slice(11, 16);
  return time ? `${formatLocalDate(localValue)}, ${time}` : formatLocalDate(localValue);
}
