export interface CommandCenterStats {
  official_total: number;
  official_reunited: number;
  official_pending: number;
  official_hospital: number;
  official_unresolved: number;
  official_duplicates: number;
  official_no_name: number;
  official_no_mobile: number;
  official_children: number;
  official_elderly: number;
  live_open: number;
  volunteer_open_tasks: number;
  trust_high_concern: number;
  zones: number;
  cameras: number;
  police_stations: number;
  chokepoints_parking: number;
}

export interface OfficialCase {
  case_id: string;
  reported_at: string;
  missing_person_name: string | null;
  gender: string | null;
  age_band: string | null;
  state: string | null;
  district: string | null;
  language: string | null;
  last_seen_location: string | null;
  reporting_center: string | null;
  reporter_mobile: string | null;
  physical_description: string | null;
  status: string | null;
  resolution_hours: number | null;
  is_duplicate_report: boolean | null;
  remarks: string | null;
  masked_mobile?: string;
  risk_flags?: string[];
  rank_score?: number;
}

export interface LiveCase {
  id: string;
  source: string;
  source_detail: string | null;
  reported_at: string;
  case_type: string | null;
  status: string;
  priority: string | null;
  missing_person_name: string | null;
  gender: string | null;
  age_band: string | null;
  state: string | null;
  district: string | null;
  language: string | null;
  last_seen_location: string | null;
  zone_name: string | null;
  reporter_mobile: string | null;
  physical_description: string | null;
  raw_report: string | null;
  structured_data: Record<string, unknown> | null;
  private_verification_clues: string[] | null;
  risk_flags: string[] | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface VolunteerTask {
  id: string;
  case_id: string | null;
  official_case_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: string;
  priority: string | null;
  zone_name: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseUpdate {
  id: string;
  case_id: string | null;
  official_case_id: string | null;
  update_type: string;
  note: string | null;
  actor: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface DuplicateReview {
  id: string;
  primary_case_id: string;
  candidate_case_id: string;
  primary_source: string | null;
  candidate_source: string | null;
  score: number | null;
  reasons: string[] | null;
  review_status: string;
  reviewer: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrustCheckReport {
  id: string;
  source: string | null;
  reporter_mobile: string | null;
  raw_message: string | null;
  extracted_phone: string | null;
  extracted_upi_vpa: string | null;
  extracted_payee_name: string | null;
  extracted_amount: number | null;
  claimed_entity_name: string | null;
  risk_level: string | null;
  reasons: string[] | null;
  matched_verified_entity: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  pii_accessed: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ZoneSummary {
  zone_name: string;
  centroid_lat: number;
  centroid_lng: number;
  camera_count: number;
  live_case_count: number;
  critical_live_case_count: number;
  open_task_count: number;
}

export type NavSection =
  | "overview"
  | "search"
  | "live-cases"
  | "vulnerable"
  | "map"
  | "zones"
  | "trust-check"
  | "tasks"
  | "audit";
