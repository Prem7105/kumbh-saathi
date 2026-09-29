"use client";

import { VolunteerTask } from "@/lib/types";

const STATUS_FLOW = ["new", "accepted", "en_route", "on_scene", "completed", "escalated", "cancelled"];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-gray-100 text-gray-800",
  accepted: "bg-blue-100 text-blue-800",
  en_route: "bg-indigo-100 text-indigo-800",
  on_scene: "bg-orange-100 text-orange-800",
  completed: "bg-green-100 text-green-800",
  escalated: "bg-red-200 text-red-900",
  cancelled: "bg-gray-200 text-gray-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-200 text-red-900",
  high: "bg-orange-200 text-orange-900",
  medium: "bg-yellow-100 text-yellow-900",
  low: "bg-gray-100 text-gray-600",
};

interface VolunteerTasksPanelProps {
  tasks: VolunteerTask[];
}

export default function VolunteerTasksPanel({ tasks }: VolunteerTasksPanelProps) {
  const activeStatuses = ["new", "accepted", "en_route", "on_scene", "escalated"];
  const active = tasks.filter((t) => activeStatuses.includes(t.status));
  const completed = tasks.filter((t) => t.status === "completed" || t.status === "cancelled");

  const renderTask = (t: VolunteerTask) => (
    <div key={t.id} className="neo-card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-black text-sm">{t.title}</div>
          <div className="text-xs text-gray-500 font-mono">{t.id.slice(0, 8)}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`status-badge ${STATUS_COLORS[t.status] ?? "bg-gray-100"}`}>{t.status}</span>
          {t.priority && (
            <span className={`status-badge ${PRIORITY_COLORS[t.priority] ?? "bg-gray-100"}`}>{t.priority}</span>
          )}
        </div>
      </div>

      {t.description && <div className="text-sm text-gray-600 mb-2">{t.description}</div>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {t.assigned_to && <span>👤 {t.assigned_to}</span>}
        {t.zone_name && <span>📍 {t.zone_name}</span>}
        {t.due_at && <span>⏰ {new Date(t.due_at).toLocaleString()}</span>}
        <span>Updated: {new Date(t.updated_at).toLocaleString()}</span>
      </div>

      {/* Status Pipeline */}
      <div className="mt-3 flex gap-1 overflow-x-auto">
        {STATUS_FLOW.slice(0, 6).map((s) => (
          <div
            key={s}
            className={`text-[9px] font-black uppercase px-2 py-1 border border-black flex-shrink-0 ${
              t.status === s ? "bg-black text-white" : "bg-white text-gray-400"
            }`}
          >
            {s.replace("_", " ")}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Volunteer Task Monitor</h2>
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
          </span>
          <span className="text-sm font-bold text-white/70">Live updates from mobile app</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">
          No tasks yet. Assign tasks from case detail or live cases.
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/70 mb-3">
                Active Tasks ({active.length})
              </div>
              <div className="space-y-3">{active.map(renderTask)}</div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-white/70 mb-3">
                Completed / Cancelled ({completed.length})
              </div>
              <div className="space-y-3 opacity-60">{completed.map(renderTask)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
