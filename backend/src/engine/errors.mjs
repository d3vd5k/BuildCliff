export class EngineError extends Error {
  constructor(status, code, message, field = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export function notFound(kind, id) {
  throw new EngineError(404, 'NOT_FOUND', `Unknown ${kind}: ${id}`);
}

export function invalid(message, field = null) {
  throw new EngineError(400, 'VALIDATION_ERROR', message, field);
}
