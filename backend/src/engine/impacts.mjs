import { notFound } from './errors.mjs';

// One shared database handle is used by the ingest hooks. Serialize rebuilds
// across engine factories so a stale-row sweep cannot erase another rebuild.
const queues = new WeakMap();

// Durations are nonnegative. Adding one half and flooring matches the engine's
// integer median rounding, including an even window whose median ends in .5.
function medianExpression(input, size) {
  return {
    $let: {
      vars: { sorted: { $sortArray: { input, sortBy: 1 } } },
      in: {
        $floor: {
          $add: [
            size % 2
              ? { $arrayElemAt: ['$$sorted', Math.floor(size / 2)] }
              : { $avg: [{ $arrayElemAt: ['$$sorted', size / 2 - 1] }, { $arrayElemAt: ['$$sorted', size / 2] }] },
            0.5,
          ],
        },
      },
    },
  };
}

function impactPipeline(project_id, branch, computed_at) {
  return [
    { $match: { project_id, 'dep_changes.0': { $exists: true } } },
    {
      $graphLookup: {
        from: 'commits',
        startWith: '$sha',
        connectFromField: 'sha',
        connectToField: 'parent',
        as: 'descendants',
        restrictSearchWithMatch: { project_id },
      },
    },
    { $set: { lineage: { $concatArrays: [['$sha'], '$descendants.sha'] } } },
    {
      $lookup: {
        from: 'runs',
        let: { lineage: '$lineage' },
        pipeline: [
          { $match: { project_id, branch, status: 'success', $expr: { $in: ['$commit_sha', '$$lineage'] } } },
          { $sort: { started_at: 1, run_id: 1 } },
          { $limit: 1 },
          { $project: { _id: 0, run_id: 1, started_at: 1 } },
        ],
        as: 'anchor',
      },
    },
    // Without a build of this commit (or a descendant), timestamps cannot
    // establish that the default branch ever used the changed dependency.
    { $match: { 'anchor.0': { $exists: true } } },
    {
      $lookup: {
        from: 'runs',
        let: {
          boundary: { $arrayElemAt: ['$anchor.started_at', 0] },
          boundaryRun: { $arrayElemAt: ['$anchor.run_id', 0] },
          lineage: '$lineage',
        },
        pipeline: [
          { $match: { project_id, branch, status: 'success' } },
          { $unwind: '$steps' },
          { $match: { $expr: { $eq: [{ $ifNull: ['$steps.status', 'success'] }, 'success'] } } },
          {
            $setWindowFields: {
              partitionBy: '$steps.name',
              sortBy: { started_at: 1, run_id: 1 },
              output: {
                before: { $push: '$steps.duration_ms', window: { documents: [-10, -1] } },
                after: { $push: '$steps.duration_ms', window: { documents: [0, 4] } },
              },
            },
          },
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $or: [
                      { $gt: ['$started_at', '$$boundary'] },
                      { $and: [{ $eq: ['$started_at', '$$boundary'] }, { $gte: ['$run_id', '$$boundaryRun'] }] },
                    ],
                  },
                  { $in: ['$commit_sha', '$$lineage'] },
                ],
              },
            },
          },
          { $sort: { started_at: 1, run_id: 1 } },
          // Choose the first post-commit run before requiring complete windows:
          // moving the anchor forward would manufacture a different comparison.
          { $group: { _id: '$steps.name', window: { $first: '$$ROOT' } } },
          { $replaceWith: '$window' },
          { $match: { $expr: { $and: [{ $eq: [{ $size: '$before' }, 10] }, { $eq: [{ $size: '$after' }, 5] }] } } },
          {
            $project: {
              _id: 0,
              step: '$steps.name',
              before_ms: medianExpression('$before', 10),
              after_ms: medianExpression('$after', 5),
            },
          },
          { $set: { delta_ms: { $subtract: ['$after_ms', '$before_ms'] } } },
          { $set: { absolute_delta: { $abs: '$delta_ms' } } },
          { $sort: { absolute_delta: -1, step: 1 } },
          { $limit: 1 },
        ],
        as: 'measurement',
      },
    },
    { $unwind: '$measurement' },
    { $unwind: '$dep_changes' },
    {
      $lookup: {
        from: 'findings',
        let: { sha: '$sha', step: '$measurement.step' },
        pipeline: [
          { $match: { project_id, branch, $expr: { $in: ['$$sha', { $ifNull: ['$suspects.sha', []] }] } } },
          { $set: { same_step: { $eq: ['$step', '$$step'] }, active: { $eq: ['$status', 'active'] } } },
          { $sort: { same_step: -1, active: -1, detected_at: -1, finding_id: 1 } },
          { $limit: 1 },
          { $project: { _id: 0, finding_id: 1 } },
        ],
        as: 'linked_finding',
      },
    },
    {
      $project: {
        _id: 0,
        impact_id: { $concat: ['$sha', ':', '$dep_changes.name'] },
        project_id: 1,
        dep: '$dep_changes.name',
        from: '$dep_changes.from',
        to: '$dep_changes.to',
        commit_sha: '$sha',
        step: '$measurement.step',
        before_ms: '$measurement.before_ms',
        after_ms: '$measurement.after_ms',
        delta_ms: '$measurement.delta_ms',
        delta_pct: {
          $cond: [
            { $eq: ['$measurement.before_ms', 0] },
            { $cond: [{ $eq: ['$measurement.after_ms', 0] }, 0, null] },
            { $divide: [{ $floor: { $add: [{ $multiply: [{ $divide: ['$measurement.delta_ms', '$measurement.before_ms'] }, 1000] }, 0.5] } }, 10] },
          ],
        },
        runs_compared: { $literal: { before: 10, after: 5 } },
        finding_id: { $ifNull: [{ $arrayElemAt: ['$linked_finding.finding_id', 0] }, null] },
        demo_replay: { $ifNull: ['$demo_replay', false] },
        computed_at: { $literal: computed_at },
      },
    },
    { $merge: { into: 'dependency_impacts', on: 'impact_id', whenMatched: 'replace', whenNotMatched: 'insert' } },
  ];
}

