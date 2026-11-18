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
};

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  grabbed: "Grabbed or touched",
  followed: "Followed",
  verbal: "Verbal harassment",
  other: "Something else",
};
