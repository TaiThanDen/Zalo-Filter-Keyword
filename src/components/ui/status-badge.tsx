type StatusBadgeProps = {
  value: string | boolean | null | undefined;
};

function resolveColors(value: string) {
  const normalized = value.toLowerCase();

  if (["true", "enabled", "active", "matched", "sent", "online", "success"].includes(normalized)) {
    return { background: "rgba(31, 122, 76, 0.14)", color: "var(--color-success)" };
  }

  if (["failed", "offline", "danger"].includes(normalized)) {
    return { background: "rgba(180, 35, 24, 0.14)", color: "var(--color-danger)" };
  }

  if (["degraded", "retry_scheduled", "processing", "warning"].includes(normalized)) {
    return { background: "rgba(161, 98, 7, 0.14)", color: "var(--color-warning)" };
  }

  return { background: "rgba(95, 78, 58, 0.12)", color: "var(--color-muted)" };
}

export function StatusBadge({ value }: StatusBadgeProps) {
  const text = String(value ?? "unknown");
  const colors = resolveColors(text);

  return (
    <span
      className="status-pill"
      style={{
        background: colors.background,
        color: colors.color,
      }}
    >
      {text}
    </span>
  );
}
