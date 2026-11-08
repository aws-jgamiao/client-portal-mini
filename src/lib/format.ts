import type { Database } from "@/lib/database.types";

export type ProjectStatus = Database["portal"]["Enums"]["project_status"];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  in_progress: "In progress",
  review: "In review",
  completed: "Completed",
  on_hold: "On hold",
};

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** Parses the YYYY-MM-DD prefix of a date or timestamp string. */
function ymd(value: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new RangeError(`Invalid date: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Formats a `date` column (YYYY-MM-DD) without shifting it through UTC. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const [y, m, d] = ymd(value);
  return dateFmt.format(new Date(y, m - 1, d));
}

export function formatDateTime(value: string): string {
  return dateTimeFmt.format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Days between today and a YYYY-MM-DD date, using the calendar day in the
 * given time zone (not UTC), so "due today" means today for the viewer.
 */
export function daysUntil(date: string, now: Date = new Date(), timeZone = "Australia/Sydney"): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now); // YYYY-MM-DD
  const toUtcDay = (s: string) => {
    const [y, m, d] = ymd(s);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcDay(date) - toUtcDay(today)) / 86_400_000);
}

export function dueLabel(date: string | null, done: boolean, now?: Date): { text: string; tone: "neutral" | "warn" | "danger" | "ok" } {
  if (done) return { text: "Done", tone: "ok" };
  if (!date) return { text: "No due date", tone: "neutral" };
  const days = daysUntil(date, now);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "danger" };
  if (days === 0) return { text: "Due today", tone: "warn" };
  if (days <= 3) return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "warn" };
  return { text: `Due ${formatDate(date)}`, tone: "neutral" };
}

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
