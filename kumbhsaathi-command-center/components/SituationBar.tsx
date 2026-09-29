"use client";

import type { CommandCenterStats } from "@/lib/types";

interface Props {
  stats: CommandCenterStats | null;
  liveCaseCount: number;
  criticalCount: number;
}

export default function SituationBar({ stats, liveCaseCount, criticalCount }: Props) {
  const items: { label: string; value: number | null | undefined; urgent?: boolean; positive?: boolean }[] = [
    { label: "FILED",      value: stats?.official_total                                       },
    { label: "REUNITED",   value: stats?.official_reunited,  positive: true                  },
    { label: "PENDING",    value: stats?.official_pending                                     },
    { label: "UNRESOLVED", value: stats?.official_unresolved,urgent: (stats?.official_unresolved ?? 0) > 0 },
    { label: "LIVE OPEN",  value: liveCaseCount,             urgent: liveCaseCount > 0       },
    { label: "CRITICAL",   value: criticalCount,             urgent: criticalCount > 0       },
    { label: "CHILDREN",   value: stats?.official_children,  urgent: (stats?.official_children ?? 0) > 0 },
    { label: "ELDERLY",    value: stats?.official_elderly                                    },
    { label: "CAMERAS",    value: stats?.cameras                                             },
    { label: "ZONES",      value: stats?.zones                                               },
  ];

  return (
    <div
      className="flex items-center gap-0 flex-shrink-0 overflow-x-auto"
      style={{ borderBottom: "2px solid #0a0a0a", background: "#0a0a0a" }}
    >
      {items.map(({ label, value, urgent, positive }, i) => (
        <div
          key={label}
          className="flex items-baseline gap-1.5 px-4 py-2 flex-shrink-0"
          style={{
            borderRight: i < items.length - 1 ? "1px solid #1f1f1f" : undefined,
          }}
        >
          <span
            className="text-sm font-black tabular-nums leading-none"
            style={{
              color: urgent ? "#f97316" : positive ? "#22c55e" : "#e5e7eb",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value?.toLocaleString("en-IN") ?? "—"}
          </span>
          <span
            className="text-[8px] font-black uppercase tracking-widest leading-none"
            style={{ color: "#4b5563" }}
          >
            {label}
          </span>
        </div>
      ))}

      {/* Spacer + realtime pulse */}
      <div className="flex-1" />
      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ borderLeft: "1px solid #1f1f1f" }}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#22c55e" }}>
          Realtime Active
        </span>
      </div>
    </div>
  );
}
