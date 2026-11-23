"use client";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { useAiStatus } from "@/lib/admin/use-ai-status";
import { runRetention, saveSettings } from "@/lib/admin/ops";
import { Button, Card, Checkbox, Field, FlashBar, Input, LoadError, Loading, Notice, PageHeader } from "@/components/ui";

export default function Settings() {
  const { user } = useAuth();
  const ai = useAiStatus();
  const { run, busy, flash } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    const rows = must(await createClient().from("admin_settings").select("key, value"));
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  }, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const s = data;
  return (
    <>
      <PageHeader title="Settings" />
      <FlashBar flash={flash} />
      <div className="grid gap-6 max-w-2xl">
        <Card className="p-5">
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await saveSettings(f, user!.id); await reload(); return "Settings saved."; }); }} className="grid gap-4">
            <h2 className="font-semibold">AI question generation</h2>
            {ai && !ai.configured && <Notice tone="warn">No AI provider is configured. Set the ANTHROPIC_API_KEY secret for your Supabase Edge Functions. Until then sessions use the approved bank only and say so to students.</Notice>}
            <Checkbox name="ai_enabled" label="Personalise interviews with AI" defaultChecked={s.ai_enabled !== false} />
            <Field label="Maximum AI questions per session"><Input name="ai_max_questions_per_session" type="number" min={0} max={20} defaultValue={Number(s.ai_max_questions_per_session ?? 6)} /></Field>
            <h2 className="font-semibold pt-2">Interviewer voice</h2>
            <Field label="Speaking rate" hint="0.7 (slow) – 1.3 (fast). Browser voice."><Input name="tts_rate" type="number" step="0.05" min={0.7} max={1.3} defaultValue={Number(s.tts_rate ?? 0.95)} /></Field>
            <h2 className="font-semibold pt-2">Data retention</h2>
            <Field label="Delete student documents after (days)"><Input name="document_retention_days" type="number" min={30} max={3650} defaultValue={Number(s.document_retention_days ?? 365)} /></Field>
            <Button type="submit" disabled={busy}>Save settings</Button>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Run retention cleanup</h2>
          <p className="text-sm text-muted mt-1">Permanently deletes CVs, passports and course documents older than the retention period.</p>
          <Button className="mt-4" variant="danger" disabled={busy} onClick={() => window.confirm("Permanently delete documents older than the retention period?") && void run(runRetention)}>Run now</Button>
        </Card>
      </div>
    </>
  );
}
