"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, type AppUser } from "./auth-provider";
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
 * Client-side gate for signed-in pages. It only decides what to render:
 * the actual protection is row level security in the database.
 */
export function RequireUser({ admin = false, children }: { admin?: boolean; children: (user: AppUser) => React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (loading || !isSupabaseConfigured) return;
    if (!user) router.replace(`/login/?next=${encodeURIComponent(path + window.location.search)}`);
    else if (admin && user.role !== "admin") router.replace("/dashboard/?error=admin_only");
  }, [admin, loading, path, router, user]);
  if (!isSupabaseConfigured) return <SetupNeeded />;
  if (loading || !user || (admin && user.role !== "admin")) return <Loading />;
  return <>{children(user)}</>;
}
