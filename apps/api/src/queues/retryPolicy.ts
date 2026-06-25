export type QueueFailureClass =
  | 'transient-network'
  | 'remote-temporary'
  | 'infrastructure'
  | 'overlap'
  | 'not-found-or-disabled'
  | 'auth-or-config'
  | 'deterministic-validation'
  | 'destructive-guard'
  | 'unknown';

export type QueueFailurePolicy = {
  failureClass: QueueFailureClass;
  retryable: boolean;
  logSeverity: 'Verbose' | 'Logging' | 'Warning' | 'Error' | 'Critical';
};

export class QueueJobValidationError extends Error {
  readonly failureClass = 'deterministic-validation' as const;
  readonly retryable = false;
}

export class QueueJobOverlapError extends Error {
  readonly failureClass = 'overlap' as const;
  readonly retryable = false;
}

export class QueueJobGuardError extends Error {
  readonly failureClass = 'destructive-guard' as const;
  readonly retryable = false;
}

export class QueueRetryableError extends Error {
  readonly retryable = true;
  constructor(message: string, readonly failureClass: Extract<QueueFailureClass, 'transient-network' | 'remote-temporary' | 'infrastructure'> = 'infrastructure') {
    super(message);
  }
}

function errorCode(error: unknown) {
  const value = error && typeof error === 'object' ? (error as { code?: unknown; errorCode?: unknown }).code ?? (error as { errorCode?: unknown }).errorCode : null;
  return typeof value === 'string' ? value.toUpperCase() : null;
}

export function classifyQueueFailure(error: unknown): QueueFailurePolicy {
  if (error instanceof QueueJobValidationError) return { failureClass: error.failureClass, retryable: false, logSeverity: 'Error' };
  if (error instanceof QueueJobOverlapError) return { failureClass: error.failureClass, retryable: false, logSeverity: 'Verbose' };
  if (error instanceof QueueJobGuardError) return { failureClass: error.failureClass, retryable: false, logSeverity: 'Warning' };
  if (error instanceof QueueRetryableError) return { failureClass: error.failureClass, retryable: true, logSeverity: error.failureClass === 'infrastructure' ? 'Critical' : 'Warning' };

  const code = errorCode(error);
  if (code && ['ETIMEDOUT', 'ETIMEOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) {
    return { failureClass: 'transient-network', retryable: true, logSeverity: 'Warning' };
  }

  return { failureClass: 'unknown', retryable: false, logSeverity: 'Error' };
}
