import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import type { LatestFindingResponse, Finding } from '../api/types';

export function useLatestFinding(projectId = 'demo-app', step?: string) {
  return useQuery<LatestFindingResponse>({
    queryKey: ['finding', 'latest', projectId, step],
    queryFn: () => client.getLatestFinding(projectId, step),
    staleTime: Infinity,
    retry: 1,
  });
}

export function useFinding(id: string | null) {
  return useQuery<Finding>({
    queryKey: ['finding', id],
    queryFn: () => client.getFinding(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
    retry: 1,
  });
}

