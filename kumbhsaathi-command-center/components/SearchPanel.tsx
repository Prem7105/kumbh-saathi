"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { OfficialCase } from "@/lib/types";
import CaseDetail from "./CaseDetail";

const STATUS_COLORS: Record<string, string> = {
  reunited: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  hospital: "bg-blue-100 text-blue-800",
  unresolved: "bg-red-100 text-red-800",
};

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OfficialCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<OfficialCase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("search_official_cases", {
        q: query.trim(),
        max_rows: 50,
      });
      if (rpcError) throw rpcError;
      setResults((data as OfficialCase[]) ?? []);
      setSearched(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Search failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (selected) {
    return (
      <div>
        <button
          className="neo-btn bg-black text-white text-xs px-3 py-2 mb-4"
          onClick={() => setSelected(null)}
        >
          ← Back to Search
        </button>
        <CaseDetail caseData={selected} onClose={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-black uppercase tracking-wide text-white mb-4">Cross-Center Search</h2>
      <p className="text-sm text-white/75 mb-4 font-medium">
        Search across all reporting centers simultaneously.
      </p>

      {/* Search Bar */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          className="neo-input flex-1"
          placeholder="Name, location, district, description..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          className="neo-btn bg-orange-500 text-white px-6 py-2 text-sm"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && (
        <div className="neo-card bg-red-50 p-3 mb-4 text-sm text-red-700 font-bold">{error}</div>
      )}

      {/* Results */}
      {searched && (
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-white/70 mb-3">
            {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
          </div>

          {results.length === 0 ? (
            <div className="neo-card p-8 text-center text-gray-500 font-bold">
              No results found.
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((c) => (
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
                        {[c.gender, c.age_band, c.last_seen_location, c.reporting_center]
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
                      <span
                        className={`status-badge ${STATUS_COLORS[c.status?.toLowerCase() ?? ""] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {c.status ?? "Unknown"}
                      </span>
                      <span className="text-xs text-gray-400">{c.masked_mobile ?? "—"}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
