export function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function median(values) {
  return percentile(values, 0.5);
}

export function deltaPct(before, after) {
  if (before === 0) return after === 0 ? 0 : null;
  return round(((after - before) / before) * 100, 1);
}

export function breakdown(runs) {
  const steps = new Map();
  for (const run of runs) {
    for (const step of run.steps) {
      if (step.status && step.status !== 'success') continue;
      if (!steps.has(step.name)) steps.set(step.name, []);
      steps.get(step.name).push(step.duration_ms);
    }
  }
  return Object.fromEntries([...steps].map(([name, values]) => [name, Math.round(median(values))]));
}
