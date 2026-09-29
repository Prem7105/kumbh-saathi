"use client";

import { AuditLog } from "@/lib/types";

interface AuditLogPanelProps {
  logs: AuditLog[];
  loading: boolean;
}

const ACTION_COLORS: Record<string, string> = {
  viewed_case_details: "bg-blue-50 text-blue-700",
  assigned_volunteer_task: "bg-orange-50 text-orange-700",
  reviewed_duplicate: "bg-purple-50 text-purple-700",
  requested_manual_cctv_review: "bg-gray-100 text-gray-700",
  escalated_trust_check: "bg-red-50 text-red-700",
  updated_trust_check: "bg-yellow-50 text-yellow-700",
  viewed_live_case: "bg-blue-50 text-blue-600",
};

export default function AuditLogPanel({ logs, loading }: AuditLogPanelProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Audit Log</h2>
        <span className="text-sm text-white/70 font-bold">Live — all command-center actions</span>
      </div>

      {loading ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">Loading audit log...</div>
      ) : logs.length === 0 ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">No audit events yet.</div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="neo-card p-4 flex items-start gap-4">
              <div className="text-[10px] text-gray-400 font-mono w-28 flex-shrink-0 pt-0.5 leading-relaxed">
                {new Date(log.created_at).toLocaleTimeString()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`status-badge text-[10px] ${
                      ACTION_COLORS[log.action ?? ""] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {log.action ?? "action"}
                  </span>
                  {log.pii_accessed && (
                    <span className="status-badge bg-red-100 text-red-700 text-[10px]">PII</span>
                  )}
                </div>
                <div className="text-xs text-gray-600">
                  <span className="font-bold text-black">{log.actor ?? "system"}</span>
                  {log.entity_type && <span> · {log.entity_type}</span>}
                  {log.entity_id && <span className="font-mono text-gray-400"> #{log.entity_id.slice(0, 8)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
