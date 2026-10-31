import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import type { RunsResponse } from '../api/types';

export function useRuns(projectId = 'demo-app', branch = 'main') {
  return useQuery<RunsResponse>({
    queryKey: ['runs', projectId, branch],
    queryFn: () => client.getRuns(projectId, branch),
    staleTime: Infinity,
    retry: 1,
  });
}

