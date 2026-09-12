import { cn } from "../shared/cn";

export function StatusPill({
  status,
  tone,
}: {
  status: string;
  tone: "ok" | "watch" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 font-mono text-xs tracking-wide uppercase",
        tone === "ok" && "bg-surface text-silver",
        tone === "watch" && "bg-raised text-fg",
        tone === "bad" && "bg-amaranth text-fg",
      )}
    >
      {status}
    </span>
  );
}
