import type { SVGProps } from "react";

export type AppIconName =
  | "dashboard"
  | "groups"
  | "rules"
  | "channels"
  | "logs"
  | "watcher"
  | "logout"
  | "arrow"
  | "alert";

export function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: AppIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} {...common}>
      {name === "dashboard" ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> : null}
      {name === "groups" ? <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.6A4.4 4.4 0 0 1 7.9 14h2.2a4.4 4.4 0 0 1 4.4 4.4V20" /><path d="M15.5 5.4a3 3 0 0 1 0 5.2M17 14a4.3 4.3 0 0 1 3.5 4.2V20" /></> : null}
      {name === "rules" ? <><path d="M12 3v18M5 6h14" /><path d="m5 6-3 7h6L5 6ZM19 6l-3 7h6l-3-7Z" /><path d="M8 21h8" /></> : null}
      {name === "channels" ? <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></> : null}
      {name === "logs" ? <><rect x="4" y="3" width="14" height="18" rx="2" /><path d="M8 8h6M8 12h6M8 16h3" /><circle cx="18" cy="17" r="3" /><path d="m20.2 19.2 1.3 1.3" /></> : null}
      {name === "watcher" ? <><circle cx="12" cy="12" r="9" /><path d="M4 12h4l2-5 4 10 2-5h4" /></> : null}
      {name === "logout" ? <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></> : null}
      {name === "arrow" ? <path d="M5 12h14m-5-5 5 5-5 5" /> : null}
      {name === "alert" ? <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4M12 16.5v.1" /></> : null}
    </svg>
  );
}
