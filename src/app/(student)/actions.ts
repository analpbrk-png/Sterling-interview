"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitiseResumeContext } from "@/lib/ai/context";

const back = (path: string, msg: { saved?: string; error?: string }) => {
  const q = new URLSearchParams(msg as Record<string, string>).toString();
  redirect(`${path}?${q}`);
};

const ProfileSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your full name").max(120),
  student_id: z.string().trim().min(1, "Enter your student ID").max(60),
  email: z.string().trim().email("Enter a valid email").max(200),
  target_country: z.enum(["UK"]),
  intake: z.string().trim().max(40).optional().transform((v) => v || null),
  previous_qualification: z.string().trim().max(200).optional().transform((v) => v || null),
});

export async function saveProfile(form: FormData) {
  const user = await requireUser();
  const parsed = ProfileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) back("/profile", { error: parsed.error.issues[0].message });
  const supabase = await createClient();
  const { error } = await supabase.from("student_profiles").upsert({ user_id: user.id, ...parsed.data! });
  if (error) back("/profile", { error: "Could not save your profile. Please try again." });
  const { count } = await supabase.from("student_applications").select("id", { count: "exact", head: true });
  revalidatePath("/", "layout");
  if (!count) redirect("/applications?saved=" + encodeURIComponent("Profile saved. Now add the university and course you are applying to."));
  back("/profile", { saved: "Profile saved." });
}

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** Saves the student's edited CV context. "confirm" marks it ready for personalisation. */
export async function saveResumeContext(form: FormData) {
  const user = await requireUser();
  const confirm = form.get("intent") === "confirm";
  const context = sanitiseResumeContext({
    qualifications: lines(form.get("qualifications")).map((title) => ({ title })),
    experience: lines(form.get("experience")).map((role) => ({ role })),
    projects: lines(form.get("projects")),
    skills: String(form.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    career_objective: String(form.get("career_objective") ?? "").trim() || null,
  });
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_profiles")
    .update({ resume_context: context, resume_context_status: confirm ? "confirmed" : "draft" })
    .eq("user_id", user.id);
  if (error) back("/profile", { error: "Save your profile details first, then review your CV context." });
  revalidatePath("/profile");
  back("/profile", { saved: confirm ? "CV context confirmed. It will be used to personalise questions." : "Draft saved." });
}

export async function clearResumeContext() {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("student_profiles")
    .update({ resume_context: {}, resume_context_status: "none", resume_extraction_mode: null })
    .eq("user_id", user.id);
  back("/profile", { saved: "CV context removed." });
}

const AppSchema = z.object({
  university_id: z.string().uuid("Choose a university"),
  course_id: z.string().uuid("Choose a course"),
  intake: z.string().trim().max(40).optional().transform((v) => v || null),
});

export async function addApplication(form: FormData) {
  const user = await requireUser();
  const parsed = AppSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) back("/applications", { error: parsed.error.issues[0].message });
  const supabase = await createClient();
  const { error } = await supabase.from("student_applications").insert({ user_id: user.id, ...parsed.data! });
  if (error) {
    back("/applications", {
      error: error.code === "23505" ? "You have already added this course." : "That course does not belong to the chosen university.",
    });
  }
  revalidatePath("/applications");
  back("/applications", { saved: "Application added." });
}

export async function updateApplicationIntake(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const intake = String(form.get("intake") ?? "").trim().slice(0, 40) || null;
  const supabase = await createClient();
  await supabase.from("student_applications").update({ intake }).eq("id", id).eq("user_id", user.id);
  back("/applications", { saved: "Application updated." });
}

export async function removeApplication(form: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("student_applications").delete().eq("id", id).eq("user_id", user.id);
  if (error) back("/applications", { error: "Could not remove the application." });
  revalidatePath("/applications");
  back("/applications", { saved: "Application removed. Its past session summaries remain in your history." });
}

/** Permanently deletes the student's account, files and records. */
export async function deleteMyData(form: FormData) {
  const user = await requireUser();
  if (form.get("confirm") !== "DELETE") back("/profile", { error: "Type DELETE to confirm." });
  const supabase = await createClient();
  const { data: docs } = await supabase.from("student_documents").select("storage_path");
  if (docs?.length) await supabase.storage.from("student-documents").remove(docs.map((d) => d.storage_path));
  // Removing the auth user cascades to every table that references it.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) back("/profile", { error: "Could not delete your account. Please contact support." });
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
