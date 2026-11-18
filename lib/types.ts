export type ReportCategory = "grabbed" | "followed" | "verbal" | "other";
export type ClusterStatus = "open" | "acknowledged" | "closed";
export type WalkStatus = "active" | "arrived" | "help" | "cancelled";

export type Report = {
  id: string;
  category: ReportCategory;
  lat: number;
  lng: number;
  details: string | null;
  is_anonymous: boolean;
  wants_formal_report: boolean;
  cluster_id: string | null;
  is_demo: boolean;
  created_at: string;
};

export type Cluster = {
  id: string;
  status: ClusterStatus;
  lat: number;
  lng: number;
  report_count: number;
  first_report_at: string;
  last_report_at: string;
  assigned_to: string | null;
  created_at: string;
};

export type ClusterEvent = {
  id: string;
  cluster_id: string;
  actor_id: string | null;
  kind: "created" | "report_added" | "acknowledged" | "assigned" | "note" | "closed" | "reopened" | "alert_sent";
  note: string | null;
  created_at: string;
};

export type Alert = {
  id: string;
  cluster_id: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  message: string;
  created_at: string;
  expires_at: string;
};

export type Walk = {
  id: string;
  destination: string;
  start_lat: number | null;
  start_lng: number | null;
  last_lat: number | null;
  last_lng: number | null;
  expected_by: string;
  status: WalkStatus;
  created_at: string;
  ended_at: string | null;
  mode?: "solo" | "together" | "shared";
  companion_name?: string | null;
  request_id?: string | null;
  feedback?: "good" | "not_good" | null;
};

export type Visibility = "all" | "women" | "institution" | "hidden";

export type Profile = {
  user_id: string;
  account_type: "individual" | "organisation";
  full_name: string;
  gender: string | null;
  age: number | null;
  contact_number: string | null;
  address: string | null;
  location_permission: "always" | "while_using" | null;
  is_student: boolean;
  institution: string | null;
  organisation_type: string | null;
  contact_person: string | null;
  visibility: Visibility;
  walk_visible: boolean;
  approved: boolean;
};

export type NearbyWalker = {
  user_id: string;
  first_name: string;
  initials: string;
  destination: string;
  minutes_away: number;
};

export type WalkRequestStatus = "pending" | "accepted" | "declined" | "cancelled" | "started" | "ended";

export type WalkRequest = {
  id: string;
  from_user: string;
  to_user: string;
  from_name: string;
  to_name: string;
  destination: string;
  minutes_away: number | null;
  meeting_point: string | null;
  status: WalkRequestStatus;
  created_at: string;
  updated_at: string;
};

export type TrustedContact = { id: string; name: string; phone: string };
export type Block = { blocked_id: string; blocked_name: string };

export type FormalRequest = {
  id: string;
  report_id: string;
  full_name: string;
  contact: string;
  preferred_contact: "phone" | "email" | "either";
  statement: string | null;
  support_person: boolean;
  created_at: string;
};

export type StudentConcern = {
  id: string;
  reported_name: string;
  reason: string;
  details: string | null;
  created_at: string;
};

/** A short reference a student can quote to security, e.g. "3F9A-12C0". */
export function reportRef(id: string) {
  const s = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  grabbed: "Grabbed or touched",
  followed: "Followed",
  verbal: "Verbal harassment",
  other: "Something else",
};
