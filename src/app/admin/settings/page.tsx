"use client";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { ThemeToggle } from "@/components/theme-toggle";
import { Archive, Palette, Save, SlidersHorizontal, Trash2, Volume2 } from "lucide-react";
import { runRetention, saveSettings } from "@/lib/admin/ops";
import { Button, Checkbox, Field, FlashBar, Input, LoadError, Loading, PageHeader, Section } from "@/components/ui";

export default function Settings() {
  const { user } = useAuth();
  const { run, busy, flash } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    const rows = must(await createClient().from("admin_settings").select("key, value"));
    return { s: Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown> };
  }, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const { s } = data;
  return (
    <>
      <PageHeader eyebrow="Configuration" title="General settings" description="Interview defaults, interviewer voice and data retention." />
      <FlashBar flash={flash} />
      <div className="grid gap-5 max-w-3xl">
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await saveSettings(f, user!.id); await reload(); return "Settings saved."; }); }} className="grid gap-5">
          <Section title="Interview defaults" icon={SlidersHorizontal} description="Applies to new interviews.">
            <div className="grid gap-4">
              <Checkbox name="ai_enabled" label="Use personalised questions in interviews" hint="AI questions you saved, otherwise clearly labelled template questions." defaultChecked={s.ai_enabled !== false} />
              <Field label="Maximum AI questions per session" className="sm:max-w-xs"><Input name="ai_max_questions_per_session" type="number" min={0} max={20} defaultValue={Number(s.ai_max_questions_per_session ?? 6)} /></Field>
            </div>
          </Section>
          <Section title="Interviewer voice" icon={Volume2} description="The browser voice that can read questions aloud.">
            <Field label="Speaking rate" hint="0.7 (slow) – 1.3 (fast)." className="sm:max-w-xs"><Input name="tts_rate" type="number" step="0.05" min={0.7} max={1.3} defaultValue={Number(s.tts_rate ?? 0.95)} /></Field>
          </Section>
          <Section title="Data retention" icon={Archive} description="How long student documents and recorded answers are kept.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Delete student documents after (days)"><Input name="document_retention_days" type="number" min={30} max={3650} defaultValue={Number(s.document_retention_days ?? 365)} /></Field>
              <Field label="Delete answer recordings after (days)" hint="Includes their transcripts and analysis."><Input name="audio_retention_days" type="number" min={7} max={3650} defaultValue={Number(s.audio_retention_days ?? 365)} /></Field>
            </div>
          </Section>
          <div><Button type="submit" disabled={busy}><Save /> Save settings</Button></div>
        </form>
        <Section title="Run retention cleanup" icon={Trash2} description="Permanently deletes student CVs, and answer recordings with their transcripts and analysis, older than their retention periods.">
          <Button variant="danger" disabled={busy} onClick={() => window.confirm("Permanently delete documents older than the retention period?") && void run(runRetention)}><Trash2 /> Run now</Button>
        </Section>
        <Section title="Appearance" icon={Palette} description="Light, dark or follow this device. Saved per browser.">
          <ThemeToggle />
        </Section>
      </div>
    </>
  );
}
