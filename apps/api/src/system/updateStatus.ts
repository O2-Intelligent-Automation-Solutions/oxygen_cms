export type UpdateStepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type UpdateStep = {
  code: 'dry-run' | 'backup' | 'checkout' | 'build' | 'restart' | 'schema';
  label: string;
  state: UpdateStepState;
  message: string | null;
  completedAt: string | null;
};

export type UpdateRunSummary = {
  startedAt: string;
  finishedAt: string | null;
  targetRef: string | null;
  targetCommit: string | null;
  result: 'completed' | 'failed' | 'cancelled' | null;
} | null;

export type UpdateStatusSnapshot = {
  state: 'idle' | 'checking' | 'backing-up' | 'updating' | 'restarting' | 'schema-pending' | 'completed' | 'failed';
  inProgress: boolean;
  canRunUpdate: boolean;
  command: string;
  dryRunCommand: string;
  requiresConfirmation: boolean;
  lastRun: UpdateRunSummary;
  lastError: string | null;
  steps: UpdateStep[];
};

export type UpdateStatusProvider = {
  readStatus(): Promise<UpdateStatusSnapshot>;
};

function pendingStep(code: UpdateStep['code'], label: string): UpdateStep {
  return { code, label, state: 'pending', message: null, completedAt: null };
}

export function createStaticUpdateStatusProvider(): UpdateStatusProvider {
  return {
    async readStatus() {
      return {
        state: 'idle',
        inProgress: false,
        canRunUpdate: true,
        command: 'scripts/deploy.sh update',
        dryRunCommand: 'scripts/deploy.sh update --dry-run',
        requiresConfirmation: true,
        lastRun: null,
        lastError: null,
        steps: [
          pendingStep('dry-run', 'Dry run'),
          pendingStep('backup', 'Backup'),
          pendingStep('checkout', 'Checkout update'),
          pendingStep('build', 'Build image'),
          pendingStep('restart', 'Restart stack'),
          pendingStep('schema', 'Schema migration')
        ]
      } satisfies UpdateStatusSnapshot;
    }
  };
}
