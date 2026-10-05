import apiClient from './axios';

// ---------------------------------------------------------------------------
// Types — mirror the backend Prisma enums and response shapes
// ---------------------------------------------------------------------------

export type IncidentStatus =
  | 'Open'
  | 'In_Progress'
  | 'On_Hold'
  | 'Resolved'
  | 'Closed';

export type IncidentPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type IncidentCategory =
  | 'Hardware'
  | 'Software'
  | 'Network'
  | 'Access_Permissions'
  | 'Email_Communication'
  | 'Other';

export interface Incident {
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  priority: IncidentPriority;
  status: IncidentStatus;
  submitter_id: string;
  assigned_to: string | null;
  assigned_at: string | null;
  attachment_info: unknown | null;
  ai_suggestions: unknown | null;
  resolution_detail: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface PaginationMeta {
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface IncidentListResponse {
  data: Incident[];
  pagination: PaginationMeta;
}

export interface IncidentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: IncidentStatus | '';
  category?: IncidentCategory | '';
  priority?: IncidentPriority | '';
  sort_by?: 'created_at' | 'updated_at' | 'priority';
  sort_order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchIncidents(
  params: IncidentListParams,
): Promise<IncidentListResponse> {
  // Strip empty string values so they are not sent as query params
  const clean: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined && value !== null) {
      clean[key] = value as string | number;
    }
  }

  const response = await apiClient.get<IncidentListResponse>('/incidents', {
    params: clean,
  });
  return response.data;
}
