import { generateExplanation } from './llm.mjs';

// A's engines share one Db handle. Deduplicate paid work across those factories
// without introducing a separate broker or persisting transient process state.
const workers = new WeakMap();

export function createExplanationWorker({ db, emit = () => {}, llm = {} }) {
  if (!workers.has(db)) workers.set(db, { jobs: new Map(), failure: null });
  const state = workers.get(db);
  const findings = db.collection('findings');

  function schedule(finding, topCommit) {
    if (finding._id === undefined || finding._id === null) throw new TypeError('Explanation work requires a persisted finding identity');
    const key = String(finding._id);
    if (state.jobs.has(key)) return false;
    const job = (async () => {
      // Ignore work deleted or completed since it was queued. The original _id,
      // not the reusable finding_id, identifies this particular replay instance.
      const current = await findings.findOne({ _id: finding._id, llm: null });
      if (!current) return;
      const commit = topCommit === undefined && current.culprit_sha
        ? await db.collection('commits').findOne({ project_id: current.project_id, sha: current.culprit_sha })
        : topCommit ?? null;
      const explanation = await generateExplanation(current, commit, llm);
      const updated = await findings.findOneAndUpdate(
        { _id: current._id, llm: null },
        { $set: { llm: explanation } },
        { returnDocument: 'after', projection: { _id: 0 } },
      );
      if (updated) await emit('finding.updated', updated);
    })();
    state.jobs.set(key, job);
    const cleanup = () => { if (state.jobs.get(key) === job) state.jobs.delete(key); };
    job.then(cleanup, error => {
      cleanup();
      // Keep one error until a caller drains the worker, rather than retaining
      // an unbounded failure history or hiding persistence/publication errors.
      state.failure ??= { error };
      console.error('Background explanation failed', {
        finding_id: finding.finding_id, error: error?.name ?? 'Error', code: error?.code ?? null,
      });
    });
    return true;
  }

  async function resume(project_id) {
    const query = { llm: null, ...(project_id === undefined ? {} : { project_id }) };
    const unfinished = await findings.find(query).toArray();
    let scheduled = 0;
    for (const finding of unfinished) if (schedule(finding)) scheduled++;
    return scheduled;
  }

  async function drain() {
    while (state.jobs.size) await Promise.allSettled([...state.jobs.values()]);
    const failure = state.failure;
    state.failure = null;
    if (failure) throw failure.error;
  }

  return { schedule, resume, drain };
}
