import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import type { DependencyImpactsResponse } from '../api/types';

export function useImpacts(projectId = 'demo-app') {
  return useQuery<DependencyImpactsResponse>({
    queryKey: ['impacts', projectId],
    queryFn: () => client.getImpacts(projectId),
    staleTime: Infinity,
    retry: 1,
  });
}

