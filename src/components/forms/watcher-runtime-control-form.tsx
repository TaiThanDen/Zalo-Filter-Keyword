"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  MAX_WATCHER_SLEEP_WINDOWS,
  WATCHER_SLEEP_TIMEZONE,
  type WatcherControlMode,
} from "@/src/modules/watchers/watcher-schedule";

type EditableWindow = { id: string; sleepStart: string; sleepEnd: string };

type Props = {
  watcherId: string;
  initialControlMode: WatcherControlMode;
  initialEnabled: boolean;
  initialWindows: Array<{ sleepStart: string; sleepEnd: string }>;
};

const modes: Array<{ value: WatcherControlMode; label: string }> = [
  { value: "scheduled", label: "Theo lịch" },
  { value: "paused", label: "Dừng ngay" },
  { value: "running", label: "Chạy ngay" },
];

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return body?.message ?? fallback;
}

export function WatcherRuntimeControlForm({
  watcherId,
  initialControlMode,
  initialEnabled,
  initialWindows,
}: Props) {
  const router = useRouter();
  const [controlMode, setControlMode] = useState(initialControlMode);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [windows, setWindows] = useState<EditableWindow[]>(() =>
    initialWindows.map((window, index) => ({ ...window, id: `window-${index}` })),
  );
  const [pending, setPending] = useState(false);

  async function setMode(mode: WatcherControlMode) {
    if (pending || mode === controlMode) return;
    setPending(true);
    try {
      const response = await fetch(`/api/watchers/${watcherId}/control`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlMode: mode }),
      });
      if (!response.ok) throw new Error(await readError(response, "Không thể đổi chế độ watcher"));
      setControlMode(mode);
      toast.success(mode === "paused" ? "Đã yêu cầu dừng watcher" : mode === "running" ? "Đã yêu cầu chạy watcher" : "Watcher sẽ chạy theo lịch");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể đổi chế độ watcher");
    } finally {
      setPending(false);
    }
  }

  function updateWindow(id: string, field: "sleepStart" | "sleepEnd", value: string) {
    setWindows((current) => current.map((window) => window.id === id ? { ...window, [field]: value } : window));
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(`/api/watchers/${watcherId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sleepEnabled: enabled,
          sleepTimezone: WATCHER_SLEEP_TIMEZONE,
          sleepWindows: windows.map(({ sleepStart, sleepEnd }) => ({ sleepStart, sleepEnd })),
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Không thể cập nhật lịch nghỉ"));
      toast.success("Đã cập nhật các khung giờ nghỉ");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật lịch nghỉ");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-w-72 gap-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1">
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            disabled={pending}
            onClick={() => void setMode(mode.value)}
            className={controlMode === mode.value ? "btn btn-primary px-2 py-2 text-xs" : "btn btn-secondary px-2 py-2 text-xs"}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <form onSubmit={saveSchedule} className="grid gap-3">
        <fieldset disabled={pending} className="grid gap-3 disabled:opacity-70">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Bật lịch nghỉ
          </label>

          {windows.map((window, index) => (
            <div key={window.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                Bắt đầu {index + 1}
                <input className="field" type="time" value={window.sleepStart} onChange={(event) => updateWindow(window.id, "sleepStart", event.target.value)} required />
              </label>
              <label className="grid gap-1 text-xs text-[var(--color-muted)]">
                Kết thúc {index + 1}
                <input className="field" type="time" value={window.sleepEnd} onChange={(event) => updateWindow(window.id, "sleepEnd", event.target.value)} required />
              </label>
              <button
                type="button"
                className="btn btn-secondary px-3"
                aria-label={`Xóa khung giờ ${index + 1}`}
                disabled={windows.length === 1}
                onClick={() => setWindows((current) => current.filter((item) => item.id !== window.id))}
              >
                ×
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={windows.length >= MAX_WATCHER_SLEEP_WINDOWS}
              onClick={() => setWindows((current) => [...current, { id: crypto.randomUUID(), sleepStart: "12:00", sleepEnd: "13:00" }])}
            >
              + Thêm khung giờ
            </button>
            <button type="submit" className="btn btn-primary">Lưu lịch nghỉ</button>
          </div>
        </fieldset>
      </form>

      <p className="text-xs leading-5 text-[var(--color-muted)]">
        Múi giờ Hồ Chí Minh (UTC+7). Lệnh thủ công được watcher nhận trong khoảng 30 giây. “Chạy ngay” tạm bỏ qua lịch cho đến khi chọn lại “Theo lịch”.
      </p>
    </div>
  );
}
