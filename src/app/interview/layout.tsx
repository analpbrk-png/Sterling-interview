import { ConfigGate } from "@/components/config-gate";

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh"><ConfigGate>{children}</ConfigGate></div>;
}
