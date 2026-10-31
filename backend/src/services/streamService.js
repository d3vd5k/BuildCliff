// SSE stream service (contract section 5 & 6).
// Manages connected SSE clients, broadcasts events, and watches the `runs`
// and `findings` collections via change streams for automatic run.created /
// finding.created / finding.updated events. B calls emit() for impacts.updated
// and any custom events. The demo service calls emit() for demo.progress/reset.

import { getDb } from '../db/index.js';
import { formatRun } from '../utils/formatters.js';

const HEARTBEAT_MS = 20000;

/** Connected SSE clients: { res, projectId }. */
const clients = new Set();
let heartbeatTimer = null;

/** Add a new SSE client connection. */
export function addClient(res, projectId) {
  clients.add({ res, projectId });
}

/** Remove a client by its response object (on disconnect). */
export function removeClient(res) {
  for (const client of clients) {
    if (client.res === res) {
      clients.delete(client);
      break;
    }
  }
}

export function clientCount() {
  return clients.size;
}

/**
 * Broadcast an SSE event to all connected clients (contract section 5/6).
 * @param {string} eventName - e.g. 'run.created', 'finding.updated', 'demo.progress'
 * @param {*} data - JSON-serialisable payload
 * @param {string} [dataProjectId] - project_id for filtering (falls back to data.project_id)
 */
export function emit(eventName, data, dataProjectId) {
  if (clients.size === 0) return;
  const projectId = dataProjectId || data?.project_id;
  const message = `event: ${eventName}\ndata: ${JSON.stringify(data ?? {})}\n\n`;
  for (const client of clients) {
    // If both the client and the event specify a project_id, they must match.
    if (client.projectId && projectId && client.projectId !== projectId) continue;
    try {
      client.res.write(message);
    } catch {
      // Client may have disconnected; remove silently.
      clients.delete(client);
    }
  }
}

/** Start the 20-second heartbeat comment line to all clients. */
function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const client of clients) {
      try {
        client.res.write(': ping\n\n');
      } catch {
        clients.delete(client);
      }
    }
  }, HEARTBEAT_MS);
}

/** Watch the runs collection for inserts → run.created. */
function watchRuns(db) {
  let stream;
  try {
    stream = db.collection('runs').watch([], { fullDocument: 'updateLookup' });
  } catch (err) {
    console.warn('[stream] cannot watch runs:', err.message);
    return;
  }
  stream.on('change', (change) => {
    if (change.operationType === 'insert' && change.fullDocument) {
      const run = change.fullDocument;
      emit('run.created', formatRun(run), run.project_id);
    }
  });
  stream.on('error', (err) => {
    console.error('[stream] runs change stream error:', err.message);
    setTimeout(() => watchRuns(db), 5000);
  });
}

/** Watch the findings collection for inserts/updates → finding.created/updated. */
function watchFindings(db) {
  let stream;
  try {
    stream = db.collection('findings').watch([], { fullDocument: 'updateLookup' });
  } catch (err) {
    console.warn('[stream] cannot watch findings:', err.message);
    return;
  }
  stream.on('change', (change) => {
    const doc = change.fullDocument;
    if (!doc) return;
    if (change.operationType === 'insert') {
      emit('finding.created', doc, doc.project_id);
    } else if (change.operationType === 'update' || change.operationType === 'replace') {
      emit('finding.updated', doc, doc.project_id);
    }
  });
  stream.on('error', (err) => {
    console.error('[stream] findings change stream error:', err.message);
    setTimeout(() => watchFindings(db), 5000);
  });
}

/**
 * Start the change stream watchers and heartbeat. Call once after connect().
 * Gracefully degrades if the deployment does not support change streams
 * (e.g. standalone Mongo) — the API stays functional, only live push stops.
 */
export function startChangeStreams() {
  const db = getDb();
  startHeartbeat();
  watchRuns(db);
  watchFindings(db);
  console.log('[stream] change stream watchers started');
}
