"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth, type AppUser } from "./auth-provider";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { Card, Loading } from "@/components/ui";

export function SetupNeeded() {
  return (
    <div className="max-w-md mx-auto p-6">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Setup needed</h1>
        <p className="mt-2 text-sm text-muted">
          This build has no database connection. Set the NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY repository
          variables and redeploy. See the README.
        </p>
      </Card>
    </div>
  );
}

/**
 * Client-side gate for admin pages. It only decides what to render: the real
 * protection is row level security and admin-only database functions.
 */
export function RequireAdmin({ children }: { children: (user: AppUser) => React.ReactNode }) {
  return <AuthProvider><Gate>{children}</Gate></AuthProvider>;
}

function Gate({ children }: { children: (user: AppUser) => React.ReactNode }) {
  const admin = true;
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (loading || !isSupabaseConfigured) return;
    if (!user) router.replace(`/login/?next=${encodeURIComponent(path + window.location.search)}`);
  }, [loading, path, router, user]);
  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (loading || !user) return <Loading />;
  if (admin && user.role !== "admin") {
    return (
      <div className="max-w-md mx-auto p-6">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Administrators only</h1>
          <p className="mt-2 text-sm text-muted">This account does not have admin access. Students do not need to sign in: use the interview link from your adviser.</p>
          <button type="button" className="mt-4 text-sm font-medium text-accent" onClick={() => void signOut()}>Sign out</button>
        </Card>
      </div>
    );
  }
  return <>{children(user)}</>;
}
