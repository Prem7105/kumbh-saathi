"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { TrustCheckReport } from "@/lib/types";

const RISK_COLORS: Record<string, string> = {
  verified: "bg-green-100 text-green-800",
  unverified: "bg-yellow-100 text-yellow-900",
  high_concern: "bg-red-200 text-red-900",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  escalated: "bg-orange-200 text-orange-900",
  closed: "bg-gray-100 text-gray-600",
};

interface TrustCheckPanelProps {
  reports: TrustCheckReport[];
  onUpdate: (id: string, changes: Partial<TrustCheckReport>) => void;
}

export default function TrustCheckPanel({ reports, onUpdate }: TrustCheckPanelProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [assignInput, setAssignInput] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState("open");

  const filtered = filterStatus === "all" ? reports : reports.filter((r) => r.status === filterStatus);

  const updateReport = async (id: string, changes: Partial<TrustCheckReport>) => {
    setUpdating(id);
    try {
      const { error } = await supabase
        .from("trust_check_reports")
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      await supabase.rpc("create_audit_log", {
        p_actor: "command_center",
        p_action: changes.status === "escalated" ? "escalated_trust_check" : "updated_trust_check",
        p_entity_type: "trust_check_report",
        p_entity_id: id,
        p_pii_accessed: false,
        p_metadata: { changes },
      });

      onUpdate(id, changes);
    } catch (e: unknown) {
      console.error("Failed to update trust check:", e);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wide text-white">Trust Check Queue</h2>
          <p className="text-xs text-white/70 mt-1">Message / registry / report triage — not transaction detection.</p>
        </div>
        <select
          className="neo-input text-sm py-1.5 w-auto"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="open">Open</option>
          <option value="escalated">Escalated</option>
          <option value="closed">Closed</option>
          <option value="all">All</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">
          No Trust Check reports in this status.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="neo-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs font-mono text-gray-400 mb-1">{r.id.slice(0, 12)} · {r.source ?? "unknown"}</div>
                  {r.claimed_entity_name && (
                    <div className="font-black text-sm">{r.claimed_entity_name}</div>
                  )}
                  {r.extracted_payee_name && r.extracted_payee_name !== r.claimed_entity_name && (
                    <div className="text-xs text-gray-600">Payee: {r.extracted_payee_name}</div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {r.risk_level && (
                    <span className={`status-badge ${RISK_COLORS[r.risk_level] ?? "bg-gray-100"}`}>
                      {r.risk_level.replace("_", " ")}
                    </span>
                  )}
                  <span className={`status-badge ${STATUS_COLORS[r.status] ?? "bg-gray-100"}`}>
                    {r.status}
                  </span>
                </div>
              </div>

              {r.raw_message && (
                <div className="text-xs bg-gray-50 border border-gray-200 p-2 rounded mb-2 font-mono max-h-24 overflow-y-auto">
                  {r.raw_message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                {r.extracted_phone && <span>📞 {r.extracted_phone}</span>}
                {r.extracted_upi_vpa && <span>💳 {r.extracted_upi_vpa}</span>}
                {r.extracted_amount && <span>₹ {r.extracted_amount.toLocaleString()}</span>}
                {r.reporter_mobile && <span>Reporter: {r.reporter_mobile}</span>}
              </div>

              {r.reasons && r.reasons.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {r.reasons.map((reason, i) => (
                    <span key={i} className="status-badge bg-red-50 text-red-700 border-red-200 text-[10px]">{reason}</span>
                  ))}
                </div>
              )}

              {r.matched_verified_entity && (
                <div className="text-xs bg-green-50 border border-green-200 p-2 mb-2">
                  ✓ Matched: {r.matched_verified_entity}
                </div>
              )}

              <div className="text-xs text-gray-500 mb-3">
                {r.assigned_to && <span>Assigned to: {r.assigned_to} · </span>}
                {new Date(r.created_at).toLocaleString()}
              </div>

              {r.status !== "closed" && (
                <div className="flex flex-wrap gap-2">
                  {r.status === "open" && (
                    <button
                      className="neo-btn bg-orange-500 text-white text-xs px-4 py-1.5"
                      onClick={() => updateReport(r.id, { status: "escalated" })}
                      disabled={updating === r.id}
                    >
                      Escalate
                    </button>
                  )}
                  <button
                    className="neo-btn bg-black text-white text-xs px-4 py-1.5"
                    onClick={() => updateReport(r.id, { status: "closed" })}
                    disabled={updating === r.id}
                  >
                    Close
                  </button>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      className="neo-input text-xs py-1 w-36"
                      placeholder="Assign to..."
                      value={assignInput[r.id] ?? ""}
                      onChange={(e) => setAssignInput((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                    <button
                      className="neo-btn bg-white text-black text-xs px-3 py-1"
                      onClick={() => {
                        if (assignInput[r.id]) {
                          updateReport(r.id, { assigned_to: assignInput[r.id] });
                        }
                      }}
                      disabled={updating === r.id}
                    >
                      Assign
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
