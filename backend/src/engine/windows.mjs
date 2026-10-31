export const BASELINE_WINDOW = 10;
export const CONFIRM_WINDOW = 5;
export const MIN_JUMP_MS = 20_000;
export const MIN_JUMP_PCT = 25;

// Exact, interpolated percentiles: MongoDB's approximate $median can change a
// threshold decision on these small windows. $sortArray requires MongoDB 5.2+.
function mongoPercentile(input, fraction) {
  return {
    $let: {
      vars: { values: { $sortArray: { input, sortBy: 1 } } },
      in: {
        $let: {
          vars: { index: { $multiply: [{ $subtract: [{ $size: '$$values' }, 1] }, fraction] } },
          in: {
            $add: [
              { $arrayElemAt: ['$$values', { $floor: '$$index' }] },
              { $multiply: [
                { $subtract: [
                  { $arrayElemAt: ['$$values', { $ceil: '$$index' }] },
                  { $arrayElemAt: ['$$values', { $floor: '$$index' }] },
                ] },
                { $subtract: ['$$index', { $floor: '$$index' }] },
              ] },
            ],
          },
        },
      },
    },
  };
}

export function buildWindowPipeline({ project_id, branch }) {
  const entry = {
    run_id: '$run_id', commit_sha: '$commit_sha', started_at: '$started_at',
    duration_ms: '$duration_ms', demo_replay: '$demo_replay',
  };
  return [
    { $match: { project_id, ...(branch === undefined ? {} : { branch }), status: 'success' } },
    { $unwind: '$steps' },
    { $match: { 'steps.status': { $nin: ['failed', 'skipped'] } } },
    { $project: {
      _id: 0, project_id: 1, branch: 1, run_id: 1, commit_sha: 1, started_at: 1,
      demo_replay: { $ifNull: ['$demo_replay', false] },
      step: '$steps.name', duration_ms: '$steps.duration_ms',
    } },
    { $setWindowFields: {
      partitionBy: { project_id: '$project_id', branch: '$branch', step: '$step' },
      sortBy: { started_at: 1, run_id: 1 },
      output: {
        ordinal: { $sum: 1, window: { documents: ['unbounded', 'current'] } },
        before: { $push: entry, window: { documents: [-BASELINE_WINDOW, -1] } },
        after: { $push: entry, window: { documents: [0, CONFIRM_WINDOW - 1] } },
      },
    } },
  ];
}

export function buildDetectionPipeline(options) {
  return [
    ...buildWindowPipeline(options),
    { $match: { $expr: { $and: [
      { $eq: [{ $size: '$before' }, BASELINE_WINDOW] },
      { $eq: [{ $size: '$after' }, CONFIRM_WINDOW] },
    ] } } },
    { $set: {
      before_ms: mongoPercentile('$before.duration_ms', 0.5),
      after_ms: mongoPercentile('$after.duration_ms', 0.5),
      baseline_p75: mongoPercentile('$before.duration_ms', 0.75),
      after_min: { $min: '$after.duration_ms' },
    } },
    { $match: { $expr: { $and: [
      { $gte: [{ $subtract: ['$after_ms', '$before_ms'] }, MIN_JUMP_MS] },
      { $gte: ['$after_ms', { $multiply: ['$before_ms', 1 + MIN_JUMP_PCT / 100] }] },
      { $gt: ['$after_min', '$baseline_p75'] },
    ] } } },
    { $sort: { branch: 1, step: 1, ordinal: 1 } },
  ];
}
