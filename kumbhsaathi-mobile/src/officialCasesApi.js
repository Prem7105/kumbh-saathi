import { hasSupabaseConfig, supabase } from "./supabase";

export const demoOfficialCases = [
  {
    case_id: "KMP-2027-00197",
    reporter_mobile: "+91 9876543210",
    missing_person_name: null,
    gender: "Unknown",
    age_band: "0-12",
    language: "Hindi",
    last_seen_location: "Sadhugram Gate 1",
    reporting_center: "Panchavati Center",
    status: "Unresolved",
    masked_mobile: "******2190",
    physical_description: "Child separated from family near gate crowd.",
    risk_flags: ["child", "no_name", "unresolved"],
    rank_score: 0.82,
  },
  {
    case_id: "KMP-2027-02095",
    missing_person_name: "Unknown elder",
    gender: "Female",
    age_band: "71-80",
    language: "Maithili",
    last_seen_location: "Sadhugram Gate 2",
    reporting_center: "Ramkund Kho-Ya-Paya Kendra",
    status: "Pending",
    masked_mobile: null,
    physical_description: "Elderly woman, confused, no clear mobile number.",
    risk_flags: ["elderly", "no_mobile"],
    rank_score: 0.74,
  },
];

export async function searchOfficialCases(query, maxRows = 20) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    return { cases: [], demoMode: !hasSupabaseConfig };
  }

  if (!hasSupabaseConfig) {
    const normalized = cleanQuery.toLowerCase();
    return {
      demoMode: true,
      cases: demoOfficialCases.filter((item) =>
        [
          item.case_id,
          item.missing_person_name,
          item.gender,
          item.age_band,
          item.language,
          item.last_seen_location,
          item.reporting_center,
          item.status,
          item.physical_description,
          ...(item.risk_flags || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      ),
    };
  }

  const { data, error } = await supabase.rpc("search_official_cases", {
    q: cleanQuery,
    max_rows: maxRows,
  });

  if (error) throw error;
  const cases = data || [];
  return { cases: await attachReporterMobiles(cases), demoMode: false };
}

async function attachReporterMobiles(cases) {
  const caseIds = cases.map((item) => item.case_id).filter(Boolean);
  if (!caseIds.length) return cases;

  const { data, error } = await supabase
    .from("official_missing_persons")
    .select("case_id, reporter_mobile")
    .in("case_id", caseIds);

  if (error) throw error;

  const mobileByCaseId = new Map((data || []).map((item) => [item.case_id, item.reporter_mobile]));
  return cases.map((item) => ({
    ...item,
    reporter_mobile: mobileByCaseId.get(item.case_id) || null,
  }));
}
