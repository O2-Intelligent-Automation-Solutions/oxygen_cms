import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export type UpdateStepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type UpdateRunnerState = 'idle' | 'running' | 'blocked' | 'unavailable';
export type UpdateRunMode = 'dry-run' | 'update';

export type UpdateStepCode = 'dry-run' | 'backup' | 'checkout' | 'build' | 'restart' | 'schema';

export type UpdateStep = {
  code: UpdateStepCode;
  label: string;
  description: string;
  state: UpdateStepState;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
};

export type UpdateRunSummary = {
  id: string;
  mode: UpdateRunMode;
  targetRef: string;
  startedAt: string;
  finishedAt: string | null;
  state: 'running' | 'completed' | 'failed';
  summary: string | null;
} | null;

export type UpdateStatusSnapshot = {
  generatedAt: string;
  runner: {
    enabled: boolean;
    state: UpdateRunnerState;
    inProgress: boolean;
    canRun: boolean;
    mode: 'host-script';
    command: string;
    dryRunCommand: string;
    requiresConfirmation: boolean;
    confirmationVariable: string;
    currentRef: string | null;
    targetRef: string | null;
  };
  steps: UpdateStep[];
  lastRun: UpdateRunSummary;
  lastError: string | null;
};

export type RunUpdateRequest = {
  mode: UpdateRunMode;
  targetRef?: string | null;
  confirmed?: boolean;
};

export type UpdateStatusProvider = {
  readStatus(): Promise<UpdateStatusSnapshot>;
  runUpdate?(request: RunUpdateRequest): Promise<UpdateStatusSnapshot>;
};

type UpdateCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type UpdateCommandExecutor = (args: string[], options: { env: NodeJS.ProcessEnv; cwd: string }) => Promise<UpdateCommandResult>;

type UpdateRunnerOptions = {
  enabled?: boolean;
  command?: string;
  cwd?: string;
  confirmationVariable?: string;
  currentRef?: string | null;
  targetRef?: string | null;
  now?: () => Date;
  idFactory?: () => string;
  executor?: UpdateCommandExecutor;
};

const STEP_DEFINITIONS: Array<{ code: UpdateStepCode; label: string; description: string }> = [
  { code: 'dry-run', label: 'Dry run', description: 'Validate update script access and inspect the pending update without changing the running CMS.' },
  { code: 'backup', label: 'Backup', description: 'Capture database and deployment-state backup before changing code or containers.' },
  { code: 'checkout', label: 'Checkout update', description: 'Fetch and checkout the requested release, tag, branch, or commit.' },
  { code: 'build', label: 'Build image', description: 'Build the updated CMS application image and assets.' },
  { code: 'restart', label: 'Restart stack', description: 'Restart the CMS containers/services after a successful build.' },
  { code: 'schema', label: 'Schema migration', description: 'Apply any pending CMS schema migrations and verify the target version.' }
];

function createPendingSteps(): UpdateStep[] {
  return STEP_DEFINITIONS.map((step) => ({ ...step, state: 'pending', startedAt: null, finishedAt: null, message: null }));
}

function commandString(command: string, args: string[]) {
  return [command, ...args].join(' ');
}

function trimOutput(value: string, limit = 4000) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}

function defaultExecutor(command: string): UpdateCommandExecutor {
  return (args, options) => new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => resolve({ exitCode: 127, stdout, stderr: error.message }));
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

