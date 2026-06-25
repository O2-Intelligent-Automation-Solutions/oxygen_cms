import { describe, expect, it } from 'vitest';
import { classifyQueueFailure, QueueJobGuardError, QueueJobOverlapError, QueueJobValidationError, QueueRetryableError } from '../src/queues/retryPolicy.js';

describe('queue retry policy', () => {
  it('classifies deterministic validation failures as non-retryable', () => {
    expect(classifyQueueFailure(new QueueJobValidationError('bad payload'))).toMatchObject({
      failureClass: 'deterministic-validation',
      retryable: false,
      logSeverity: 'Error'
    });
  });

  it('classifies overlap and guard failures as non-retryable operator-safe states', () => {
    expect(classifyQueueFailure(new QueueJobOverlapError('already running'))).toMatchObject({ failureClass: 'overlap', retryable: false, logSeverity: 'Verbose' });
    expect(classifyQueueFailure(new QueueJobGuardError('confirmation required'))).toMatchObject({ failureClass: 'destructive-guard', retryable: false, logSeverity: 'Warning' });
  });

  it('classifies explicit and coded transient failures as retryable', () => {
    expect(classifyQueueFailure(new QueueRetryableError('redis unavailable', 'infrastructure'))).toMatchObject({ failureClass: 'infrastructure', retryable: true, logSeverity: 'Critical' });
    expect(classifyQueueFailure(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toMatchObject({ failureClass: 'transient-network', retryable: true, logSeverity: 'Warning' });
  });
});
