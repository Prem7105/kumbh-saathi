"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { OfficialCase } from "@/lib/types";
import AssignTaskModal from "./AssignTaskModal";
import SpatialContext from "./SpatialContext";

interface CaseDetailProps {
  caseData: OfficialCase;
  onClose: () => void;
}

export default function CaseDetail({ caseData, onClose }: CaseDetailProps) {
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [availableZones, setAvailableZones] = useState<string[]>([]);

  // Write audit log on first render
  useEffect(() => {
    supabase.rpc("create_audit_log", {
      p_actor: "command_center",
      p_action: "viewed_case_details",
      p_entity_type: "official_case",
      p_entity_id: caseData.case_id,
      p_pii_accessed: false,
      p_metadata: { case_id: caseData.case_id },
    });

    // Load zone list for manual zone selection
    supabase
      .from("zone_boundaries")
      .select("zone_name")
      .then(({ data }) => {
        if (data) setAvailableZones(data.map((z: { zone_name: string }) => z.zone_name));
      });
  }, [caseData.case_id]);

  const Field = ({ label, value }: { label: string; value: unknown }) => (
    <div className="border-b border-gray-100 py-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{String(value ?? "—")}</div>
    </div>
  );

  const statusColors: Record<string, string> = {
    reunited: "bg-green-200 text-green-900",
    pending: "bg-yellow-200 text-yellow-900",
    hospital: "bg-blue-200 text-blue-900",
    unresolved: "bg-red-200 text-red-900",
  };

  return (
    <div className="neo-card p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <div className="text-xs font-mono text-gray-400">Case #{caseData.case_id}</div>
          <h3 className="text-2xl font-black">
            {caseData.missing_person_name || "(No Name)"}
          </h3>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <span
            className={`status-badge ${
              statusColors[caseData.status?.toLowerCase() ?? ""] ?? "bg-gray-100 text-gray-700"
            }`}
          >
            {caseData.status ?? "Unknown"}
          </span>
          {caseData.is_duplicate_report && (
            <span className="status-badge bg-purple-100 text-purple-800">Duplicate</span>
          )}
        </div>
      </div>

      {/* Risk Flags */}
      {caseData.risk_flags && caseData.risk_flags.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-red-300">
          <div className="text-xs font-black uppercase mb-2 text-red-700">Risk Flags</div>
          <div className="flex flex-wrap gap-1">
            {caseData.risk_flags.map((f) => (
              <span key={f} className="status-badge bg-red-200 text-red-900 border-red-400">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-x-6 mb-4">
        <Field label="Gender" value={caseData.gender} />
        <Field label="Age Band" value={caseData.age_band} />
        <Field label="State" value={caseData.state} />
        <Field label="District" value={caseData.district} />
        <Field label="Language" value={caseData.language} />
        <Field label="Reporting Center" value={caseData.reporting_center} />
        <Field label="Last Seen Location" value={caseData.last_seen_location} />
        <Field label="Reported At" value={caseData.reported_at ? new Date(caseData.reported_at).toLocaleString() : "—"} />
        <Field label="Resolution Hours" value={caseData.resolution_hours} />
        <Field label="Contact (Masked)" value={caseData.masked_mobile ?? caseData.reporter_mobile ?? "—"} />
      </div>

      <Field label="Physical Description" value={caseData.physical_description} />
      <Field label="Remarks" value={caseData.remarks} />

      {/* Zone selection for spatial context (official cases lack exact coordinates) */}
      <div className="mt-6">
        <div className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2">
          Spatial Context — choose nearest zone manually
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            className="neo-input text-sm py-1.5 flex-1"
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
          >
            <option value="">Select zone for spatial context...</option>
            {availableZones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>
        {selectedZone && (
          <SpatialContext
            zoneName={selectedZone}
            officialCaseId={caseData.case_id}
          />
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-3 flex-wrap">
        <button
          className="neo-btn bg-orange-500 text-white px-5 py-2 text-sm"
          onClick={() => setShowTaskModal(true)}
        >
          + Assign Volunteer Task
        </button>
        <button
          className="neo-btn bg-black text-white px-5 py-2 text-sm"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {showTaskModal && (
        <AssignTaskModal
          officialCaseId={caseData.case_id}
          onClose={() => setShowTaskModal(false)}
        />
      )}
    </div>
  );
}
