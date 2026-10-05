import apiClient from './axios';

// ---------------------------------------------------------------------------
// Types — mirror the backend DashboardMetrics shape
// ---------------------------------------------------------------------------

export interface StatusCount {
  status: string;
  count: number;
}

export interface PriorityCount {
  priority: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface DashboardMetrics {
  total_incidents: number;
  by_status: StatusCount[];
  by_priority: PriorityCount[];
  by_category: CategoryCount[];
  unassigned_open_count: number;
  avg_seconds_to_in_progress: number | null;
}

// ---------------------------------------------------------------------------
// API function
// ---------------------------------------------------------------------------

export async function fetchDashboard(): Promise<DashboardMetrics> {
  const response = await apiClient.get<{ data: DashboardMetrics }>('/dashboard');
  return response.data.data;
}
