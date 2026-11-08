import { describe, expect, it } from "vitest";
import {
  acceptInviteSchema,
  createProjectSchema,
  inviteSchema,
  messageSchema,
  onboardingItemSchema,
  organizationSchema,
  profileSchema,
  resetPasswordSchema,
} from "./schemas";

const ORG = "a0000000-0000-4000-8000-00000000000a";

describe("project validation", () => {
  const base = { orgId: ORG, name: "Website", description: "", status: "planning", startDate: "", dueDate: "" };

  it("normalises empty dates to null", () => {
    const r = createProjectSchema.parse(base);
    expect(r.startDate).toBeNull();
    expect(r.dueDate).toBeNull();
  });

  it("rejects a due date before the start date", () => {
    const r = createProjectSchema.safeParse({ ...base, startDate: "2026-12-01", dueDate: "2026-11-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["dueDate"]);
  });

  it("rejects unknown statuses and malformed org ids", () => {
    expect(createProjectSchema.safeParse({ ...base, status: "deleted" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...base, orgId: "1 OR 1=1" }).success).toBe(false);
  });

  it("trims and bounds the name", () => {
    expect(createProjectSchema.safeParse({ ...base, name: "  x " }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...base, name: "a".repeat(121) }).success).toBe(false);
  });
});

describe("other schemas", () => {
  it("lower-cases invitation emails", () => {
    expect(inviteSchema.parse({ orgId: ORG, email: "  New.Person@Example.COM " }).email).toBe("new.person@example.com");
  });

  it("only accepts 64-character hex invitation tokens", () => {
    const ok = { token: "a".repeat(64), fullName: "Sam", password: "longenough" };
    expect(acceptInviteSchema.safeParse(ok).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ ...ok, token: "../../admin" }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
  });

  it("rejects whitespace-only messages", () => {
    expect(messageSchema.safeParse({ orgId: ORG, body: "   " }).success).toBe(false);
    expect(messageSchema.parse({ orgId: ORG, body: "  hi  " }).body).toBe("hi");
  });

  it("validates slugs", () => {
    expect(organizationSchema.safeParse({ name: "Acme", slug: "acme-co" }).success).toBe(true);
    expect(organizationSchema.safeParse({ name: "Acme", slug: "Acme Co" }).data?.slug).toBeUndefined();
    expect(organizationSchema.safeParse({ name: "Acme", slug: "acme--co" }).success).toBe(false);
  });

  it("treats the onboarding checkbox as a boolean", () => {
    expect(onboardingItemSchema.parse({ orgId: ORG, title: "Sign", required: "on" }).required).toBe(true);
    expect(onboardingItemSchema.parse({ orgId: ORG, title: "Sign" }).required).toBe(false);
  });

  it("validates optional phone numbers", () => {
    expect(profileSchema.parse({ fullName: "Sam", phone: "" }).phone).toBeNull();
    expect(profileSchema.safeParse({ fullName: "Sam", phone: "<script>" }).success).toBe(false);
  });

  it("requires matching passwords", () => {
    const r = resetPasswordSchema.safeParse({ password: "abcdefgh", confirm: "abcdefgx" });
    expect(r.error?.issues[0]?.path).toEqual(["confirm"]);
  });
});
