import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import type { ProjectInfo, Assumptions } from '../api/types';

export function useProject(projectId = 'demo-app') {
  const queryClient = useQueryClient();

  const query = useQuery<ProjectInfo>({
    queryKey: ['project', projectId],
    queryFn: () => client.getProject(projectId),
    staleTime: Infinity,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: (partial: Partial<Assumptions>) => client.patchAssumptions(projectId, partial),
    onSuccess: (data) => {
      queryClient.setQueryData<ProjectInfo>(['project', projectId], (old) => {
        if (!old) return old;
        return { ...old, assumptions: data.assumptions };
      });
    },
  });

  return {
    ...query,
    updateAssumptions: mutation.mutateAsync,
    isUpdatingAssumptions: mutation.isPending,
  };
}

