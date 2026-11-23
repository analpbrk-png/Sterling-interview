"use client";
import { Button, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

export interface TemplateValues {
  id?: string;
  name: string;
  country: string;
  university_id: string | null;
  is_default: boolean;
  identity_enabled: boolean;
  name_id_step_enabled: boolean;
  pronunciation_enabled: boolean;
  pronunciation_words: string[];
  declaration_enabled: boolean;
  declaration_text: string | null;
  prep_seconds: number;
  answer_seconds: number;
  submission_mode: string;
  allow_early_submit: boolean;
  question_count: number;
  ai_question_count: number;
  include_sensitive: boolean;
  tts_default: boolean;
}

export function TemplateForm({ t, universities, onSave, busy }: { t: TemplateValues; universities: Array<{ id: string; name: string }>; onSave: (form: FormData) => void; busy: boolean }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(new FormData(e.currentTarget)); }} className="grid gap-6 max-w-3xl">
      {t.id && <input type="hidden" name="id" value={t.id} />}
      <Card className="p-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template name"><Input name="name" required defaultValue={t.name} /></Field>
          <Field label="Country"><Input name="country" defaultValue={t.country} /></Field>
        </div>
        <Field label="University" hint="Leave as default to apply to every university in the country without its own template.">
          <Select name="university_id" defaultValue={t.university_id ?? ""}>
            <option value="">— Country default —</option>
            {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Checkbox name="is_default" label="Default template for this country" defaultChecked={t.is_default} />
      </Card>
      <Card className="p-5 grid gap-4">
        <h2 className="font-semibold">Timing and submission</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Preparation (s)" hint="0, 20, 30 or custom"><Input name="prep_seconds" type="number" min={0} max={600} list="prep-presets" defaultValue={t.prep_seconds} required /></Field>
          <Field label="Answer (s)" hint="60–180 or custom"><Input name="answer_seconds" type="number" min={10} max={900} list="answer-presets" defaultValue={t.answer_seconds} required /></Field>
          <Field label="Submission">
            <Select name="submission_mode" defaultValue={t.submission_mode}><option value="automatic">Automatic</option><option value="manual">Manual (Submit Answer)</option></Select>
          </Field>
        </div>
        <datalist id="prep-presets"><option value="0" /><option value="20" /><option value="30" /></datalist>
        <datalist id="answer-presets"><option value="60" /><option value="90" /><option value="120" /><option value="150" /><option value="180" /></datalist>
        <Checkbox name="allow_early_submit" label="Allow students to finish an answer early" defaultChecked={t.allow_early_submit} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Questions per interview"><Input name="question_count" type="number" min={1} max={40} defaultValue={t.question_count} required /></Field>
          <Field label="Of which AI-personalised" hint="Filled from the bank if AI is unavailable."><Input name="ai_question_count" type="number" min={0} max={20} defaultValue={t.ai_question_count} required /></Field>
        </div>
        <Checkbox name="include_sensitive" label="Include sensitive questions" hint="Visa history, dependants, health. Students are told before starting." defaultChecked={t.include_sensitive} />
        <Checkbox name="tts_default" label="Read questions aloud by default" defaultChecked={t.tts_default} />
      </Card>
      <Card className="p-5 grid gap-4">
        <h2 className="font-semibold">Introduction steps</h2>
        <p className="text-sm text-muted -mt-2">Welcome and camera/microphone check always run.</p>
        <Checkbox name="identity_enabled" label="Passport presentation practice" defaultChecked={t.identity_enabled} />
        <Checkbox name="name_id_step_enabled" label="State full name and student ID" defaultChecked={t.name_id_step_enabled} />
        <Checkbox name="pronunciation_enabled" label="Pronunciation check" defaultChecked={t.pronunciation_enabled} />
        <Field label="Pronunciation words" hint="Comma separated, up to 6."><Input name="pronunciation_words" defaultValue={t.pronunciation_words.join(", ")} /></Field>
        <Checkbox name="declaration_enabled" label="Read-aloud declaration (practice only)" defaultChecked={t.declaration_enabled} />
        <Field label="Declaration text"><Textarea name="declaration_text" rows={3} defaultValue={t.declaration_text ?? ""} /></Field>
      </Card>
      <div><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save template"}</Button></div>
    </form>
  );
}
