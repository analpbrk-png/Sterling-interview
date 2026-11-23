"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, Loading } from "@/components/ui";

/** Completes email confirmation / magic-link sign-in (PKCE code exchange in the browser). */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const nextParam = params.get("next") ?? "/dashboard/";
    const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard/";
    if (!code) { setError("That sign-in link is invalid or expired."); return; }
    createClient().auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) setError("That sign-in link is invalid or expired. Please sign in.");
      else router.replace(next);
    });
  }, [router]);
  if (!error) return <Loading label="Signing you in…" />;
  return <Card className="p-6"><p className="text-danger">{error}</p><Link href="/login/" className="mt-3 inline-block text-accent">Go to sign in</Link></Card>;
}