export function createUpdateRunnerStatusProvider(options: UpdateRunnerOptions = {}): UpdateStatusProvider {
  const enabled = options.enabled ?? false;
  const command = options.command ?? 'scripts/deploy.sh';
  const cwd = options.cwd ?? process.cwd();
  const confirmationVariable = options.confirmationVariable ?? 'CONFIRM_UPDATE';
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? (() => randomUUID());
  const executor = options.executor ?? defaultExecutor(command);
  const currentRef = options.currentRef ?? null;
  let configuredTargetRef = options.targetRef ?? null;
  let inProgress = false;
  let steps = createPendingSteps();
  let lastRun: UpdateRunSummary = null;
  let lastError: string | null = null;

  function timestamp() {
    return now().toISOString();
  }

  function snapshot(): UpdateStatusSnapshot {
    const state: UpdateRunnerState = inProgress ? 'running' : enabled ? 'idle' : 'blocked';
    return {
      generatedAt: timestamp(),
      runner: {
        enabled,
        state,
        inProgress,
        canRun: enabled && !inProgress,
        mode: 'host-script',
        command: commandString(command, ['update']),
        dryRunCommand: commandString(command, ['update', '--dry-run']),
        requiresConfirmation: true,
        confirmationVariable,
        currentRef,
        targetRef: configuredTargetRef
      },
      steps: steps.map((step) => ({ ...step })),
      lastRun: lastRun ? { ...lastRun } : null,
      lastError
    };
  }

  function markStep(code: UpdateStepCode, patch: Partial<UpdateStep>) {
    steps = steps.map((step) => step.code === code ? { ...step, ...patch } : step);
  }

  async function executeRun(mode: UpdateRunMode, targetRef: string, runId: string) {
    const start = timestamp();
    steps = createPendingSteps();
    inProgress = true;
    lastError = null;
    lastRun = { id: runId, mode, targetRef, startedAt: start, finishedAt: null, state: 'running', summary: null };
    const primaryStep = mode === 'dry-run' ? 'dry-run' : 'backup';
    markStep(primaryStep, { state: 'running', startedAt: start, message: mode === 'dry-run' ? 'Dry run started.' : 'Confirmed update started.' });
    if (mode === 'dry-run') {
      for (const step of ['backup', 'checkout', 'build', 'restart', 'schema'] as UpdateStepCode[]) markStep(step, { state: 'skipped', message: 'Skipped for dry run.' });
    }

    const args = mode === 'dry-run' ? ['update', '--dry-run'] : ['update'];
    const env: NodeJS.ProcessEnv = { ...process.env, CMS_UPDATE_TARGET_REF: targetRef };
    if (mode === 'update') env[confirmationVariable] = 'YES';
    const result = await executor(args, { env, cwd });
    const finishedAt = timestamp();
    const output = trimOutput(result.stderr || result.stdout);
    if (result.exitCode === 0) {
      if (mode === 'dry-run') markStep('dry-run', { state: 'completed', finishedAt, message: output || 'Dry run completed successfully.' });
      else for (const step of steps) markStep(step.code, { state: 'completed', finishedAt, message: step.code === 'backup' ? (output || 'Update command completed successfully.') : 'Completed by update command.' });
      lastRun = { id: runId, mode, targetRef, startedAt: start, finishedAt, state: 'completed', summary: output || 'Update command completed successfully.' };
    } else {
      markStep(primaryStep, { state: 'failed', finishedAt, message: output || `Update command exited with code ${result.exitCode}.` });
      lastError = output || `Update command exited with code ${result.exitCode}.`;
      lastRun = { id: runId, mode, targetRef, startedAt: start, finishedAt, state: 'failed', summary: lastError };
    }
    inProgress = false;
  }

  return {
    async readStatus() {
      return snapshot();
    },
    async runUpdate(request) {
      if (!enabled) throw new Error('Update runner is disabled. Set CMS_UPDATE_RUNNER_ENABLED=true on a self-hosted deployment to enable guarded execution.');
      if (inProgress) throw new Error('An update runner job is already in progress.');
      if (request.mode === 'update' && !request.confirmed) throw new Error(`Confirmed updates require ${confirmationVariable}=YES acknowledgement.`);
      const targetRef = request.targetRef?.trim() || configuredTargetRef || 'latest';
      configuredTargetRef = targetRef;
      const runId = idFactory();
      void executeRun(request.mode, targetRef, runId);
      return snapshot();
    }
  };
}

export function createStaticUpdateStatusProvider(): UpdateStatusProvider {
  return createUpdateRunnerStatusProvider({ enabled: false });
}
