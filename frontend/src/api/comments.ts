import apiClient from './axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Comment {
  id: string;
  incident_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface AddCommentPayload {
  body: string;
  is_internal: boolean;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchComments(incidentId: string): Promise<Comment[]> {
  const response = await apiClient.get<{ data: Comment[] }>(
    `/incidents/${incidentId}/comments`,
  );
  return response.data.data;
}

export async function addComment(
  incidentId: string,
  payload: AddCommentPayload,
): Promise<Comment> {
  const response = await apiClient.post<{ data: Comment }>(
    `/incidents/${incidentId}/comments`,
    payload,
  );
  return response.data.data;
}
