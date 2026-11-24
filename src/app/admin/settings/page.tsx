"use client";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { must, useLoad } from "@/lib/use-load";
import { useAction } from "@/lib/use-action";
import { LocalAiPanel } from "@/components/admin/local-ai";
import { runRetention, saveSettings } from "@/lib/admin/ops";
import { Button, Card, Checkbox, Field, FlashBar, Input, LoadError, Loading, Notice, PageHeader } from "@/components/ui";

export default function Settings() {
  const { user } = useAuth();
  const { run, busy, flash } = useAction();
  const { data, error, loading, reload } = useLoad(async () => {
    const c = createClient();
    const rows = must(await c.from("admin_settings").select("key, value"));
    const courses = must(await c.from("courses").select("id, name, modules, is_verified, universities(name, country)").eq("is_active", true).order("name"));
    const count = async (f: (q: any) => any) => (await f(c.from("question_bank").select("*", { count: "exact", head: true }))).count ?? 0; // eslint-disable-line @typescript-eslint/no-explicit-any
    const stats = {
      imported: await count((q) => q.eq("origin", "imported")),
      importedQuestions: await count((q) => q.eq("origin", "imported").eq("question_type", "question")),
      introSteps: await count((q) => q.eq("origin", "imported").neq("question_type", "question")),
      approved: await count((q) => q.eq("review_status", "approved").eq("question_type", "question").is("invitation_id", null)),
      active: await count((q) => q.eq("is_active", true).eq("question_type", "question")),
      ai: await count((q) => q.eq("origin", "ai_generated")),
      uniSpecific: await count((q) => q.neq("applicable_university_ids", "{}")),
    };
    return { s: Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>, stats,
      courses: courses.map((x) => ({ id: x.id, name: x.name, modules: x.modules ?? [], is_verified: x.is_verified, university: x.universities as unknown as { name: string; country: string } })) };
  }, []);
  if (loading && !data) return <Loading />;
  if (error || !data) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const { s, stats, courses } = data;
  return (
    <>
      <PageHeader title="Settings" />
      <FlashBar flash={flash} />
      <div className="grid gap-6 max-w-3xl">
        <LocalAiPanel courses={courses} />
        <Card className="p-5 grid gap-3">
          <h2 className="font-semibold">Question bank</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {([["Total imported (3 PDFs)", `${stats.imported} (${stats.importedQuestions} questions + ${stats.introSteps} intro steps)`], ["Approved questions", stats.approved], ["Active in interviews", stats.active], ["AI-generated", stats.ai], ["University-specific", stats.uniSpecific]] as const).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line p-3"><p className="text-xs text-muted">{k}</p><p className="mt-1 font-semibold">{v}</p></div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void run(async () => { await saveSettings(f, user!.id); await reload(); return "Settings saved."; }); }} className="grid gap-4">
            <h2 className="font-semibold">Interview defaults</h2>
            <Checkbox name="ai_enabled" label="Use personalised questions in interviews (AI questions you saved, otherwise labelled templates)" defaultChecked={s.ai_enabled !== false} />
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
