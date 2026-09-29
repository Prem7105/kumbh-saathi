"use client";

import { NavSection } from "@/lib/types";

const NAV_ITEMS: { id: NavSection; label: string }[] = [
  { id: "overview",    label: "Overview"         },
  { id: "search",      label: "Search Cases"     },
  { id: "live-cases",  label: "Live Cases"       },
  { id: "vulnerable",  label: "Vulnerable Queue" },
  { id: "map",         label: "Command Map"      },
  { id: "zones",       label: "Zone Summary"     },
  { id: "trust-check", label: "Trust Check"      },
  { id: "tasks",       label: "Volunteer Tasks" },
  { id: "audit",       label: "Audit Log"        },
];

interface SidebarProps {
  active: NavSection;
  onChange: (section: NavSection) => void;
  liveCaseCount?: number;
  trustHighCount?: number;
}

export default function Sidebar({ active, onChange, liveCaseCount, trustHighCount }: SidebarProps) {
  const badgeFor = (id: NavSection) => {
    if (id === "live-cases" && liveCaseCount) return liveCaseCount;
    if (id === "trust-check" && trustHighCount) return trustHighCount;
    return null;
  };

  return (
    <aside className="w-56 min-h-screen border-r-2 border-black bg-white flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="border-b-2 border-black p-4">
        <div className="text-xs font-black uppercase tracking-widest text-orange-500">Kumbh Saathi</div>
        <div className="text-lg font-black uppercase leading-none">Command<br />Center</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const badge = badgeFor(item.id);
          return (
            <button
              key={item.id}
              className={`sidebar-link justify-between${active === item.id ? " active" : ""}`}
              onClick={() => onChange(item.id)}
            >
              <span>{item.label}</span>
              {badge !== null && badge > 0 && (
                <span className="bg-black text-white text-xs font-black px-1.5 py-0.5 rounded-sm min-w-[20px] text-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t-2 border-black p-3 text-xs text-gray-500">
        <div className="font-black text-black uppercase">Web Only</div>
        <div>Staff operations</div>
        {process.env.NEXT_PUBLIC_WHATSAPP_URL?.startsWith("https://wa.me/") && <a
          href={process.env.NEXT_PUBLIC_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-1.5 w-full bg-green-500 hover:bg-green-600 text-white text-xs font-black px-2 py-2 rounded border-2 border-green-700 transition-colors"
          style={{ boxShadow: "2px 2px 0 #14532d" }}
        >
          <span>💬</span> Chat on WhatsApp
        </a>}
      </div>
    </aside>
  );
}
