import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/form";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseOrgFilter } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { sendMessage } from "./actions";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const member = await requireMember();
  const isAdmin = member.role === "admin";
  const supabase = await createClient();

  // Admin inbox: one row per client with its latest message.
  const { data: orgs } = isAdmin
    ? await supabase
        .from("organizations")
        .select("id, name, messages(body, created_at)")
        .order("created_at", { referencedTable: "messages", ascending: false })
        .limit(1, { referencedTable: "messages" })
        .order("name")
    : { data: null };

  const orgId = isAdmin ? (parseOrgFilter((await searchParams).org) ?? orgs?.[0]?.id ?? null) : member.orgId;
  const orgName = isAdmin ? orgs?.find((o) => o.id === orgId)?.name : member.orgName;

  const { data: thread } = orgId
    ? await supabase
        .from("messages")
        .select("id, body, created_at, sender_id, sender:profiles(full_name, role, job_title)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [] };

  return (
    <>
      <PageHeader
        title="Messages"
        description={isAdmin ? "Conversations with each client." : "Talk to your account manager. Everyone at your organization can see this thread."}
      />
      <div className={isAdmin ? "grid gap-6 lg:grid-cols-[18rem_1fr]" : ""}>
        {isAdmin && (
          <nav aria-label="Client conversations" className="card h-fit p-2">
            <ul>
              {(orgs ?? []).map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/messages?org=${o.id}`}
                    aria-current={o.id === orgId ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2.5 ${o.id === orgId ? "bg-brand-soft" : "hover:bg-canvas"}`}
                  >
                    <span className="block font-medium text-ink">{o.name}</span>
                    <span className="block truncate text-sm text-ink-muted">{o.messages[0]?.body ?? "No messages yet"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <Card title={orgName ?? "Conversation"}>
          {!thread?.length ? (
            <EmptyState title="No messages yet">Start the conversation below.</EmptyState>
          ) : (
            <ol className="space-y-5" aria-label="Messages, oldest first">
              {thread.map((m) => {
                const mine = m.sender_id === member.id;
                const name = m.sender?.full_name ?? "Former member";
                return (
                  <li key={m.id} className={`flex gap-3 ${mine ? "flex-row-reverse text-right" : ""}`}>
                    <Avatar name={name} size="sm" />
                    <div className={`max-w-[85%] sm:max-w-[75%] ${mine ? "items-end" : ""}`}>
                      <p className="text-xs text-ink-muted">
                        <span className="font-medium text-ink">{mine ? "You" : name}</span>
                        {m.sender?.role === "admin" && !mine && " · Agency"} ·{" "}
                        <time dateTime={m.created_at}>{formatDateTime(m.created_at)}</time>
                      </p>
                      <p
                        className={`mt-1 inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-[0.9375rem] ${
                          mine ? "bg-brand text-white" : "bg-canvas text-ink"
                        }`}
                      >
                        {m.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {orgId && (
            <ActionForm action={sendMessage} resetOnSuccess showSuccess={false} className="mt-6 border-t border-line pt-5">
              <input type="hidden" name="orgId" value={orgId} />
              <TextAreaField name="body" label="Write a message" maxLength={4000} rows={3} />
              <div className="mt-3 flex justify-end">
                <SubmitButton pendingText="Sending…">Send</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
