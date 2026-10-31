#!/usr/bin/env node

import {
  formatDuration,
  formatDelta,
  formatSha,
  formatPct,
  formatUsd,
  formatHours,
} from '@buildcliff/shared';

function parseArgs(args) {
  const options = {
    command: null,
    project: 'demo-app',
    step: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--project') {
      options.project = args[++i];
    } else if (arg.startsWith('--project=')) {
      options.project = arg.slice('--project='.length);
    } else if (arg === '--step') {
      options.step = args[++i];
    } else if (arg.startsWith('--step=')) {
      options.step = arg.slice('--step='.length);
    } else if (!arg.startsWith('-') && !options.command) {
      options.command = arg;
    }
  }

  return options;
}

function showHelp() {
  console.log(`Usage: buildcliff [command] [options]

Commands:
  why-slow            Explain why CI is slow (latest active regression)

Options:
  --project <id>      Project ID (default: demo-app)
  --step <name>       Filter by step name (e.g. install, build)
  --json              Output raw JSON from the API
  -h, --help          Show this help message

Environment:
  BUILDCLIFF_API_URL  API base URL (default: http://localhost:4000/api)

Exit codes:
  0                   Clean — no active regression found
  1                   Active regression found
  2                   Usage or network/API error
`);
}

function renderAsciiBreakdown(breakdown, targetStep) {
  if (!breakdown?.before_ms || !breakdown?.after_ms) return '';
  const steps = Object.keys({ ...breakdown.before_ms, ...breakdown.after_ms });
  if (steps.length === 0) return '';

  const maxVal = Math.max(
    ...steps.map((s) => Math.max(breakdown.before_ms[s] || 0, breakdown.after_ms[s] || 0)),
    1
  );
  const barWidth = 24;

  const lines = ['Step breakdown:'];
  for (const step of steps) {
    const b = breakdown.before_ms[step] || 0;
    const a = breakdown.after_ms[step] || 0;
    const marker = step === targetStep ? ' *' : '  ';
    const bBar = '█'.repeat(Math.round((b / maxVal) * barWidth));
    const aBar = '█'.repeat(Math.round((a / maxVal) * barWidth));
    lines.push(`${marker} ${step.padEnd(10)} before: [${bBar.padEnd(barWidth)}] ${formatDuration(b)}`);
    lines.push(`   ${' '.repeat(10)} after:  [${aBar.padEnd(barWidth)}] ${formatDuration(a)}`);
  }
  return lines.join('\n');
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.command !== 'why-slow') {
    if (options.command) {
      console.error(`Unknown command: ${options.command}`);
    }
    showHelp();
    process.exit(2);
  }

  const baseUrl = (process.env.BUILDCLIFF_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
  const params = new URLSearchParams({ project_id: options.project });
  if (options.step) params.set('step', options.step);

  const url = `${baseUrl}/findings/latest?${params.toString()}`;

  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    console.error(`Failed to connect to BuildCliff API at ${url}: ${err.message}`);
    process.exit(2);
  }

  if (!response.ok) {
    let errBody = '';
    try {
      const errJson = await response.json();
      errBody = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errBody = await response.text();
    }
    console.error(`API error (${response.status}): ${errBody}`);
    process.exit(2);
  }

  const data = await response.json();

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(data.has_active_regression ? 1 : 0);
  }

  if (!data.has_active_regression || !data.finding) {
    console.log(`Clean: no active regression found for project "${options.project}"${options.step ? ` in step "${options.step}"` : ''}.`);
    process.exit(0);
  }

  const f = data.finding;
  const culprit = f.suspects?.[0] || null;

  console.log('='.repeat(60));
  console.log(`BUILDCLIFF REGRESSION DETECTED: [${f.step.toUpperCase()}]`);
  console.log('='.repeat(60));
  console.log(`Timing:     ${formatDuration(f.before_ms)} -> ${formatDuration(f.after_ms)} (${formatDelta(f.delta_ms)}, ${formatPct(f.delta_pct)})`);
  console.log(`Status:     ${f.status} (detected ${new Date(f.detected_at).toLocaleString()})`);

  if (culprit) {
    const authorStr = culprit.author ? ` (${culprit.author})` : '';
    console.log(`Culprit:    ${formatSha(culprit.sha)}${authorStr} - ${culprit.message || 'No commit message'}`);
    if (culprit.dep_changes?.length) {
      for (const dep of culprit.dep_changes) {
        console.log(`            Bumped: ${dep.name} ${dep.from} -> ${dep.to}`);
      }
    }
  } else {
    console.log(`Culprit:    ${formatSha(f.culprit_sha)}`);
  }

  console.log(`Confidence: ${f.confidence?.level || 'Unknown'} (score ${f.confidence?.score ?? '—'})`);
  if (f.confidence?.reasons?.length) {
    for (const r of f.confidence.reasons) {
      const chip = r.polarity === 'positive' ? '[✓]' : '[!]';
      console.log(`  ${chip} ${r.label}`);
    }
  }

  if (f.confidence?.level === 'Low' && f.suspects?.length > 1) {
    console.log('\nRanked suspects (Low confidence attribution):');
    for (const s of f.suspects) {
      console.log(`  #${s.rank} [score ${s.score}] ${formatSha(s.sha)} (${s.author || '—'}): ${s.message || '—'}`);
    }
  }

  if (f.cost) {
    const total = formatUsd(f.cost.total_cost_usd_per_week);
    const waitH = formatHours(f.cost.engineer_wait_hours_per_week);
    const engRate = formatUsd(f.cost.assumptions?.engineer_cost_per_hour_usd || 60);
    const runH = formatHours(f.cost.extra_ci_hours_per_week);
    const runRate = formatUsd(f.cost.assumptions?.runner_cost_per_min_usd || 0.008);
    console.log(`\nCost:       ${total}/week`);
    console.log(`  Engineer waiting: ${waitH} @ ${engRate}/h`);
    console.log(`  Runner compute:   ${runH} @ ${runRate}/min`);
  }

  const breakdownAscii = renderAsciiBreakdown(f.breakdown, f.step);
  if (breakdownAscii) {
    console.log(`\n${breakdownAscii}`);
  }

  if (f.llm) {
    console.log('\nSuggested Fix:');
    console.log(`  ${f.llm.suggested_fix}`);
    console.log('\nSummary:');
    console.log(`  ${f.llm.channel_summary}`);
    console.log(`  (source: ${f.llm.source || 'template'})`);
  } else {
    console.log('\nExplanation: pending generation...');
  }
  console.log('='.repeat(60));

  process.exit(1);
}

run().catch((err) => {
  console.error('[cli error]', err);
  process.exit(2);
});
