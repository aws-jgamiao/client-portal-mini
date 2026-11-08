import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, IDS, resetDemo, signedIn, USERS, type Client } from "./helpers";

const BUCKET = "portal-documents";

describe("tenant isolation over the real API", () => {
  let clientA: Client;
  let clientB: Client;

  beforeAll(async () => {
    await resetDemo();
    [clientA, clientB] = await Promise.all([signedIn(USERS.clientA), signedIn(USERS.clientB)]);
  });

  afterAll(async () => {
    await resetDemo();
  });

  describe("reads", () => {
    it("Client A gets nothing when requesting Client B's project by id", async () => {
      const { data, error } = await clientA.from("projects").select("*").eq("id", IDS.projectB1);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("a hidden record and a non-existent record look identical", async () => {
      const hidden = await clientA.from("projects").select("*").eq("id", IDS.projectB1).maybeSingle();
      const missing = await clientA.from("projects").select("*").eq("id", "00000000-0000-4000-8000-000000000000").maybeSingle();
      expect(hidden).toMatchObject({ data: null, error: null, status: missing.status });
    });

    it("an unfiltered select only returns the caller's own organization", async () => {
      const { data } = await clientA.from("projects").select("org_id");
      expect(data?.length).toBeGreaterThan(0);
      expect(new Set(data?.map((p) => p.org_id))).toEqual(new Set([IDS.orgA]));
    });

    it("Client B cannot read Client A's messages, documents or activity", async () => {
      for (const table of ["messages", "documents", "activity_events", "onboarding_items"] as const) {
        const { data } = await clientB.from(table).select("org_id").eq("org_id", IDS.orgA);
        expect(data, table).toEqual([]);
      }
    });

    it("clients don't see internal documents, even in their own organization", async () => {
      const { data } = await clientA.from("documents").select("id");
      const ids = data?.map((d) => d.id);
      expect(ids).toContain(IDS.docA1);
      expect(ids).not.toContain(IDS.docAInternal);
    });
  });

  describe("writes", () => {
    it("update by id swap affects zero rows", async () => {
      const { data, error } = await clientA.from("projects").update({ name: "pwned" }).eq("id", IDS.projectB1).select();
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("delete by id swap affects zero rows", async () => {
      const { data } = await clientA.from("documents").delete().eq("id", IDS.docB1).select();
      expect(data).toEqual([]);
      const admin = await signedIn(USERS.admin);
      const { data: still } = await admin.from("documents").select("id").eq("id", IDS.docB1);
      expect(still).toHaveLength(1);
    });

    it("insert into another organization is rejected by RLS", async () => {
      const { error } = await clientA.from("messages").insert({ org_id: IDS.orgB, body: "hi from A" });
      expect(error?.code).toBe("42501");
    });

    it("clients cannot escalate their role or switch organization", async () => {
      const { data: me } = await clientA.auth.getUser();
      const role = await clientA.from("profiles").update({ role: "admin" }).eq("id", me.user!.id);
      const org = await clientA.from("profiles").update({ org_id: IDS.orgB }).eq("id", me.user!.id);
      expect(role.error?.code).toBe("42501");
      expect(org.error?.code).toBe("42501");
    });

    it("RPCs report another org's onboarding item as not found", async () => {
      const admin = await signedIn(USERS.admin);
      const { data: item } = await admin.from("onboarding_items").select("id").eq("org_id", IDS.orgB).limit(1).single();
      const { error } = await clientA.rpc("set_onboarding_item_done", { p_item_id: item!.id, p_done: true });
      expect(error?.code).toBe("P0002");
    });
  });

  describe("file permissions", () => {
    const pathB = `${IDS.orgB}/${IDS.docB1}`;
    const pathA = `${IDS.orgA}/${IDS.docA1}`;
    const pathAInternal = `${IDS.orgA}/${IDS.docAInternal}`;

    it("Client A can download its own shared file", async () => {
      const { data, error } = await clientA.storage.from(BUCKET).download(pathA);
      expect(error).toBeNull();
      expect(await data!.text()).toMatch(/^%PDF/);
    });

    it("Client A cannot download, sign or list Client B's files", async () => {
      expect((await clientA.storage.from(BUCKET).download(pathB)).data).toBeNull();
      expect((await clientA.storage.from(BUCKET).createSignedUrl(pathB, 60)).data).toBeNull();
      expect((await clientA.storage.from(BUCKET).list(IDS.orgB)).data ?? []).toEqual([]);
    });

    it("clients cannot fetch internal files by guessing the path", async () => {
      expect((await clientA.storage.from(BUCKET).download(pathAInternal)).data).toBeNull();
    });

    it("clients cannot upload files", async () => {
      const { error } = await clientA.storage.from(BUCKET).upload(`${IDS.orgA}/sneaky`, new Blob(["x"], { type: "text/plain" }));
      expect(error).not.toBeNull();
    });

    it("the bucket rejects disallowed file types even for admins", async () => {
      const admin = await signedIn(USERS.admin);
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(`${IDS.orgA}/malware-test`, new Blob(["<html></html>"], { type: "text/html" }), { contentType: "text/html" });
      expect(error).not.toBeNull();
    });
  });

  describe("unauthenticated access", () => {
    it("anonymous requests cannot read any portal table", async () => {
      const { data, error } = await anonClient().from("projects").select("*");
      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    });

    it("anonymous requests cannot download files", async () => {
      const { data } = await anonClient().storage.from(BUCKET).download(`${IDS.orgA}/${IDS.docA1}`);
      expect(data).toBeNull();
    });
  });
});
