"use client";

import { useState, useEffect } from "react";
import { LiveCase } from "@/lib/types";
import LiveCaseDetail from "./LiveCaseDetail";

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  saathi_didi_booth: "Saathi Didi",
  ipad_booth: "iPad Booth",
  mobile_volunteer: "Mobile",
  mobile_app: "Mobile",
  command_center: "Command Center",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-200 text-red-900 border-red-400",
  high:     "bg-orange-200 text-orange-900 border-orange-400",
  medium:   "bg-yellow-100 text-yellow-900 border-yellow-400",
  low:      "bg-gray-100 text-gray-700",
};

interface LiveCasesQueueProps {
  cases: LiveCase[];
  newIds: Set<string>;
}

export default function LiveCasesQueue({ cases, newIds }: LiveCasesQueueProps) {
  const [selected, setSelected] = useState<LiveCase | null>(null);
  const [filterSource, setFilterSource] = useState<string>("all");
  useEffect(() => {
    setSelected(previous => previous ? cases.find(item => item.id === previous.id) || null : null);
  }, [cases]);

  const filtered =
    filterSource === "all" ? cases : cases.filter((c) => c.source === filterSource);

  if (selected) {
    return (
      <div>
        <button className="neo-btn bg-black text-white text-xs px-3 py-2 mb-4" onClick={() => setSelected(null)}>
          ← Back to Live Cases
        </button>
        <LiveCaseDetail liveCase={selected} onClose={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black uppercase tracking-wide text-white">Live Cases Queue</h2>
          <span className="flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 animate-ping absolute" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
          </span>
          <span className="text-sm font-bold text-white/70">{cases.length} open</span>
        </div>

        <select
          className="neo-input w-auto text-sm py-1.5"
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
        >
          <option value="all">All Sources</option>
          {Object.keys(SOURCE_LABELS).map((s) => (
            <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">
          {cases.length === 0 ? "No live cases yet. Waiting for realtime..." : "No cases from this source."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`neo-card p-4 cursor-pointer hover:bg-orange-50 transition-colors relative ${
                newIds.has(c.id) ? "border-orange-500 bg-orange-50" : ""
              }`}
              onClick={() => setSelected(c)}
            >
              {newIds.has(c.id) && (
                <span className="absolute top-2 right-2 status-badge bg-orange-500 text-white border-orange-600 text-[10px]">
                  NEW
                </span>
              )}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wide bg-black text-white px-2 py-0.5">
                      {SOURCE_LABELS[c.source] ?? c.source}
                    </span>
                    <span className="font-black text-sm">
                      {c.missing_person_name || "(No Name)"}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{c.id.slice(0, 8)}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {[c.gender, c.age_band, c.last_seen_location, c.zone_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {c.risk_flags && c.risk_flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.risk_flags.map((f) => (
                        <span key={f} className="status-badge bg-red-100 text-red-800 border-red-300 text-[10px]">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {c.priority && (
                    <span className={`status-badge ${PRIORITY_COLORS[c.priority] ?? "bg-gray-100"}`}>
                      {c.priority}
                    </span>
                  )}
                  <span className="status-badge bg-gray-100 text-gray-700">{c.status}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(c.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
