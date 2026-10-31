import runsJson from '../../../mocks/runs.json';
import findingHighJson from '../../../mocks/finding_high.json';
import findingLowJson from '../../../mocks/finding_low.json';
import findingsLatestCleanJson from '../../../mocks/findings_latest_clean.json';
import compareJson from '../../../mocks/compare.json';
import impactsJson from '../../../mocks/dependency_impacts.json';
import projectJson from '../../../mocks/project.json';
import errorValidationJson from '../../../mocks/error_validation.json';

import type {
  RunsResponse,
  LatestFindingResponse,
  Finding,
  CompareResponse,
  DependencyImpactsResponse,
  ProjectInfo,
  Assumptions,
} from './types';
import { mockReplaySim } from './mockReplaySim';

const delay = (ms: number = 200) => new Promise((res) => setTimeout(res, ms));

// Deep clone to prevent mutations across calls
const clone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

let storedAssumptions: Assumptions = {
  runner_cost_per_min_usd: 0.008,
  engineer_cost_per_hour_usd: 60,
  blocking_fraction: 0.5,
};

let currentConfidenceVariant: 'High' | 'Low' | 'Clean' = 'High';

export const mockAdapter = {
  setConfidenceVariant(variant: 'High' | 'Low' | 'Clean') {
    currentConfidenceVariant = variant;
    if (variant === 'Clean') {
      mockReplaySim.clearActiveFinding();
    } else if (variant === 'Low') {
      mockReplaySim.setActiveFinding(clone(findingLowJson as unknown as Finding));
    } else {
      mockReplaySim.setActiveFinding(clone(findingHighJson as unknown as Finding));
    }
  },

  getConfidenceVariant(): 'High' | 'Low' | 'Clean' {
    return currentConfidenceVariant;
  },

  async getRuns(): Promise<RunsResponse> {
    await delay(200);
    const baseRuns = clone((runsJson as unknown as RunsResponse).runs);
    const replayed = mockReplaySim.getReplayedRuns();
    const all = [...baseRuns, ...replayed];
    return {
      project_id: 'demo-app',
      branch: 'main',
      count: all.length,
      runs: all,
    };
  },

  async getLatestFinding(_step?: string): Promise<LatestFindingResponse> {
    await delay(180);
    const finding = mockReplaySim.getActiveFinding();
    if (!finding) {
      return {
        project_id: 'demo-app',
        has_active_regression: false,
        finding: null,
      };
    }
    return {
      project_id: 'demo-app',
      has_active_regression: true,
      finding,
    };
  },

  async getFindings(_status?: string): Promise<{ project_id: string; count: number; findings: Finding[] }> {
    await delay(200);
    const finding = mockReplaySim.getActiveFinding();
    return {
      project_id: 'demo-app',
      count: finding ? 1 : 0,
      findings: finding ? [finding] : [],
    };
  },

  async getFinding(id: string): Promise<Finding> {
    await delay(150);
    const active = mockReplaySim.getActiveFinding();
    if (active && active.finding_id === id) {
      return active;
    }
    if (currentConfidenceVariant === 'Low') {
      return clone(findingLowJson as unknown as Finding);
    }
    return clone(findingHighJson as unknown as Finding);
  },

  async getCompare(params: { findingId?: string; a?: string; b?: string }): Promise<CompareResponse> {
    await delay(250);
    const base = clone(compareJson as unknown as CompareResponse);
    if (params.a && params.b) {
      base.mode = 'runs';
      base.a.label = params.a;
      base.a.run_ids = [params.a];
      base.b.label = params.b;
      base.b.run_ids = [params.b];
    }
    return base;
  },

  async getImpacts(): Promise<DependencyImpactsResponse> {
    await delay(200);
    return clone(impactsJson as unknown as DependencyImpactsResponse);
  },

  async getProject(): Promise<ProjectInfo> {
    await delay(150);
    const proj = clone(projectJson as unknown as ProjectInfo);
    proj.assumptions = { ...storedAssumptions };
    return proj;
  },

  async patchAssumptions(partial: Partial<Assumptions>): Promise<{ project_id: string; assumptions: Assumptions; findings_recomputed: number }> {
    await delay(250);
    storedAssumptions = { ...storedAssumptions, ...partial };
    mockReplaySim.updateAssumptions(storedAssumptions);
    return {
      project_id: 'demo-app',
      assumptions: storedAssumptions,
      findings_recomputed: 1,
    };
  },

  async replay(): Promise<{ status: string; total_steps: number; interval_ms: number }> {
    return mockReplaySim.startReplay();
  },

  async reset(): Promise<{ status: string; deleted: Record<string, number> }> {
    return mockReplaySim.reset();
  },
};
