"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";
import { sanitiseResumeContext, type ResumeContext } from "@/lib/ai/context";
import { basicResumeExtract } from "@/lib/ai/resume-basic";
import { extractTextInBrowser } from "@/lib/documents/extract";
import { defaultMix, downloadPrivateFile, saveInvitationProfile, saveInvitationQuestions, type PlannedQuestion } from "@/lib/admin/ops";
import { extractProfileLocally, generateLocally } from "@/lib/local-ai/tasks";
import { MODEL_LABEL } from "@/lib/local-ai/engine";
import { templateQuestions } from "../../../supabase/functions/_shared/template-questions.ts";
import { AiProgress, useAiMode } from "./local-ai";

interface Inv {
  id: string;
  university_id: string;
  course_id: string;
  previous_qualification: string | null;
  resume_context: unknown;
  resume_context_status: string;
  question_count: number | null;
  personal_question_count: number | null;
  course_question_count: number | null;
  bank_question_count: number | null;
  personalised_at: string | null;
  personalised_model: string | null;
}

const lines = (v: string) => v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/**
 * Admin-side personalisation for one interview: read the CV, extract the
 * background and generate personalised + course questions with the free
 * local AI, review/edit/regenerate them, and save them to this interview only.
 */
export function PersonalisePanel({ invitationId, adminId, cv, started, onSaved }: {
  invitationId: string;
  adminId: string;
  cv: { storage_path: string; file_name: string; mime_type: string } | null;
  started: boolean;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const { mode, support } = useAiMode();
  const [inv, setInv] = useState<Inv | null>(null);
  const [course, setCourse] = useState<{ name: string; modules: string[]; is_verified: boolean; university: string; country: string; facts: string[] } | null>(null);
  const [profile, setProfile] = useState<ResumeContext | null>(null);
  const [pq, setPq] = useState("");
  const [draft, setDraft] = useState<PlannedQuestion[] | null>(null);
  const [saved, setSaved] = useState<Array<{ id: string; question_text: string; ai_kind: string; review_notes: string | null }>>([]);
  const [bankSample, setBankSample] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [rev, setRev] = useState(0);
  const [rev2, setRev2] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data: i } = await supabase.from("interview_invitations").select("id, university_id, course_id, previous_qualification, resume_context, resume_context_status, question_count, personal_question_count, course_question_count, bank_question_count, personalised_at, personalised_model").eq("id", invitationId).single();
      if (!i) return;
      setInv(i as Inv);
      setProfile(sanitiseResumeContext(i.resume_context));
      setPq(i.previous_qualification ?? "");
      const [{ data: c }, { data: facts }, { data: s }, { data: bank }] = await Promise.all([
        supabase.from("courses").select("name, modules, is_verified, universities(name, country)").eq("id", i.course_id).single(),
        supabase.from("university_course_details").select("content").eq("course_id", i.course_id).eq("is_verified", true),
        supabase.from("question_bank").select("id, question_text, ai_kind, review_notes").eq("invitation_id", invitationId).order("created_at"),
        supabase.from("question_bank").select("question_text").eq("is_active", true).eq("question_type", "question").is("invitation_id", null).limit(40),
      ]);
      if (c) {
        const u = c.universities as unknown as { name: string; country: string };
        setCourse({ name: c.name, modules: c.modules ?? [], is_verified: c.is_verified, university: u.name, country: u.country, facts: (facts ?? []).map((f) => f.content) });
      }
      setSaved(s ?? []);
      setBankSample((bank ?? []).map((b) => b.question_text));
    })();
  }, [invitationId, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = inv?.question_count ?? 15;
  const mix = useMemo(() => {
    const d = defaultMix(total);
    return { personal: inv?.personal_question_count ?? d.personal, course: inv?.course_question_count ?? d.course };
  }, [inv, total]);
  if (!inv || !profile || !course) return <Card className="p-5 sm:p-6"><p className="text-sm text-muted">Loading personalisation…</p></Card>;

  const aiReady = mode.label === "Free Local AI — Active";
  const genBase = {
    profile, previousQualification: pq || null, university: course.university, country: course.country, course: course.name,
    verifiedModules: course.is_verified ? course.modules : [], verifiedFacts: course.facts, avoid: bankSample,
  };

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label); setMsg(null);
    try { const m = await fn(); if (m) setMsg({ tone: "ok", text: m }); }
    catch (e) { setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Something went wrong." }); }
    finally { setBusy(null); }
  }

  const extract = (useAi: boolean) => run("extract", async () => {
    if (!cv) throw new Error("Attach the student's CV first.");
    const file = await downloadPrivateFile(cv.storage_path, cv.file_name, cv.mime_type);
    const text = await extractTextInBrowser(file);
    if (text.replace(/\s/g, "").length < 40) throw new Error("No text could be read from this CV (it may be a scanned image). Type the background below instead.");
    const p = useAi ? await extractProfileLocally(text) : basicResumeExtract(text);
    setProfile(p);
    setRev2((r) => r + 1);
    return useAi ? "Background extracted on this device with the free AI. Check it, then save." : "Background read with basic section detection. Check it, then save.";
  });

  const saveProfile = (form: HTMLFormElement) => run("profile", async () => {
    const f = new FormData(form);
    const p = sanitiseResumeContext({
      ...profile,
      degree_subject: String(f.get("degree_subject") ?? "").trim() || null,
      qualifications: lines(String(f.get("qualifications") ?? "")).map((title) => ({ title })),
      experience: lines(String(f.get("experience") ?? "")).map((role) => ({ role })),
      projects: lines(String(f.get("projects") ?? "")),
      skills: String(f.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      academic_interests: String(f.get("academic_interests") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      career_objective: String(f.get("career_objective") ?? "").trim() || null,
      education_gap: String(f.get("education_gap") ?? "").trim() || null,
    });
    const newPq = String(f.get("previous_qualification") ?? "").trim() || null;
    await saveInvitationProfile(inv.id, p, newPq, null);
    setProfile(p); setPq(newPq ?? "");
    return "Background saved.";
  });

  const generateAll = () => run("generate", async () => {
    const personal = mix.personal ? await generateLocally({ ...genBase, kind: "personal", count: mix.personal }) : { accepted: [], rejected: 0 };
    const courseQs = mix.course ? await generateLocally({ ...genBase, kind: "course", count: mix.course, siblings: personal.accepted.map((p) => p.question) }) : { accepted: [], rejected: 0 };
    const all = [...personal.accepted, ...courseQs.accepted];
    setDraft(all);
    const short = mix.personal + mix.course - all.length;
    return `Generated ${all.length} question(s) on this device${personal.rejected + courseQs.rejected ? ` (${personal.rejected + courseQs.rejected} rejected by the quality checks)` : ""}.${short > 0 ? ` ${short} short: regenerate, or the bank fills the gap.` : ""} Review, then save.`;
  });

  const regenerateOne = (i: number) => run(`one-${i}`, async () => {
    if (!draft) return;
    const q = draft[i];
    const r = await generateLocally({ ...genBase, kind: q.kind, count: 1, avoid: [...bankSample, ...draft.map((d) => d.question)], siblings: draft.filter((_, j) => j !== i).map((d) => d.question) });
    if (!r.accepted.length) throw new Error("No valid replacement was produced. Try again.");
    setDraft(draft.map((d, j) => (j === i ? r.accepted[0] : d)));
  });

  const saveQuestions = () => run("save", async () => {
    if (!draft) return;
    const cleaned = draft.map((d) => ({ ...d, question: d.question.trim() })).filter((d) => d.question.length > 10 && d.question.endsWith("?"));
    await saveInvitationQuestions(inv.id, inv.university_id, inv.course_id, course.country, cleaned, MODEL_LABEL, adminId);
    setDraft(null); setRev((r) => r + 1); onSaved();
    return `${cleaned.length} personalised question(s) saved to this interview only.`;
  });

  const templates = templateQuestions(profile, pq || null, course.name, mix.personal);

  return (
    <Card className="p-5 sm:p-6 grid gap-5" id="personalise">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">Personalised questions</h2>
        <Badge tone={mode.tone}>AI Mode: {mode.label}</Badge>
        {inv.personalised_at && <Badge tone="ok">Saved</Badge>}
      </div>
      <p className="text-sm text-muted">
        This interview: {total} questions = about {Math.max(0, total - mix.personal - mix.course)} from the PDF question bank, {mix.personal} personalised from the CV, {mix.course} about {course.name}.
        {started && " The student has already started; changes apply to their next attempt."}
      </p>
      {!aiReady && (
        <Notice tone="warn">
          {support && !support.ok ? `Free local AI is unavailable on this device: ${support.reason}` : "Free local AI has not been tested on this device yet (Settings → Test Free AI)."}{" "}
          Without saved AI questions, this interview uses the PDF question bank plus template questions built from the background below (labelled as templates, not AI).
        </Notice>
      )}
      <AiProgress />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {/* 1. Background */}
      <form key={`${rev}-${rev2}`} onSubmit={(e) => { e.preventDefault(); void saveProfile(e.currentTarget); }} className="grid gap-3 rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-sm">1. Student background</p>
          <span className="text-xs text-muted">{inv.resume_context_status === "confirmed" ? "saved" : inv.resume_context_status === "draft" ? "extracted, not yet reviewed" : "empty"}</span>
        </div>
        {cv ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={!!busy || !aiReady} onClick={() => void extract(true)}>{busy === "extract" ? "Reading CV…" : "Extract from CV with free AI"}</Button>
            <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void extract(false)}>Read CV without AI</Button>
          </div>
        ) : <p className="text-xs text-muted">No CV attached. Attach one (right) or type the background.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Previous qualification"><Input name="previous_qualification" defaultValue={pq} maxLength={200} /></Field>
          <Field label="Degree subject"><Input name="degree_subject" defaultValue={profile.degree_subject ?? ""} /></Field>
          <Field label="Qualifications" hint="One per line."><Textarea name="qualifications" rows={2} defaultValue={profile.qualifications.map((q) => q.title).join("\n")} /></Field>
          <Field label="Experience" hint="One role per line."><Textarea name="experience" rows={2} defaultValue={profile.experience.map((e) => [e.role, e.organisation].filter(Boolean).join(", ")).join("\n")} /></Field>
          <Field label="Projects" hint="One per line."><Textarea name="projects" rows={2} defaultValue={profile.projects.join("\n")} /></Field>
          <Field label="Skills" hint="Comma separated."><Input name="skills" defaultValue={profile.skills.join(", ")} /></Field>
          <Field label="Academic interests" hint="Comma separated."><Input name="academic_interests" defaultValue={(profile.academic_interests ?? []).join(", ")} /></Field>
          <Field label="Career goal"><Input name="career_objective" defaultValue={profile.career_objective ?? ""} /></Field>
          <Field label="Education gap (only if stated in the CV)" className="sm:col-span-2"><Input name="education_gap" defaultValue={profile.education_gap ?? ""} /></Field>
        </div>
        <div><Button type="submit" variant="secondary" disabled={!!busy}>Save background</Button></div>
      </form>

      {/* 2. Questions */}
      <div className="grid gap-3 rounded-xl border border-line p-4">
        <p className="font-medium text-sm">2. Generate with free AI</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!!busy || !aiReady} onClick={() => void generateAll()}>{busy === "generate" ? "Generating on this device…" : saved.length ? "Regenerate questions" : "Generate questions"}</Button>
          {draft && <Button type="button" variant="secondary" disabled={!!busy} onClick={() => void saveQuestions()}>{busy === "save" ? "Saving…" : `Save ${draft.length} question(s) to this interview`}</Button>}
          {draft && <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setDraft(null)}>Discard draft</Button>}
        </div>
        {draft && (
          <ul className="grid gap-2">
            {draft.map((q, i) => (
              <li key={i} className="rounded-xl border border-line p-3 grid gap-2">
                <div className="flex gap-2 items-center"><Badge tone={q.kind === "personal" ? "accent" : "neutral"}>{q.kind === "personal" ? "personalised" : "course"}</Badge><span className="text-xs text-muted truncate">Based on: {q.basedOn}</span></div>
                <Textarea rows={2} value={q.question} onChange={(e) => setDraft(draft.map((d, j) => (j === i ? { ...d, question: e.target.value } : d)))} aria-label={`Question ${i + 1}`} />
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" className="h-8 px-2.5 text-xs" disabled={!!busy} onClick={() => void regenerateOne(i)}>{busy === `one-${i}` ? "Regenerating…" : "Regenerate"}</Button>
                  <Button type="button" variant="ghost" className="h-8 px-2.5 text-xs" disabled={!!busy} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!draft && saved.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs text-muted">Saved for this interview ({inv.personalised_model ?? "free local AI"}{inv.personalised_at ? `, ${new Date(inv.personalised_at).toLocaleString("en-GB")}` : ""}):</p>
            <ul className="grid gap-1.5">{saved.map((s) => <li key={s.id} className="text-sm"><Badge tone={s.ai_kind === "personal" ? "accent" : "neutral"}>{s.ai_kind === "personal" ? "personalised" : "course"}</Badge> <span className="ml-1">{s.question_text}</span></li>)}</ul>
          </div>
        )}
        {!draft && !saved.length && templates.length > 0 && (
          <div className="grid gap-1.5">
            <p className="text-xs text-muted">Without AI questions, these <strong>template</strong> questions (not AI) will be used from the background above:</p>
            <ul className="grid gap-1 text-sm text-ink-2">{templates.map((t, i) => <li key={i}>• {t.question}</li>)}</ul>
          </div>
        )}
      </div>
    </Card>
  );
}
