"use client";
import { RequireUser } from "@/components/guards";

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh"><RequireUser>{() => children}</RequireUser></div>;
}
