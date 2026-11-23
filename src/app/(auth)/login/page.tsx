"use client";
import Link from "next/link";
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
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to continue practising.</p>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <div className="mt-6"><AuthForm mode="login" next={next ?? "/dashboard/"} /></div>
      <p className="mt-6 text-sm text-muted">New here? <Link className="text-accent font-medium" href="/signup/">Create an account</Link></p>
    </Card>
  );
}
