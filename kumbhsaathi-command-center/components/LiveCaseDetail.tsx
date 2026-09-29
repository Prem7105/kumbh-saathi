"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { LiveCase, CaseUpdate } from "@/lib/types";
import SpatialContext from "./SpatialContext";
import dynamic from "next/dynamic";

const LocationMiniMap = dynamic(() => import("./LocationMiniMap"), { ssr: false });

interface LiveCaseDetailProps {
  liveCase: LiveCase;
  onClose: () => void;
}

export default function LiveCaseDetail({ liveCase, onClose }: LiveCaseDetailProps) {
  const [updates, setUpdates] = useState<CaseUpdate[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);

  useEffect(() => {
    // Fetch case timeline
    supabase
      .from("case_updates")
      .select("*")
      .eq("case_id", liveCase.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setUpdates((data as CaseUpdate[]) ?? []);
        setLoadingUpdates(false);
      });

    // Audit
    supabase.rpc("create_audit_log", {
      p_actor: "command_center",
      p_action: "viewed_live_case",
      p_entity_type: "live_case",
      p_entity_id: liveCase.id,
      p_pii_accessed: false,
      p_metadata: { source: liveCase.source },
    });

    // Subscribe to realtime case_updates for this case
    const channel = supabase
      .channel(`case-updates-${liveCase.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "case_updates", filter: `case_id=eq.${liveCase.id}` },
        (payload) => {
          setUpdates((prev) => [payload.new as CaseUpdate, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [liveCase.id, liveCase.source]);

  const Field = ({ label, value }: { label: string; value: unknown }) => (
    <div className="border-b border-gray-100 py-2">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{String(value ?? "—")}</div>
    </div>
  );

  const PRIORITY_COLORS: Record<string, string> = {
    critical: "bg-red-200 text-red-900",
    high: "bg-orange-200 text-orange-900",
    medium: "bg-yellow-100 text-yellow-900",
    low: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="neo-card p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <div className="text-xs font-mono text-gray-400">Live Case · {liveCase.source} · {liveCase.id.slice(0, 12)}</div>
          <h3 className="text-2xl font-black">{liveCase.missing_person_name || "(No Name)"}</h3>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {liveCase.priority && (
            <span className={`status-badge ${PRIORITY_COLORS[liveCase.priority] ?? "bg-gray-100"}`}>
              {liveCase.priority}
            </span>
          )}
          <span className="status-badge bg-gray-100 text-gray-700">{liveCase.status}</span>
        </div>
      </div>

      {/* Risk Flags */}
      {liveCase.risk_flags && liveCase.risk_flags.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border-2 border-red-300">
          <div className="text-xs font-black uppercase mb-2 text-red-700">Risk Flags</div>
          <div className="flex flex-wrap gap-1">
            {liveCase.risk_flags.map((f) => (
              <span key={f} className="status-badge bg-red-200 text-red-900 border-red-400">{f}</span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 mb-4">
        <Field label="Source" value={liveCase.source} />
        <Field label="Source Detail" value={liveCase.source_detail} />
        <Field label="Case Type" value={liveCase.case_type} />
        <Field label="Reported At" value={new Date(liveCase.created_at).toLocaleString()} />
      </div>

      {/* Last Seen Location + map */}
      <div className="py-3 mb-2">
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Last Seen Location</div>
        <div className="text-sm font-semibold mb-2">{liveCase.last_seen_location || "—"}</div>
        {liveCase.last_seen_location && (
          <LocationMiniMap
            locationText={liveCase.last_seen_location}
            structuredData={liveCase.structured_data}
            height={380}
          />
        )}
      </div>

      <Field label="Raw Report" value={liveCase.raw_report} />

      {liveCase.private_verification_clues && liveCase.private_verification_clues.length > 0 && (
        <div className="mt-3 p-3 bg-yellow-50 border-2 border-yellow-400">
          <div className="text-xs font-black uppercase mb-1 text-yellow-800">Private Verification Clues</div>
          <ul className="text-sm space-y-1">
            {liveCase.private_verification_clues.map((clue, i) => (
              <li key={i} className="font-medium">• {clue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Case Updates Timeline */}
      <div className="mt-6">
        <h4 className="text-sm font-black uppercase tracking-wide mb-3">Case Timeline</h4>
        {loadingUpdates ? (
          <div className="text-sm text-gray-500">Loading timeline...</div>
        ) : updates.length === 0 ? (
          <div className="text-sm text-gray-400">No updates yet.</div>
        ) : (
          <div className="space-y-2">
            {updates.map((u) => (
              <div key={u.id} className="border-l-4 border-orange-500 pl-3 py-1">
                <div className="text-xs font-bold text-gray-600 uppercase">{u.update_type}</div>
                {u.note && <div className="text-sm">{u.note}</div>}
                <div className="text-[10px] text-gray-400">
                  {u.actor} · {new Date(u.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spatial Context */}
      <SpatialContext
        zoneName={liveCase.zone_name}
        liveCaseId={liveCase.id}
      />

      {/* Actions */}
      <div className="mt-6 flex gap-3 flex-wrap">
        <button className="neo-btn bg-white text-black px-5 py-2 text-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
