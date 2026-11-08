import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, IDS, resetDemo, signedIn, USERS } from "./helpers";

describe("workflows", () => {
  beforeAll(resetDemo);
  afterAll(resetDemo);

  it("authentication rejects a wrong password without revealing whether the email exists", async () => {
    const wrongPassword = await anonClient().auth.signInWithPassword({ email: USERS.clientA, password: "wrong-password" });
    const unknownEmail = await anonClient().auth.signInWithPassword({ email: "nobody@example.com", password: "wrong-password" });
    expect(wrongPassword.error?.message).toBe(unknownEmail.error?.message);
  });

  it("invitation: admin invites, the invitee signs up and joins only that organization", async () => {
    const admin = await signedIn(USERS.admin);
    const email = `invitee-${Date.now()}@example.com`;
    const { data: token, error } = await admin.rpc("create_invitation", { p_org_id: IDS.orgA, p_email: email });
    expect(error).toBeNull();
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const invitee = anonClient();
    const preview = await invitee.rpc("get_invitation", { p_token: token! });
    expect(preview.data?.[0]).toMatchObject({ organization_name: "Northwind Bakery", email });

    const signUp = await invitee.auth.signUp({ email, password: "Invitee!2026" });
    expect(signUp.error).toBeNull();
    expect(signUp.data.session).not.toBeNull(); // email confirmation is off locally

    // Before accepting, the new account has no access at all.
    expect((await invitee.from("projects").select("id")).data).toEqual([]);

    const { data: org, error: acceptError } = await invitee.rpc("accept_invitation", { p_token: token!, p_full_name: "Ivy Invitee" });
    expect(acceptError).toBeNull();
    expect(org).toBe(IDS.orgA);

    const { data: projects } = await invitee.from("projects").select("org_id");
    expect(projects?.length).toBe(2);
    expect(projects?.every((p) => p.org_id === IDS.orgA)).toBe(true);

    // The token is single-use.
    const again = await invitee.rpc("accept_invitation", { p_token: token!, p_full_name: "Again" });
    expect(again.error?.code).toBe("P0002");
  });

  it("onboarding: a client completes a step and the activity feed records who did it", async () => {
    const client = await signedIn(USERS.clientA2);
    const { data: item } = await client
      .from("onboarding_items")
      .select("id, title")
      .is("completed_at", null)
      .order("position")
      .limit(1)
      .single();
    const { error } = await client.rpc("set_onboarding_item_done", { p_item_id: item!.id, p_done: true });
    expect(error).toBeNull();

    const { data: events } = await client
      .from("activity_events")
      .select("kind, summary, actor:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(events?.[0]).toMatchObject({
      kind: "onboarding.completed",
      summary: `Onboarding step "${item!.title}" completed`,
      actor: { full_name: "Tom Becker" },
    });
  });

  it("projects: admin status changes are logged; clients see them but cannot make them", async () => {
    const admin = await signedIn(USERS.admin);
    const { error } = await admin.from("projects").update({ status: "review" }).eq("id", IDS.projectA1);
    expect(error).toBeNull();

    const client = await signedIn(USERS.clientA);
    const { data: events } = await client
      .from("activity_events")
      .select("kind, summary")
      .eq("project_id", IDS.projectA1)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(events?.[0]?.kind).toBe("project.status_changed");

    const attempt = await client.from("projects").update({ status: "completed" }).eq("id", IDS.projectA1).select();
    expect(attempt.data).toEqual([]);
  });

  it("messages: the sender is always the signed-in user", async () => {
    const client = await signedIn(USERS.clientB);
    const { data: me } = await client.auth.getUser();
    const { data, error } = await client.from("messages").insert({ org_id: IDS.orgB, body: "Integration hello" }).select("sender_id").single();
    expect(error).toBeNull();
    expect(data?.sender_id).toBe(me.user!.id);
  });
});
