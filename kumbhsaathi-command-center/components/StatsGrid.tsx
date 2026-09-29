"use client";

import { CommandCenterStats } from "@/lib/types";

interface StatCardProps {
  label: string;
  value: number | undefined;
  accent?: boolean;
  alert?: boolean;
}

function StatCard({ label, value, accent, alert }: StatCardProps) {
  return (
    <div
      className={`neo-card p-4 flex flex-col gap-1 ${
        alert ? "bg-red-50" : accent ? "bg-orange-50" : "bg-white"
      }`}
    >
      <div
        className={`text-3xl font-black tabular-nums ${
          alert ? "text-red-600" : accent ? "text-orange-500" : "text-black"
        }`}
      >
        {value ?? "—"}
      </div>
      <div className="text-xs font-bold uppercase tracking-wide text-gray-600">{label}</div>
    </div>
  );
}

interface StatsGridProps {
  stats: CommandCenterStats | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function StatsGrid({ stats, loading, onRefresh }: StatsGridProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Overview Stats</h2>
        <button
          className="neo-btn bg-black text-white text-xs px-3 py-2"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Loading..." : "↺ Refresh"}
        </button>
      </div>

      {loading && !stats ? (
        <div className="neo-card p-8 text-center text-gray-500 font-bold">Loading stats...</div>
      ) : (
        <div className="space-y-4">
          {/* Official Records */}
          <div>
            <div className="text-xs font-black uppercase tracking-widest mb-2 text-white/60">
              Official Records (2,500 dataset)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <StatCard label="Total Official"  value={stats?.official_total}      accent />
              <StatCard label="Reunited"        value={stats?.official_reunited}          />
              <StatCard label="Pending"         value={stats?.official_pending}           />
              <StatCard label="Unresolved"      value={stats?.official_unresolved} alert  />
              <StatCard label="Hospital"        value={stats?.official_hospital}          />
              <StatCard label="Duplicates"      value={stats?.official_duplicates}        />
              <StatCard label="Children"        value={stats?.official_children}   alert  />
              <StatCard label="Elderly"         value={stats?.official_elderly}    alert  />
              <StatCard label="No Name"         value={stats?.official_no_name}           />
              <StatCard label="No Mobile"       value={stats?.official_no_mobile}         />
            </div>
          </div>

          {/* Live & Operational */}
          <div>
            <div className="text-xs font-black uppercase tracking-widest mb-2 text-white/60">
              Live & Operational
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Live Open Cases"       value={stats?.live_open}             accent />
              <StatCard label="Open Tasks"            value={stats?.volunteer_open_tasks}  accent />
              <StatCard label="High-Concern Trust"    value={stats?.trust_high_concern}    alert  />
            </div>
          </div>

          {/* Spatial */}
          <div>
            <div className="text-xs font-black uppercase tracking-widest mb-2 text-white/60">
              Spatial Coverage
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Zones"               value={stats?.zones}               />
              <StatCard label="CCTV Cameras"        value={stats?.cameras}             />
              <StatCard label="Police Stations"     value={stats?.police_stations}     />
              <StatCard label="Chokepoints / Parking" value={stats?.chokepoints_parking} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
