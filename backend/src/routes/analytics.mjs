import { EngineError, invalid } from '../engine/errors.mjs';

// Mount before A's not-found handler: if (await analytics(req, res)) return;
export function createAnalyticsHandler(engine) {
  return async function handleAnalytics(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    const known = path === '/api/findings' || path.startsWith('/api/findings/')
      || path === '/api/compare' || path === '/api/dependency-impacts';
    if (!known || request.method !== 'GET') return false;

    function send(status, body) {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(body));
    }

    try {
      const query = Object.fromEntries(url.searchParams);
      for (const [name, value] of Object.entries(query)) {
        if (!value.trim()) invalid(`Query parameter ${name} must not be empty`, name);
      }
      const options = { project_id: query.project_id ?? 'demo-app', branch: query.branch ?? 'main' };
      let body;
      if (path === '/api/findings') {
        body = await engine.listFindings({ ...options, status: query.status, step: query.step });
      } else if (path === '/api/findings/latest') {
        body = await engine.latestFinding({ ...options, step: query.step });
      } else if (path.startsWith('/api/findings/')) {
        let id;
        try { id = decodeURIComponent(path.slice('/api/findings/'.length)); }
        catch { invalid('Invalid URL-encoded finding ID', 'finding_id'); }
        body = await engine.getFinding(id);
      } else if (path === '/api/compare') {
        body = await engine.compare({ ...options, finding_id: query.finding_id, a: query.a, b: query.b });
      } else {
        body = await engine.listImpacts(options.project_id);
      }
      send(200, body);
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      send(error.status, { error: { code: error.code, message: error.message, field: error.field } });
    }
    return true;
  };
}
