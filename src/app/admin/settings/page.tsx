import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai/provider";
import { Card, Checkbox, Field, FlashMessage, Input, Notice, PageHeader } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import { runRetention, saveSettings } from "../actions";

export const metadata = { title: "Settings" };

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("admin_settings").select("key, value");
  const s = Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
  const ai = await getAIProvider();
  return (
    <>
      <PageHeader title="Settings" />
      <FlashMessage searchParams={sp} />
      <div className="grid gap-6 max-w-2xl">
        <Card className="p-5">
          <form action={saveSettings} className="grid gap-4">
            <h2 className="font-semibold">AI question generation</h2>
            {!ai && <Notice tone="warn">No AI provider is configured on the server (ANTHROPIC_API_KEY). Sessions use the approved bank only and say so to students.</Notice>}
            <Checkbox name="ai_enabled" label="Personalise interviews with AI" defaultChecked={s.ai_enabled !== false} />
            <Field label="Maximum AI questions per session"><Input name="ai_max_questions_per_session" type="number" min={0} max={20} defaultValue={Number(s.ai_max_questions_per_session ?? 6)} /></Field>
            <h2 className="font-semibold pt-2">Interviewer voice</h2>
            <Field label="Speaking rate" hint="0.7 (slow) – 1.3 (fast). Browser voice."><Input name="tts_rate" type="number" step="0.05" min={0.7} max={1.3} defaultValue={Number(s.tts_rate ?? 0.95)} /></Field>
            <h2 className="font-semibold pt-2">Data retention</h2>
            <Field label="Delete student documents after (days)"><Input name="document_retention_days" type="number" min={30} max={3650} defaultValue={Number(s.document_retention_days ?? 365)} /></Field>
            <SubmitButton>Save settings</SubmitButton>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Run retention cleanup</h2>
          <p className="text-sm text-muted mt-1">Permanently deletes CVs, passports and course documents older than the retention period.</p>
          <form action={runRetention} className="mt-4"><ConfirmSubmit variant="danger" message="Permanently delete documents older than the retention period?">Run now</ConfirmSubmit></form>
        </Card>
      </div>
    </>
  );
}
