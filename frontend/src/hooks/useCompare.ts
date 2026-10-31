import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import type { CompareResponse } from '../api/types';

export function useCompare(params: { findingId?: string; a?: string; b?: string }) {
  return useQuery<CompareResponse>({
    queryKey: ['compare', params],
    queryFn: () => client.getCompare(params),
    staleTime: Infinity,
    retry: 1,
  });
}

