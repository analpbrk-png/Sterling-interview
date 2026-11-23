"use client";
import { useMemo, useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/submit-button";

export function ApplicationForm({ action, universities, courses }: {
  action: (form: FormData) => Promise<void>;
  universities: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string; university_id: string }>;
}) {
  const [uni, setUni] = useState("");
  const options = useMemo(() => courses.filter((c) => c.university_id === uni), [courses, uni]);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
      <Field label="University">
        <Select name="university_id" required value={uni} onChange={(e) => setUni(e.target.value)}>
          <option value="" disabled>Choose…</option>
          {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Course">
        <Select name="course_id" required defaultValue="" key={uni} disabled={!uni}>
          <option value="" disabled>{uni ? (options.length ? "Choose…" : "No courses yet") : "Choose a university first"}</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Intake (optional)"><Input name="intake" maxLength={40} placeholder="Sep 2027" /></Field>
      <SubmitButton pendingText="Adding…">Add</SubmitButton>
    </form>
  );
}
