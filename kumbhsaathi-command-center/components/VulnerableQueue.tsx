"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { OfficialCase } from "@/lib/types";
import CaseDetail from "./CaseDetail";

export default function VulnerableQueue() {
  const [cases, setCases] = useState<OfficialCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<OfficialCase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("vulnerable_official_cases", { max_rows: 100 });
      if (rpcError) throw rpcError;
      setCases((data as OfficialCase[]) ?? []);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load vulnerable cases.");
    } finally {
      setLoading(false);
    }
  };

  if (selected) {
    return (
      <div>
        <button className="neo-btn bg-black text-white text-xs px-3 py-2 mb-4" onClick={() => setSelected(null)}>
          ← Back to Vulnerable Queue
        </button>
        <CaseDetail caseData={selected} onClose={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Vulnerable Cases Queue</h2>
        <button className="neo-btn bg-orange-500 text-white text-sm px-4 py-2" onClick={load} disabled={loading}>
          {loading ? "Loading..." : loaded ? "↺ Refresh" : "Load Queue"}
        </button>
      </div>

      <p className="text-sm text-white/75 mb-4">
        High-priority official cases: children, elderly, no name, no mobile, hospital transfers, unresolved.
      </p>

      {error && <div className="neo-card bg-red-50 p-3 mb-4 text-sm text-red-700 font-bold">{error}</div>}

      {!loaded ? (
        <div className="neo-card p-8 text-center text-gray-400 font-bold">Press &quot;Load Queue&quot; to fetch vulnerable cases.</div>
      ) : cases.length === 0 ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">No vulnerable cases found.</div>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <button
              key={c.case_id}
              className="w-full neo-card p-4 text-left hover:bg-orange-50 transition-colors"
              onClick={() => setSelected(c)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-black text-sm">
                    {c.missing_person_name || "(No Name)"}{" "}
                    <span className="text-gray-400 font-mono text-xs">#{c.case_id}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {[c.gender, c.age_band, c.last_seen_location, c.reporting_center].filter(Boolean).join(" · ")}
                  </div>
                  {c.risk_flags && c.risk_flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.risk_flags.map((f) => (
                        <span key={f} className="status-badge bg-red-100 text-red-800 border-red-300 text-[10px]">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="status-badge bg-red-100 text-red-800">{c.status ?? "Unknown"}</span>
                  <span className="text-xs text-gray-400">{c.masked_mobile ?? "—"}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
