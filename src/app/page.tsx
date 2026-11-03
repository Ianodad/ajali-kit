import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ajali Kit</h1>
        <p className="text-muted-foreground max-w-xs text-balance">
          Your claim pack, sorted. Scaffold is ready. The app is built in the
          phases that follow.
        </p>
      </div>
      <Button disabled>Coming soon</Button>
    </main>
  );
}
