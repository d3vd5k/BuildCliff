import { round } from './math.mjs';
import { notFound } from './errors.mjs';

const DEFAULT_ASSUMPTIONS = {
  runner_cost_per_min_usd: 0.008,
  engineer_cost_per_hour_usd: 60,
  blocking_fraction: 0.5,
};

export function calculateCost(delta_ms, runs_per_week, assumptions = {}) {
  const rates = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const hours = delta_ms * runs_per_week / 3_600_000;
  const waitingHours = hours * rates.blocking_fraction;
  const engineerCost = waitingHours * rates.engineer_cost_per_hour_usd;
  const runnerCost = hours * 60 * rates.runner_cost_per_min_usd;
  return {
    runs_per_week,
    extra_ci_hours_per_week: round(hours),
    engineer_wait_hours_per_week: round(waitingHours),
    engineer_cost_usd_per_week: round(engineerCost),
    runner_cost_usd_per_week: round(runnerCost),
    total_cost_usd_per_week: round(engineerCost + runnerCost),
    recovered_hours_per_week_if_reverted: round(hours),
    assumptions: rates,
  };
}

export function createCosts({ db, emit = () => {} }) {
  async function project(project_id) {
    const result = await db.collection('projects').findOne({ project_id }, { projection: { _id: 0 } });
    if (!result) notFound('project', project_id);
    return result;
  }

  async function frequency(project_id) {
    const now = new Date();
    const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    return await db.collection('runs').countDocuments({
      project_id,
      started_at: { $gte: since, $lte: now },
    }) / 2;
  }

  async function getRunsPerWeek(project_id) {
    await project(project_id);
    return frequency(project_id);
  }

  async function recomputeCosts(project_id) {
    const currentProject = await project(project_id);
    const runsPerWeek = await frequency(project_id);
    const findings = await db.collection('findings').find(
      { project_id, status: 'active' },
      { projection: { _id: 0 } },
    ).toArray();
    let updated = 0;
    for (const finding of findings) {
      const cost = calculateCost(finding.delta_ms, runsPerWeek, currentProject.assumptions);
      const updatedFinding = await db.collection('findings').findOneAndUpdate(
        { finding_id: finding.finding_id, project_id, status: 'active' },
        { $set: { cost } },
        { returnDocument: 'after', projection: { _id: 0 } },
      );
      if (updatedFinding) {
        updated += 1;
        await emit('finding.updated', updatedFinding);
      }
    }
    return updated;
  }

  return { getRunsPerWeek, recomputeCosts };
}
