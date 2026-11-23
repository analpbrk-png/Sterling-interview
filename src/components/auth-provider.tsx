"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export interface AppUser {
  id: string;
  email: string;
  role: "student" | "admin";
}

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-reads the session; await it after signing in, before navigating. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ user: null, loading: true, signOut: async () => {}, refresh: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setUser(null);
    } else {
      // Role comes from the database (RLS: users read only their own row).
      const { data: row } = await supabase.from("users").select("role").eq("id", data.user.id).maybeSingle();
      setUser({ id: data.user.id, email: data.user.email ?? "", role: row?.role === "admin" ? "admin" : "student" });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void load();
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => void load(), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
    setUser(null);
    router.replace("/");
  }, [router]);

  return <Ctx.Provider value={{ user, loading, signOut, refresh: load }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
