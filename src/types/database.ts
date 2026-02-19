/**
 * Hand-maintained Supabase database types.
 * In production, replace this with `supabase gen types typescript --local`
 * and commit the generated output.
 */

export type IssueCategory =
  | 'water'
  | 'heat'
  | 'pests'
  | 'mold'
  | 'structural'
  | 'electrical'
  | 'security'
  | 'sanitation'
  | 'other';

export type IssueStatus = 'open' | 'landlord_notified' | 'in_repair' | 'resolved' | 'escalated';

export type CommDirection = 'sent' | 'received';

export type CommMethod = 'email' | 'text' | 'call' | 'letter' | 'in_person';

export type SyncStatus = 'pending_insert' | 'pending_update' | 'synced';

// -------------------------------------------------------
// Row shapes (what you get back from Supabase)
// -------------------------------------------------------

export interface Profile {
  id: string;
  display_name: string | null;
  expo_push_token: string | null;
  jurisdiction: string;
  created_at: string;
  updated_at: string;
}

export interface Building {
  id: string;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** PostGIS geometry stored as GeoJSON when fetched via RPC */
  geom?: unknown;
  created_at: string;
}

export interface Issue {
  id: string;
  user_id: string;
  building_id: string | null;
  category: IssueCategory;
  status: IssueStatus;
  description: string | null;
  first_reported_at: string;
  landlord_notified_at: string | null;
  legal_deadline_days: number | null;
  legal_deadline_at: string | null;
  local_id: string | null;
  client_updated_at: string;
  created_at: string;
}

export interface Photo {
  id: string;
  issue_id: string;
  user_id: string;
  storage_path: string;
  watermarked_path: string | null;
  taken_at: string;
  latitude: number | null;
  longitude: number | null;
  photo_hash: string;
  local_id: string | null;
  created_at: string;
}

export interface Communication {
  id: string;
  issue_id: string;
  user_id: string;
  direction: CommDirection;
  method: CommMethod;
  summary: string;
  occurred_at: string;
  local_id: string | null;
  created_at: string;
}

export interface HeatmapCell {
  lat: number;
  lng: number;
  category: IssueCategory;
  report_count: number;
}

// -------------------------------------------------------
// Insert payloads (omit server-generated fields)
// -------------------------------------------------------

export type IssueInsert = Omit<Issue, 'id' | 'created_at'>;
export type PhotoInsert = Omit<Photo, 'id' | 'created_at'>;
export type CommunicationInsert = Omit<Communication, 'id' | 'created_at'>;
export type BuildingInsert = Omit<Building, 'id' | 'created_at'>;

// -------------------------------------------------------
// Local SQLite row shapes (add sync columns)
// -------------------------------------------------------

export interface LocalIssue extends Issue {
  sync_status: SyncStatus;
}

export interface LocalPhoto extends Photo {
  sync_status: SyncStatus;
  /** Absolute local file path to raw (un-uploaded) photo */
  local_path: string | null;
  /** Links photo to a specific timeline update entry; NULL = initial report photo */
  update_local_id: string | null;
}

export type IssueUpdateEventType = 'update' | 'status_change';

export interface IssueUpdate {
  id: string;
  local_id: string | null;
  issue_id: string;
  issue_local_id: string;
  user_id: string;
  event_type: IssueUpdateEventType;
  note: string | null;
  status_value: IssueStatus | null;
  created_at: string;
}

// issue_local_id is a local SQLite–only field; it is never sent to Supabase
export type IssueUpdateInsert = Omit<IssueUpdate, 'id' | 'issue_local_id'>;

export interface LocalIssueUpdate extends IssueUpdate {
  sync_status: SyncStatus;
}

export interface LocalCommunication extends Communication {
  sync_status: SyncStatus;
}

// -------------------------------------------------------
// Supabase Database schema type (for typed client)
// -------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id'>>;
      };
      buildings: {
        Row: Building;
        Insert: BuildingInsert;
        Update: Partial<BuildingInsert>;
      };
      issues: {
        Row: Issue;
        Insert: IssueInsert;
        Update: Partial<IssueInsert>;
      };
      photos: {
        Row: Photo;
        Insert: PhotoInsert;
        Update: Partial<PhotoInsert>;
      };
      communications: {
        Row: Communication;
        Insert: CommunicationInsert;
        Update: Partial<CommunicationInsert>;
      };
    };
    Functions: {
      get_heatmap_data: {
        Args: {
          center_lat: number;
          center_lng: number;
          radius_km?: number;
        };
        Returns: HeatmapCell[];
      };
    };
  };
}
