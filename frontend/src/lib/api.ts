import type { AnalyzeWorkoutResponse, BodySchemaResponse, GenerateWorkoutResponse, HealthResponse, ParseWorkoutResponse, WorkoutGenerationSource } from '../types';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

function buildUrl(path: string) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const errorBody = (await response.json()) as { detail?: string };
      if (errorBody.detail) {
        message = errorBody.detail;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function getBodySchema(): Promise<BodySchemaResponse> {
  return request<BodySchemaResponse>('/api/body-schema');
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

export function parseWorkout(text: string): Promise<ParseWorkoutResponse> {
  return request<ParseWorkoutResponse>('/api/parse-workout', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
}

export function analyzeWorkout(text: string): Promise<AnalyzeWorkoutResponse> {
  return request<AnalyzeWorkoutResponse>('/api/analyze-workout', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
}

export function generateWorkout(workouts: WorkoutGenerationSource[], metricMode: 'load' | 'endurance', guidance?: string): Promise<GenerateWorkoutResponse> {
  return request<GenerateWorkoutResponse>('/api/generate-workout', {
    method: 'POST',
    body: JSON.stringify({
      workouts,
      metric_mode: metricMode,
      guidance: guidance?.trim() || undefined
    })
  });
}
