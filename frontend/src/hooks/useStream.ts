import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getUseMocks } from '../api/client';
import { mockReplaySim } from '../api/mockReplaySim';
import { useUI } from '../context/UIContext';
import type {
  Run,
  Finding,
  RunsResponse,
  LatestFindingResponse,
  DemoProgressEvent,
} from '../api/types';

export function useStream(projectId = 'demo-app', branch = 'main') {
  const queryClient = useQueryClient();
  const { setReplayProgress, setPanelOpen } = useUI();
  const [connected, setConnected] = useState<boolean>(false);
  const [useMocksState, setUseMocksState] = useState<boolean>(getUseMocks());

  useEffect(() => {
    const handleToggle = (e: any) => {
      setUseMocksState(e.detail.useMocks);
    };
    window.addEventListener('buildcliff:mock-toggle', handleToggle);
    return () => window.removeEventListener('buildcliff:mock-toggle', handleToggle);
  }, []);

  useEffect(() => {
    if (useMocksState) {
      setConnected(true);

      const unsubs = [
        mockReplaySim.on('run.created', (newRun: Run) => {
          queryClient.setQueryData<RunsResponse>(['runs', projectId, branch], (old) => {
            if (!old) return { project_id: projectId, branch, count: 1, runs: [newRun] };
            if (old.runs.some((r) => r.run_id === newRun.run_id)) return old;
            return {
              ...old,
              count: old.runs.length + 1,
              runs: [...old.runs, newRun],
            };
          });
        }),

        mockReplaySim.on('finding.created', (newFinding: Finding) => {
          queryClient.setQueryData<LatestFindingResponse>(['finding', 'latest', projectId, undefined], {
            project_id: projectId,
            has_active_regression: true,
            finding: newFinding,
          });
          queryClient.setQueryData<Finding>(['finding', newFinding.finding_id], newFinding);
          setPanelOpen(true);
        }),

        mockReplaySim.on('finding.updated', (updatedFinding: Finding | null) => {
          queryClient.setQueryData<LatestFindingResponse>(['finding', 'latest', projectId, undefined], {
            project_id: projectId,
            has_active_regression: Boolean(updatedFinding),
            finding: updatedFinding,
          });
          if (updatedFinding) {
            queryClient.setQueryData<Finding>(['finding', updatedFinding.finding_id], updatedFinding);
          }
        }),

        mockReplaySim.on('demo.progress', (progress: DemoProgressEvent) => {
          setReplayProgress(progress);
          if (progress.step_index >= progress.total_steps) {
            setTimeout(() => setReplayProgress(null), 2500);
          }
        }),

        mockReplaySim.on('demo.reset', () => {
          setReplayProgress(null);
          queryClient.invalidateQueries({ queryKey: ['runs'] });
          queryClient.invalidateQueries({ queryKey: ['finding'] });
          queryClient.invalidateQueries({ queryKey: ['impacts'] });
        }),

        mockReplaySim.on('impacts.updated', () => {
          queryClient.invalidateQueries({ queryKey: ['impacts'] });
        }),
      ];

      return () => {
        unsubs.forEach((unsub) => unsub());
      };
    }

    // Live mode with real EventSource
    let es: EventSource | null = null;
    let cancelled = false;

    try {
      es = new EventSource(`/api/stream?project_id=${encodeURIComponent(projectId)}`);

      es.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      es.onerror = () => {
        if (!cancelled) setConnected(false);
      };

      es.addEventListener('run.created', (e) => {
        try {
          const newRun: Run = JSON.parse(e.data);
          queryClient.setQueryData<RunsResponse>(['runs', projectId, branch], (old) => {
            if (!old) return { project_id: projectId, branch, count: 1, runs: [newRun] };
            if (old.runs.some((r) => r.run_id === newRun.run_id)) return old;
            return {
              ...old,
              count: old.runs.length + 1,
              runs: [...old.runs, newRun],
            };
          });
        } catch (err) {
          console.error('[SSE] Error parsing run.created:', err);
        }
      });

      es.addEventListener('finding.created', (e) => {
        try {
          const newFinding: Finding = JSON.parse(e.data);
          queryClient.setQueryData<LatestFindingResponse>(['finding', 'latest', projectId, undefined], {
            project_id: projectId,
            has_active_regression: true,
            finding: newFinding,
          });
          queryClient.setQueryData<Finding>(['finding', newFinding.finding_id], newFinding);
          setPanelOpen(true);
        } catch (err) {
          console.error('[SSE] Error parsing finding.created:', err);
        }
      });

      es.addEventListener('finding.updated', (e) => {
        try {
          const updatedFinding: Finding = JSON.parse(e.data);
          queryClient.setQueryData<LatestFindingResponse>(['finding', 'latest', projectId, undefined], {
            project_id: projectId,
            has_active_regression: true,
            finding: updatedFinding,
          });
          queryClient.setQueryData<Finding>(['finding', updatedFinding.finding_id], updatedFinding);
        } catch (err) {
          console.error('[SSE] Error parsing finding.updated:', err);
        }
      });

      es.addEventListener('demo.progress', (e) => {
        try {
          const progress: DemoProgressEvent = JSON.parse(e.data);
          setReplayProgress(progress);
          if (progress.step_index >= progress.total_steps) {
            setTimeout(() => setReplayProgress(null), 2500);
          }
        } catch (err) {
          console.error('[SSE] Error parsing demo.progress:', err);
        }
      });

      es.addEventListener('demo.reset', () => {
        setReplayProgress(null);
        queryClient.invalidateQueries({ queryKey: ['runs'] });
        queryClient.invalidateQueries({ queryKey: ['finding'] });
        queryClient.invalidateQueries({ queryKey: ['impacts'] });
      });

      es.addEventListener('impacts.updated', () => {
        queryClient.invalidateQueries({ queryKey: ['impacts'] });
      });
    } catch (err) {
      setConnected(false);
    }

    return () => {
      cancelled = true;
      if (es) {
        es.close();
      }
    };
  }, [projectId, branch, useMocksState, queryClient, setReplayProgress, setPanelOpen]);

  return { connected };
}

