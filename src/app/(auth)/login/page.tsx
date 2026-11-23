"use client";
import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui";
import { SetupNeeded } from "@/components/guards";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { useParam } from "@/lib/use-load";

export default function LoginPage() {
  const next = useParam("next");
  const error = useParam("error");
  if (!isSupabaseConfigured) return <SetupNeeded />;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Admin sign in</h1>
      <p className="mt-1 text-sm text-muted">For administrators only. Students do not need an account: open the interview link your adviser sent you.</p>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <div className="mt-6"><AuthForm mode="login" next={next ?? "/admin/"} /></div>
    </Card>
  );
}
