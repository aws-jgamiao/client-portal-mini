import { Badge } from "@/components/ui/primitives";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/format";

const TONE: Record<ProjectStatus, "neutral" | "brand" | "ok" | "warn" | "info"> = {
  planning: "info",
  in_progress: "brand",
  review: "warn",
  completed: "ok",
  on_hold: "neutral",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function DueBadge({ label }: { label: { text: string; tone: "neutral" | "warn" | "danger" | "ok" } }) {
  return <Badge tone={label.tone}>{label.text}</Badge>;
}
