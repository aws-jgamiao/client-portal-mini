import { describe, expect, it } from "vitest";
import { daysUntil, dueLabel, formatDate, percent } from "./format";
import { dbErrorMessage } from "./action-state";
import { makePdf } from "./seed-files";

describe("daysUntil", () => {
  it("uses the viewer's calendar day, not UTC", () => {
    // 14:00 UTC on 8 Nov is already 01:00 on 9 Nov in Sydney (UTC+11).
    const now = new Date("2026-11-08T14:00:00Z");
    expect(daysUntil("2026-11-09", now)).toBe(0);
    expect(daysUntil("2026-11-08", now)).toBe(-1);
    expect(daysUntil("2026-11-09", now, "UTC")).toBe(1);
  });

  it("is stable across a daylight-saving change", () => {
    // Sydney moves to daylight time on 4 Oct 2026.
    expect(daysUntil("2026-10-10", new Date("2026-10-01T00:00:00Z"))).toBe(9);
  });
});

describe("dueLabel", () => {
  const now = new Date("2026-11-08T00:00:00Z"); // 8 Nov, 11:00 in Sydney
  it("describes overdue, today, soon and later", () => {
    expect(dueLabel("2026-11-06", false, now)).toEqual({ text: "Overdue by 2 days", tone: "danger" });
    expect(dueLabel("2026-11-07", false, now).text).toBe("Overdue by 1 day");
    expect(dueLabel("2026-11-08", false, now)).toEqual({ text: "Due today", tone: "warn" });
    expect(dueLabel("2026-11-09", false, now).text).toBe("Due in 1 day");
    expect(dueLabel("2026-12-25", false, now).tone).toBe("neutral");
    expect(dueLabel("2026-11-01", true, now)).toEqual({ text: "Done", tone: "ok" });
    expect(dueLabel(null, false, now).text).toBe("No due date");
  });
});

describe("formatting helpers", () => {
  it("formats date columns without shifting the day", () => {
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDate(null)).toBe("No date");
  });
  it("handles empty progress", () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(2, 3)).toBe(67);
  });
});

describe("dbErrorMessage", () => {
  it("doesn't reveal whether a record exists", () => {
    // RLS-hidden rows and missing rows must be indistinguishable.
    expect(dbErrorMessage({ code: "P0002" })).toBe(dbErrorMessage({ code: "PGRST116" }));
  });
  it("never echoes raw database messages", () => {
    const msg = dbErrorMessage({ code: "XX000", message: 'relation "portal.secret" does not exist' });
    expect(msg).not.toContain("portal");
  });
});

describe("makePdf", () => {
  it("produces a PDF whose xref offset is correct", () => {
    const pdf = makePdf(["Hello (world)"]);
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    const startxref = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    expect(pdf).toContain("Hello \\(world\\)");
  });
});
