// Centralized error shape (contract section 4.1).
// Every non-2xx response uses this shape.

/**
 * Build the error body.
 * @param {string} code - VALIDATION_ERROR | NOT_FOUND | REPLAY_ALREADY_APPLIED | REPLAY_IN_PROGRESS | INTERNAL_ERROR
 * @param {string} message - Human-readable message
 * @param {string|null} field - Dotted path (e.g. "steps.2.duration_ms") or null
 */
export function makeError(code, message, field = null) {
  return { error: { code, message, field } };
}

/** HTTP status code for each error code (contract section 4.1). */
export function statusForCode(code) {
  switch (code) {
    case 'VALIDATION_ERROR': return 400;
    case 'NOT_FOUND': return 404;
    case 'REPLAY_ALREADY_APPLIED': return 409;
    case 'REPLAY_IN_PROGRESS': return 409;
    case 'INTERNAL_ERROR': return 500;
    default: return 500;
  }
}

/** Send an error response with the right status and shape. */
export function sendError(res, code, message, field = null) {
  return res.status(statusForCode(code)).json(makeError(code, message, field));
}