export function createImpacts({ db, emit = () => {} }) {
  if (!queues.has(db)) queues.set(db, new Map());
  const pending = queues.get(db);
  async function project(project_id) {
    const result = await db.collection('projects').findOne({ project_id }, { projection: { _id: 0 } });
    if (!result) notFound('project', project_id);
    return result;
  }

  async function rebuild(project_id) {
    const currentProject = await project(project_id);
    const impacts = db.collection('dependency_impacts');
    await impacts.createIndex({ impact_id: 1 }, { unique: true });
    const previous = await impacts.findOne({ project_id }, { sort: { computed_at: -1 } });
    const computed_at = new Date(Math.max(Date.now(), (previous?.computed_at?.getTime() ?? 0) + 1));
    await db.collection('commits').aggregate(
      impactPipeline(project_id, currentProject.default_branch ?? 'main', computed_at),
      { allowDiskUse: true },
    ).toArray();
    // $merge cannot remove bumps deleted by reset or windows made incomplete.
    await impacts.deleteMany({ project_id, computed_at: { $ne: computed_at } });
    const count = await impacts.countDocuments({ project_id });
    await emit('impacts.updated', { project_id, computed_at });
    return count;
  }

  function recomputeImpacts(project_id) {
    const previous = pending.get(project_id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => rebuild(project_id));
    pending.set(project_id, next);
    const cleanup = () => { if (pending.get(project_id) === next) pending.delete(project_id); };
    next.then(cleanup, cleanup);
    return next;
  }

  async function listImpacts(project_id) {
    await project(project_id);
    const impacts = await db.collection('dependency_impacts').find(
      { project_id }, { projection: { _id: 0 } },
    ).sort({ delta_ms: -1, impact_id: 1 }).toArray();
    const computed_at = impacts.reduce((latest, impact) => (
      !latest || impact.computed_at > latest ? impact.computed_at : latest
    ), null);
    return { project_id, computed_at, count: impacts.length, impacts };
  }

  return { recomputeImpacts, listImpacts };
}
