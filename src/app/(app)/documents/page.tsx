import type { Metadata } from "next";
import Link from "next/link";
import { OrgSwitcher } from "@/components/org-switcher";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listOrganizations, parseOrgFilter } from "@/lib/data";
import { formatBytes, formatDateTime } from "@/lib/format";
import { ALLOWED_TYPES, type AllowedMime } from "@/lib/validation/files";
import { deleteDocument, setDocumentVisibility } from "./actions";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const member = await requireMember();
  const isAdmin = member.role === "admin";
  const supabase = await createClient();

  const organizations = isAdmin ? await listOrganizations(supabase) : [];
  const orgId = isAdmin ? (parseOrgFilter((await searchParams).org) ?? organizations[0]?.id ?? null) : member.orgId;

  const [{ data: documents }, { data: projects }] = orgId
    ? await Promise.all([
        supabase
          .from("documents")
          .select("id, file_name, mime_type, size_bytes, visibility, created_at, project:projects(id, name), uploader:profiles!documents_uploaded_by_fkey(full_name)")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false }),
        supabase.from("projects").select("id, name").eq("org_id", orgId).order("name"),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <>
      <PageHeader
        title="Documents"
        description={
          isAdmin
            ? "Files are stored privately. Clients only see files marked for them, and download links expire after 60 seconds."
            : "Files your account manager has shared with you."
        }
      />
      {isAdmin && <OrgSwitcher basePath="/documents" organizations={organizations} current={orgId} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
          {!documents?.length ? (
            <EmptyState title="No documents yet">
              {isAdmin ? "Upload the first file for this client." : "Shared files will appear here."}
            </EmptyState>
          ) : (
            <Card bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Documents</caption>
                  <thead className="border-b border-line text-ink-muted">
                    <tr>
                      <th scope="col" className="px-5 py-2.5 font-medium">Name</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Project</th>
                      <th scope="col" className="hidden px-5 py-2.5 font-medium md:table-cell">Added</th>
                      <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {documents.map((d) => (
                      <tr key={d.id}>
                        <th scope="row" className="px-5 py-3 font-normal">
                          <a href={`/documents/${d.id}/download`} className="font-medium text-brand-ink underline underline-offset-4">
                            {d.file_name}
                          </a>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-ink-muted">
                            <span>{ALLOWED_TYPES[d.mime_type as AllowedMime]?.label ?? "File"} · {formatBytes(d.size_bytes)}</span>
                            {isAdmin && d.visibility === "internal" && <Badge tone="warn">Internal</Badge>}
                          </div>
                        </th>
                        <td className="px-5 py-3 text-ink-muted">
                          {d.project ? <Link href={`/projects/${d.project.id}`} className="underline underline-offset-4">{d.project.name}</Link> : "—"}
                        </td>
                        <td className="hidden px-5 py-3 text-ink-muted md:table-cell">
                          {formatDateTime(d.created_at)}
                          {d.uploader && <div>{d.uploader.full_name}</div>}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1">
                            <a href={`/documents/${d.id}/download`} className="inline-flex h-8 items-center rounded-lg px-3 text-sm text-ink-muted hover:bg-line/50">
                              Download<span className="sr-only">: {d.file_name}</span>
                            </a>
                            {isAdmin && (
                              <>
                                <form action={setDocumentVisibility.bind(null, d.id, d.visibility === "client" ? "internal" : "client")}>
                                  <Button type="submit" variant="ghost" size="sm">
                                    {d.visibility === "client" ? "Make internal" : "Share with client"}
                                    <span className="sr-only">: {d.file_name}</span>
                                  </Button>
                                </form>
                                <form action={deleteDocument.bind(null, d.id)}>
                                  <ConfirmSubmit message={`Delete "${d.file_name}"? This can't be undone.`} variant="ghost" size="sm">
                                    Delete<span className="sr-only">: {d.file_name}</span>
                                  </ConfirmSubmit>
                                </form>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
        {isAdmin && orgId && (
          <Card title="Upload a file">
            <UploadForm orgId={orgId} projects={projects ?? []} />
          </Card>
        )}
      </div>
    </>
  );
}
