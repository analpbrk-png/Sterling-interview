"use client";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { sanitiseResumeContext } from "@/lib/ai/context";
import { useLoad, maybe, must } from "@/lib/use-load";
import { fstr, useAction } from "@/lib/use-action";
import { setFlash, useFlash } from "@/lib/flash";
import { Badge, Button, Card, Field, FlashBar, Input, LoadError, Loading, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { DocumentSlot, type DocSummary } from "@/components/student/document-slot";

const ProfileSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name").max(120),
  student_id: z.string().trim().min(1, "Enter your student ID").max(60),
  email: z.string().trim().email("Enter a valid email").max(200),
  target_country: z.enum(["UK"]),
  intake: z.string().trim().max(40).transform((v) => v || null),
  previous_qualification: z.string().trim().max(200).transform((v) => v || null),
});

const lines = (v: string) => v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [pageFlash] = useFlash();
  const { run, busy, flash, setFlash: setLocal } = useAction();
  const supabase = createClient();
  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, docs] = await Promise.all([
      supabase.from("student_profiles").select("*").eq("user_id", user!.id).maybeSingle(),
      supabase.from("student_documents").select("id, kind, file_name, size_bytes, created_at, storage_path").eq("user_id", user!.id).order("created_at"),
    ]);
    return { profile: maybe(profile), docs: must(docs) as (DocSummary & { kind: string })[] };
  }, [user?.id]);

  if (loading && !data) return <Loading />;
  if (error || !data || !user) return <LoadError error={error ?? "Not found"} onRetry={reload} />;
  const { profile, docs } = data;
  const ctx = sanitiseResumeContext(profile?.resume_context);
  const status: string = profile?.resume_context_status ?? "none";
  const byKind = (k: string) => docs.filter((d) => d.kind === k);

  const saveProfile = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      const parsed = ProfileSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { error } = await supabase.from("student_profiles").upsert({ user_id: user.id, ...parsed.data });
      if (error) throw new Error("Could not save your profile. Please try again.");
      const { count } = await supabase.from("student_applications").select("id", { count: "exact", head: true });
      if (!count) {
        setFlash({ tone: "ok", text: "Profile saved. Now add the university and course you are applying to." });
        router.push("/applications/");
        return;
      }
      await reload();
      return "Profile saved.";
    });
  };

  const saveContext = (intent: "confirm" | "draft") => (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = new FormData(e.currentTarget.form!);
    void run(async () => {
      const context = sanitiseResumeContext({
        qualifications: lines(fstr(form, "qualifications")).map((title) => ({ title })),
        experience: lines(fstr(form, "experience")).map((role) => ({ role })),
        projects: lines(fstr(form, "projects")),
        skills: fstr(form, "skills").split(",").map((s) => s.trim()).filter(Boolean),
        career_objective: fstr(form, "career_objective") || null,
      });
      const { error } = await supabase.from("student_profiles")
        .update({ resume_context: context, resume_context_status: intent === "confirm" ? "confirmed" : "draft" })
        .eq("user_id", user.id);
      if (error) throw new Error("Save your profile details first, then review your CV context.");
      await reload();
      return intent === "confirm" ? "CV context confirmed. It will be used to personalise questions." : "Draft saved.";
    });
  };

  const clearContext = () => void run(async () => {
    await supabase.from("student_profiles").update({ resume_context: {}, resume_context_status: "none", resume_extraction_mode: null }).eq("user_id", user.id);
    await reload();
    return "CV context removed.";
  });

  const deleteEverything = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const confirmText = fstr(new FormData(e.currentTarget), "confirm");
    if (confirmText !== "DELETE") { setLocal({ tone: "danger", text: "Type DELETE to confirm." }); return; }
    if (!window.confirm("Delete your account and all data permanently? This cannot be undone.")) return;
    void run(async () => {
      if (docs.length) await supabase.storage.from("student-documents").remove(docs.map((d) => d.storage_path));
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw new Error("Could not delete your account. Please contact support.");
      await signOut();
    });
  };

  return (
    <>
      <PageHeader title="Your profile" description="Only what is needed to tailor practice questions. You can correct or delete anything here." />
      <FlashBar flash={flash ?? pageFlash} />

      <div className="grid gap-6">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Personal details</h2>
          <p className="text-sm text-muted mt-1">Your name and student ID are shown only during the introduction step. They are never sent to the AI.</p>
          <form onSubmit={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input name="full_name" required maxLength={120} defaultValue={profile?.full_name ?? ""} autoComplete="name" /></Field>
            <Field label="Student ID" hint="As shown on your offer letter or applicant portal."><Input name="student_id" required maxLength={60} defaultValue={profile?.student_id ?? ""} /></Field>
            <Field label="Email"><Input name="email" type="email" required defaultValue={profile?.email ?? user.email} autoComplete="email" /></Field>
            <Field label="Target study country" hint="More countries are coming soon.">
              <Select name="target_country" defaultValue={profile?.target_country ?? "UK"}><option value="UK">United Kingdom</option></Select>
            </Field>
            <Field label="Intake (optional)"><Input name="intake" maxLength={40} placeholder="e.g. September 2027" defaultValue={profile?.intake ?? ""} /></Field>
            <Field label="Previous qualification (optional)"><Input name="previous_qualification" maxLength={200} placeholder="e.g. BCom, Computer Science BSc" defaultValue={profile?.previous_qualification ?? ""} /></Field>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</Button></div>
          </form>
        </Card>

        <Card className="p-5 sm:p-6 grid gap-8">
          <div>
            <h2 className="font-semibold">Documents</h2>
            <p className="text-sm text-muted mt-1">Stored privately. Only you can open them.</p>
          </div>
          <DocumentSlot userId={user.id} onChange={reload} kind="resume" title="CV / résumé" description="PDF or DOCX, up to 5 MB. Read on your device; only redacted text is used to extract your education, experience, projects and goals." accept=".pdf,.docx" existing={byKind("resume")} />
          <DocumentSlot userId={user.id} onChange={reload} kind="passport" title="Passport (optional)" description="PDF, JPG or PNG. Stored only for your own reference: it is never read, analysed or sent to any AI service." accept=".pdf,.jpg,.jpeg,.png" existing={byKind("passport")} />
          <DocumentSlot userId={user.id} onChange={reload} kind="course_document" title="Course documents (optional)" description="Offer letter or course handbook, for your reference. Questions use course facts verified by our team." accept=".pdf,.docx" existing={byKind("course_document")} multiple />
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Background used for personalisation</h2>
            {status === "confirmed" && <Badge tone="ok">Confirmed</Badge>}
            {status === "draft" && <Badge tone="warn">Needs your review</Badge>}
            {profile?.resume_extraction_mode && <Badge>{profile.resume_extraction_mode === "ai" ? "AI extracted" : "Basic extraction"}</Badge>}
          </div>
          <p className="text-sm text-muted mt-1">Check this carefully. Only confirmed details are used to tailor your questions.</p>
          {!profile && <div className="mt-4"><Notice tone="warn">Save your personal details first.</Notice></div>}
          {profile && (
            <form key={JSON.stringify(ctx)} onSubmit={(e) => e.preventDefault()} className="mt-5 grid gap-4">
              <Field label="Qualifications" hint="One per line."><Textarea name="qualifications" rows={3} defaultValue={ctx.qualifications.map((q) => [q.title, q.institution && !q.title.includes(q.institution) ? q.institution : null, q.year && !q.title.includes(q.year) ? q.year : null].filter(Boolean).join(", ")).join("\n")} /></Field>
              <Field label="Experience" hint="One role per line."><Textarea name="experience" rows={3} defaultValue={ctx.experience.map((e) => [e.role, e.organisation].filter(Boolean).join(", ")).join("\n")} /></Field>
              <Field label="Projects" hint="One per line."><Textarea name="projects" rows={2} defaultValue={ctx.projects.join("\n")} /></Field>
              <Field label="Skills" hint="Comma separated."><Input name="skills" defaultValue={ctx.skills.join(", ")} /></Field>
              <Field label="Career objective"><Textarea name="career_objective" rows={2} defaultValue={ctx.career_objective ?? ""} /></Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={saveContext("confirm")}>Confirm and use</Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={saveContext("draft")}>Save draft</Button>
                {status !== "none" && <Button type="button" variant="ghost" disabled={busy} onClick={clearContext}>Remove this background</Button>}
              </div>
            </form>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-danger">Delete my account and data</h2>
          <p className="text-sm text-muted mt-1">Permanently removes your profile, documents, applications and session history. This cannot be undone.</p>
          <form onSubmit={deleteEverything} className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <Field label="Type DELETE to confirm" className="sm:w-64"><Input name="confirm" autoComplete="off" /></Field>
            <Button type="submit" variant="danger" disabled={busy}>Delete everything</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
