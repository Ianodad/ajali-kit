import Link from "next/link";

// Shared placeholder for incident hub sub-routes that later phases fill in
// (S08 to S18). Keeps a real route and a back link in place now.
export function SectionPlaceholder({
  incidentId,
  title,
}: {
  incidentId: string;
  title: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        This section is built in a later phase.
      </p>
      <Link
        href={`/incident/${incidentId}`}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Back to incident
      </Link>
    </main>
  );
}
