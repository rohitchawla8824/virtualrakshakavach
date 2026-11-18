const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}
