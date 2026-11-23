import { Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveQuestion } from "@/app/admin/actions";

export interface QuestionRow {
  id?: string;
  question_text: string;
  source_text?: string | null;
  category_id: string;
  question_type: string;
  country: string;
  applicable_university_ids: string[];
  mentions_university?: string | null;
  prep_seconds: number | null;
  answer_seconds: number | null;
  submission_mode: string | null;
  is_mandatory: boolean;
  is_sensitive: boolean;
  sensitivity_reason: string | null;
  is_active: boolean;
  review_status: string;
  review_notes: string | null;
}

export function QuestionForm({ q, categories, universities }: {
  q: QuestionRow;
  categories: Array<{ id: string; name: string }>;
  universities: Array<{ id: string; name: string }>;
}) {
  return (
    <form action={saveQuestion} className="grid gap-6">
      {q.id && <input type="hidden" name="id" value={q.id} />}
      <input type="hidden" name="review_status" value={q.review_status} />
      <Card className="p-5 grid gap-4">
        <Field label="Question shown to students"><Textarea name="question_text" rows={3} required defaultValue={q.question_text} /></Field>
        {q.source_text && (
          <div>
            <p className="text-sm font-medium">Original source wording (read-only)</p>
            <pre className="mt-1.5 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm text-ink-2 font-sans">{q.source_text}</pre>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <Select name="category_id" defaultValue={q.category_id}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Type">
            <Select name="question_type" defaultValue={q.question_type}>
              <option value="question">Interview question</option><option value="identity_instruction">Identity instruction</option>
              <option value="pronunciation">Pronunciation check</option><option value="declaration">Declaration</option>
            </Select>
          </Field>
          <Field label="Country"><Input name="country" defaultValue={q.country} /></Field>
        </div>
      </Card>
      <Card className="p-5 grid gap-4">
        <h2 className="font-semibold">Timing</h2>
        <p className="text-sm text-muted -mt-2">Leave blank to use the interview template&apos;s defaults.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Preparation (seconds)"><Input name="prep_seconds" type="number" min={0} max={600} defaultValue={q.prep_seconds ?? ""} placeholder="Template default" /></Field>
          <Field label="Answer (seconds)"><Input name="answer_seconds" type="number" min={10} max={900} defaultValue={q.answer_seconds ?? ""} placeholder="Template default" /></Field>
          <Field label="Submission">
            <Select name="submission_mode" defaultValue={q.submission_mode ?? ""}><option value="">Template default</option><option value="automatic">Automatic</option><option value="manual">Manual</option></Select>
          </Field>
        </div>
      </Card>
      <Card className="p-5 grid gap-4">
        <h2 className="font-semibold">Applicability</h2>
        {q.mentions_university && <p className="text-sm text-warn">This wording names <strong>{q.mentions_university}</strong>. Select the matching university below before activating.</p>}
        <p className="text-sm text-muted -mt-2">No selection = every university in the country.</p>
        <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-auto rounded-xl border border-line p-3">
          {universities.length ? universities.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="applicable_university_ids" value={u.id} defaultChecked={q.applicable_university_ids.includes(u.id)} className="accent-[var(--accent)] h-4 w-4" />
              {u.name}
            </label>
          )) : <p className="text-sm text-muted">Add universities first.</p>}
        </div>
        <Checkbox name="is_mandatory" label="Always include (mandatory)" defaultChecked={q.is_mandatory} />
        <Checkbox name="is_sensitive" label="Sensitive question" hint="Only used when the template explicitly allows sensitive questions; students see a notice." defaultChecked={q.is_sensitive} />
        <Field label="Sensitivity reason"><Input name="sensitivity_reason" defaultValue={q.sensitivity_reason ?? ""} /></Field>
      </Card>
      <Card className="p-5 grid gap-4">
        <h2 className="font-semibold">Review</h2>
        <Field label="Review notes"><Textarea name="review_notes" rows={3} defaultValue={q.review_notes ?? ""} /></Field>
        {q.review_status === "approved" && <Checkbox name="is_active" label="Active (can appear in interviews)" defaultChecked={q.is_active} />}
        <div className="flex flex-wrap gap-2">
          <SubmitButton name="intent" value="approve">Save and approve</SubmitButton>
          <SubmitButton name="intent" value="" variant="secondary">Save</SubmitButton>
          <SubmitButton name="intent" value="reject" variant="danger">Reject</SubmitButton>
        </div>
      </Card>
    </form>
  );
}
