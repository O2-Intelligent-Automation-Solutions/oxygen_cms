import type { AppLogRepository } from '../appLogs/types.js';
import type { ConnectivityResult, InstanceRepository, OxyGenInstance } from '../instances/types.js';

export type InstanceCheckJobSource = 'manual' | 'scheduled';

export type InstanceCheckJobData = {
  instanceId: string;
  source: InstanceCheckJobSource;
  [key: string]: unknown;
};

export type InstanceCheckJobSummary = {
  instanceId: string;
  status: ConnectivityResult['status'] | 'skipped';
  ok: boolean;
  skipped?: boolean;
  message: string;
};

export type ProcessInstanceCheckJobOptions = {
  data: InstanceCheckJobData;
  repository: InstanceRepository;
  appLogRepository?: AppLogRepository;
  runGuard?: InstanceCheckRunGuard;
};

export type InstanceCheckRunGuard = {
  runExclusive<T>(instanceId: string, run: () => Promise<T>): Promise<T>;
};

const FORBIDDEN_PAYLOAD_KEYS = ['password', 'secret', 'credential', 'token', 'apiKey', 'connectionString'];
const CMS_QUEUE_SOURCE = 'BullMQ';

export function createInMemoryInstanceCheckRunGuard(): InstanceCheckRunGuard {
  const activeInstanceIds = new Set<string>();
  return {
    async runExclusive<T>(instanceId: string, run: () => Promise<T>): Promise<T> {
      if (activeInstanceIds.has(instanceId)) {
        throw new Error(`Instance check already running for instance ${instanceId}.`);
      }
      activeInstanceIds.add(instanceId);
      try {
        return await run();
      } finally {
        activeInstanceIds.delete(instanceId);
      }
    }
  };
}

function containsForbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (FORBIDDEN_PAYLOAD_KEYS.some((forbidden) => normalized.includes(forbidden.toLowerCase()))) return true;
    if (containsForbiddenKey(nested)) return true;
  }
  return false;
}

function connectivitySeverity(result: ConnectivityResult) {
  if (result.ok) return 'Verbose' as const;
  if (result.status === 'ssl-error') return 'Warning' as const;
  return 'Error' as const;
}

function connectivityErrorCode(result: ConnectivityResult) {
  return result.dns.errorCode ?? result.ssl.errorCode ?? result.authentication.errorCode ?? result.api.errorCode ?? result.license.step.errorCode ?? null;
}

function connectivityDetails(instance: OxyGenInstance, result: ConnectivityResult, source: InstanceCheckJobSource) {
  return {
    source,
    entityGuid: instance.id,
    tenantId: instance.tenantId,
    instanceName: instance.name,
    connectivityStatus: result.status,
    ok: result.ok,
    message: result.message,
    error: result.ok ? null : result.message,
    errorCode: connectivityErrorCode(result),
    httpStatusCode: result.httpStatusCode,
    responseTimeMs: result.responseTimeMs,
    durationMs: result.durationMs,
    dns: result.dns,
    connect: result.connect,
    ssl: result.ssl,
    authentication: result.authentication,
    api: result.api,
    license: result.license.step
  };
}

export async function processInstanceCheckJob(options: ProcessInstanceCheckJobOptions): Promise<InstanceCheckJobSummary> {
  if (containsForbiddenKey(options.data)) {
    throw new Error('Instance check job payloads must not contain credentials, secrets, tokens, or connection strings.');
  }

  const guard = options.runGuard ?? { runExclusive: async <T>(_instanceId: string, run: () => Promise<T>) => run() };

  return guard.runExclusive(options.data.instanceId, async () => {
    const instance = await options.repository.getInstance(options.data.instanceId);
    if (!instance) {
      if (options.data.source === 'scheduled') {
        return {
          instanceId: options.data.instanceId,
          status: 'skipped',
          ok: true,
          skipped: true,
          message: 'Skipped scheduled instance check because the instance no longer exists.'
        };
      }
      throw new Error('Instance not found.');
    }
    if (instance.archived || !instance.isEnabled) {
      if (options.data.source === 'scheduled') {
        return {
          instanceId: instance.id,
          status: 'skipped',
          ok: true,
          skipped: true,
          message: 'Skipped scheduled instance check because the instance is disabled or archived.'
        };
      }
      throw new Error('Instance is disabled or archived.');
    }

    const result = await options.repository.testConnectivity(instance.id);
    await options.appLogRepository?.append({
      type: 'Connection',
      severity: connectivitySeverity(result),
      source: CMS_QUEUE_SOURCE,
      userName: null,
      entityGuid: instance.id,
      tenantId: instance.tenantId,
      message: `${instance.name} ${options.data.source} queue check completed: ${result.message}`,
      details: connectivityDetails(instance, result, options.data.source)
    });

    return { instanceId: instance.id, status: result.status, ok: result.ok, message: result.message };
  });
}
