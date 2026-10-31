import {dependencyMatchesStep} from './attribution.mjs';
import {percentile} from './math.mjs';

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

export function scoreConfidence({before, after, suspects, step}) {
  const baseline = before.filter(value => Number.isFinite(value) && value >= 0);
  const current = after.filter(value => Number.isFinite(value) && value >= 0);
  const reasons = [];
  const add = (code, label, polarity) => reasons.push({code, label, polarity});
  const threshold = baseline.length ? percentile(baseline, 0.75) : Infinity;
  const persistent = current.filter(value => value > threshold).length;
  const separated = baseline.length > 0 && current.length > 0 && Math.max(...baseline) < Math.min(...current);
  if (current.length >= 5 && persistent === current.length) {
    add('JUMP_PERSISTS', `Slow in ${persistent} of ${current.length} runs after the change`, 'positive');
  }
  if (separated) add('CLEAN_SEPARATION', 'Slowest baseline run is faster than the fastest new run', 'positive');
  if (baseline.length < 10) add('FEW_BASELINE_RUNS', `Only ${baseline.length} of 10 baseline runs available`, 'negative');
  const persistenceScore = current.length ? 60 * (persistent / current.length) * Math.min(1, current.length / 5) : 0;
  const separationScore = separated ? 25 : current.length && Math.min(...current) > threshold ? 15 : 0;
  const jump_score = baseline.length && current.length ? clamp(persistenceScore + separationScore + 15 * Math.min(1, baseline.length / 10)) : 0;

  let attribution_score = 0;
  let smallScoreMargin = false;
  if (!suspects.length) {
    add('NO_COMMIT_DATA', 'No commit data between the last good and first slow run', 'negative');
  } else {
    const top = suspects[0];
    const depMatch = (top.dep_changes ?? []).some(dep => dependencyMatchesStep(dep.name, step));
    attribution_score = top.score * 0.8;
    if (suspects.length === 1) {
      attribution_score += 10;
      add('SOLE_COMMIT', 'Only one commit in range', 'positive');
    } else {
      attribution_score -= Math.min(45, (suspects.length - 1) * 15);
      add('MULTIPLE_CANDIDATES', `${suspects.length} commits between the last good and first slow run`, 'negative');
      const margin = top.score - suspects[1].score;
      if (margin >= 20) {
        attribution_score += 10;
        add('LARGE_SCORE_MARGIN', `Top suspect leads the runner-up by ${margin} points`, 'positive');
      } else if (margin < 10) {
        smallScoreMargin = true;
        attribution_score -= 25;
        add('SMALL_SCORE_MARGIN', `Top two suspects score within ${margin} points`, 'negative');
      }
    }
    if (depMatch) {
      attribution_score += 8;
      add('DEP_MATCHES_STEP', `Dependency change matches the ${step} step`, 'positive');
    }
    attribution_score = clamp(attribution_score);
  }
  let score = clamp(jump_score * 0.35 + attribution_score * 0.65);
  // Strong evidence shared by near-tied candidates does not identify a cause.
  if (smallScoreMargin) score = Math.min(score, 44);
  // Attribution cannot substitute for an observed, confirmed timing change.
  if (baseline.length < 10 || current.length < 5) score = Math.min(score, 44);
  if (persistent !== current.length) score = Math.min(score, 74);
  if (!baseline.length || !current.length) score = 0;
  return {level: score >= 75 ? 'High' : score >= 45 ? 'Medium' : 'Low', score, jump_score, attribution_score, reasons};
}
