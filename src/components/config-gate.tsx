import { isSupabaseConfigured } from "@/lib/env";
import { Card } from "@/components/ui";

/** Clear setup screen instead of a crash when the backend is not configured. */
export function ConfigGate({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured()) return <>{children}</>;
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold">Setup needed</h1>
      <p className="mt-2 text-sm text-muted">
        The database is not connected yet. Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase URL and
        keys, apply the migrations, then restart the server. See the README for step-by-step instructions.
      </p>
    </Card>
  );
}
