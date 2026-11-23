import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Card } from "@/components/ui";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Practice sessions are private to you. Nothing is recorded.</p>
      <div className="mt-6"><AuthForm mode="signup" next="/profile" /></div>
      <p className="mt-6 text-sm text-muted">Already registered? <Link className="text-accent font-medium" href="/login">Sign in</Link></p>
    </Card>
  );
}
