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

function resolveLabel(value: string) {
  const normalized = value.toLowerCase();

  const labels: Record<string, string> = {
    true: "đúng",
    false: "sai",
    enabled: "đang bật",
    disabled: "đang tắt",
    active: "đang dùng",
    inactive: "đang tắt",
    include: "bao gồm",
    exclude: "loại trừ",
    matched: "khớp",
    sent: "đã gửi",
    online: "trực tuyến",
    offline: "ngoại tuyến",
    success: "thành công",
    failed: "thất bại",
    degraded: "suy giảm",
    retry_scheduled: "sẽ thử lại",
    processing: "đang xử lý",
    rejected_no_include: "không trúng include",
    rejected_by_exclude: "bị exclude",
    rejected_group_disabled: "nhóm đang tắt",
    rejected_duplicate: "bị trùng lặp",
    rejected_unknown_group: "nhóm chưa cấu hình",
    none: "không có",
    unknown: "không rõ",
  };

  return labels[normalized] ?? value;
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
      {resolveLabel(text)}
    </span>
  );
}
