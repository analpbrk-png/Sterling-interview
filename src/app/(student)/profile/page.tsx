import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitiseResumeContext } from "@/lib/ai/context";
import { Badge, Card, Field, FlashMessage, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import { DocumentSlot } from "@/components/student/document-slot";
import { clearResumeContext, deleteMyData, saveProfile, saveResumeContext } from "../actions";

export const metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await requireUser("/profile");
  const supabase = await createClient();
  const [{ data: profile }, { data: docs }] = await Promise.all([
    supabase.from("student_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("student_documents").select("id, kind, file_name, size_bytes, created_at").eq("user_id", user.id).order("created_at"),
  ]);
  const ctx = sanitiseResumeContext(profile?.resume_context);
  const status: string = profile?.resume_context_status ?? "none";
  const byKind = (k: string) => (docs ?? []).filter((d) => d.kind === k);

  return (
    <>
      <PageHeader title="Your profile" description="Only what is needed to tailor practice questions. You can correct or delete anything here." />
      <FlashMessage searchParams={sp} />

      <div className="grid gap-6">
        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">Personal details</h2>
          <p className="text-sm text-muted mt-1">Your name and student ID are shown only during the introduction step. They are never sent to the AI.</p>
          <form action={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input name="full_name" required maxLength={120} defaultValue={profile?.full_name ?? ""} autoComplete="name" /></Field>
            <Field label="Student ID" hint="As shown on your offer letter or applicant portal."><Input name="student_id" required maxLength={60} defaultValue={profile?.student_id ?? ""} /></Field>
            <Field label="Email"><Input name="email" type="email" required defaultValue={profile?.email ?? user.email} autoComplete="email" /></Field>
            <Field label="Target study country" hint="More countries are coming soon.">
              <Select name="target_country" defaultValue={profile?.target_country ?? "UK"}><option value="UK">United Kingdom</option></Select>
            </Field>
            <Field label="Intake (optional)"><Input name="intake" maxLength={40} placeholder="e.g. September 2027" defaultValue={profile?.intake ?? ""} /></Field>
            <Field label="Previous qualification (optional)"><Input name="previous_qualification" maxLength={200} placeholder="e.g. BCom, Computer Science BSc" defaultValue={profile?.previous_qualification ?? ""} /></Field>
            <div className="sm:col-span-2"><SubmitButton>Save details</SubmitButton></div>
          </form>
        </Card>

        <Card className="p-5 sm:p-6 grid gap-8">
          <div>
            <h2 className="font-semibold">Documents</h2>
            <p className="text-sm text-muted mt-1">Stored privately. Only you can open them.</p>
          </div>
          <DocumentSlot kind="resume" title="CV / résumé" description="PDF or DOCX, up to 5 MB. We read your education, experience, projects and goals." accept=".pdf,.docx" existing={byKind("resume")} />
          <DocumentSlot kind="passport" title="Passport (optional)" description="PDF, JPG or PNG. Stored only for your own reference: it is never read, analysed or sent to any AI service." accept=".pdf,.jpg,.jpeg,.png" existing={byKind("passport")} />
          <DocumentSlot kind="course_document" title="Course documents (optional)" description="Offer letter or course handbook, for your reference. Questions use course facts verified by our team." accept=".pdf,.docx" existing={byKind("course_document")} multiple />
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
            <form action={saveResumeContext} className="mt-5 grid gap-4">
              <Field label="Qualifications" hint="One per line."><Textarea name="qualifications" rows={3} defaultValue={ctx.qualifications.map((q) => [q.title, q.institution, q.year].filter(Boolean).join(", ")).join("\n")} /></Field>
              <Field label="Experience" hint="One role per line."><Textarea name="experience" rows={3} defaultValue={ctx.experience.map((e) => [e.role, e.organisation].filter(Boolean).join(", ")).join("\n")} /></Field>
              <Field label="Projects" hint="One per line."><Textarea name="projects" rows={2} defaultValue={ctx.projects.join("\n")} /></Field>
              <Field label="Skills" hint="Comma separated."><Input name="skills" defaultValue={ctx.skills.join(", ")} /></Field>
              <Field label="Career objective"><Textarea name="career_objective" rows={2} defaultValue={ctx.career_objective ?? ""} /></Field>
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="intent" value="confirm">Confirm and use</SubmitButton>
                <SubmitButton name="intent" value="draft" variant="secondary">Save draft</SubmitButton>
              </div>
            </form>
          )}
          {status !== "none" && (
            <form action={clearResumeContext} className="mt-3"><SubmitButton variant="ghost" pendingText="Removing…">Remove this background</SubmitButton></form>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold text-danger">Delete my account and data</h2>
          <p className="text-sm text-muted mt-1">Permanently removes your profile, documents, applications and session history. This cannot be undone.</p>
          <form action={deleteMyData} className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <Field label="Type DELETE to confirm" className="sm:w-64"><Input name="confirm" autoComplete="off" /></Field>
            <ConfirmSubmit variant="danger" message="Delete your account and all data permanently?">Delete everything</ConfirmSubmit>
          </form>
        </Card>
      </div>
    </>
  );
}
