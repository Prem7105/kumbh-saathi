"use client";

import { ZoneSummary } from "@/lib/types";

interface ZoneSummaryPanelProps {
  zones: ZoneSummary[];
  loading: boolean;
}

export default function ZoneSummaryPanel({ zones, loading }: ZoneSummaryPanelProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Zone Summary</h2>
        <span className="text-sm text-white/70 font-bold">Updates live with cases & tasks</span>
      </div>

      {loading ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">Loading zones...</div>
      ) : zones.length === 0 ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">No zone data available.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {zones.map((z) => (
            <div key={z.zone_name} className="neo-card p-5">
              <div className="font-black text-base mb-3 border-b-2 border-black pb-2">{z.zone_name}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-black text-orange-500">{z.live_case_count}</div>
                  <div className="text-[10px] font-bold uppercase text-gray-500">Live Cases</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-black ${z.critical_live_case_count > 0 ? "text-red-600" : "text-black"}`}>
                    {z.critical_live_case_count}
                  </div>
                  <div className="text-[10px] font-bold uppercase text-gray-500">Critical</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black">{z.open_task_count}</div>
                  <div className="text-[10px] font-bold uppercase text-gray-500">Open Tasks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-blue-600">{z.camera_count}</div>
                  <div className="text-[10px] font-bold uppercase text-gray-500">Cameras</div>
                </div>
              </div>
              <div className="mt-3 text-[10px] font-mono text-gray-400">
                {z.centroid_lat?.toFixed(4)}, {z.centroid_lng?.toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
