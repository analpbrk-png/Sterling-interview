import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Opens a document through a 60-second signed URL. Only the owner passes RLS. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("student_documents").select("storage_path, user_id").eq("id", id).maybeSingle();
  if (!doc || doc.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await supabase.storage.from("student-documents").createSignedUrl(doc.storage_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("student_documents").select("id, kind, storage_path, user_id").eq("id", id).maybeSingle();
  if (!doc || doc.user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await supabase.storage.from("student-documents").remove([doc.storage_path]);
  await supabase.from("student_documents").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
