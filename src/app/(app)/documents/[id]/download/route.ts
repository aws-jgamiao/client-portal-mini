import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/demo-storage";
import { uuid } from "@/lib/validation/schemas";

/**
 * Issues a 60-second signed URL for a document and redirects to it.
 * Two independent checks run as the signed-in user:
 *   1. the documents row must be visible under RLS (tenant + visibility), and
 *   2. Storage's own RLS policy must allow reading the object.
 * Every failure returns the same 404, whether the document belongs to another
 * client, is internal, or doesn't exist.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/documents/[id]/download">) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const id = uuid.safeParse((await ctx.params).id);
  if (!id.success) return notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return notFound();

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, file_name")
    .eq("id", id.data)
    .maybeSingle();
  if (!doc) return notFound();

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !signed) return notFound();

  const response = NextResponse.redirect(signed.signedUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
