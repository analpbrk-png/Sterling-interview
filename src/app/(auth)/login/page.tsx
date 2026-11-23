import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to continue practising.</p>
      {sp.error && <p className="mt-4 text-sm text-danger">{sp.error}</p>}
      <div className="mt-6"><AuthForm mode="login" next={sp.next ?? "/dashboard"} /></div>
      <p className="mt-6 text-sm text-muted">New here? <Link className="text-accent font-medium" href="/signup">Create an account</Link></p>
    </Card>
  );
}
