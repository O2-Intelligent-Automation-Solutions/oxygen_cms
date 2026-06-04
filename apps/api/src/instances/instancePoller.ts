import type { FastifyBaseLogger } from 'fastify';
import type { AppLogRepository } from '../appLogs/types.js';
import type { InstanceRepository, OxyGenInstance } from './types.js';

export type InstancePollerSummary = {
  checked: number;
  skipped: number;
  failed: number;
};

export type InstancePollerStatus = {
  state: 'running' | 'paused' | 'stopped';
  isRunning: boolean;
  isPaused: boolean;
  tickIntervalMs: number;
  inFlight: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastSummary: InstancePollerSummary | null;
  lastError: string | null;
};

export type InstancePoller = {
  pollDueInstances(options?: { force?: boolean }): Promise<InstancePollerSummary>;
  runNow(): Promise<InstancePollerSummary>;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  getStatus(): InstancePollerStatus;
};

type InstancePollerOptions = {
  repository: InstanceRepository;
  now?: () => Date;
  tickIntervalMs?: number;
  logger?: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  appLogRepository?: AppLogRepository;
};

const DEFAULT_TICK_INTERVAL_MS = 30_000;
const CMS_SERVICE_SOURCE = 'OxyGen CMS';

function isDue(instance: OxyGenInstance, now: Date) {
  if (!instance.isEnabled) return false;
  if (!instance.lastCheckedAt) return true;
  const lastCheckedAt = Date.parse(instance.lastCheckedAt);
  if (Number.isNaN(lastCheckedAt)) return true;
  return now.getTime() - lastCheckedAt >= instance.pollingIntervalSeconds * 1000;
}

export function createInstancePoller(options: InstancePollerOptions): InstancePoller {
  const now = options.now ?? (() => new Date());
  const tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const runningInstanceIds = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  let tickRunning = false;
  let paused = false;
  let lastRunAt: string | null = null;
  let lastSummary: InstancePollerSummary | null = null;
  let lastError: string | null = null;
  let nextRunAt: string | null = null;

  function setNextRun(from: Date = now()) {
    nextRunAt = timer && !paused ? new Date(from.getTime() + tickIntervalMs).toISOString() : null;
  }

  async function appendServiceLog(entry: Parameters<AppLogRepository['append']>[0]) {
    try {
      await options.appLogRepository?.append(entry);
    } catch (error) {
      options.logger?.warn({ error }, 'Failed to persist background poller service log');
    }
  }

  async function writeServiceLog(summary: InstancePollerSummary) {
    await appendServiceLog({
      type: 'Service',
      severity: summary.failed > 0 ? 'Warning' : 'Logging',
      source: CMS_SERVICE_SOURCE,
      userName: null,
      message: `Background poller completed: ${summary.checked} checked, ${summary.skipped} skipped, ${summary.failed} failed`,
      details: summary
    });
  }

  async function pollDueInstances(runOptions: { force?: boolean } = {}): Promise<InstancePollerSummary> {
    const instances = await options.repository.listInstances({ includeAll: true });
    const currentTime = now();
    const summary: InstancePollerSummary = { checked: 0, skipped: 0, failed: 0 };

    await Promise.all(instances.map(async (instance) => {
      if (!runOptions.force && !isDue(instance, currentTime)) {
        summary.skipped += 1;
        return;
      }
      if (runningInstanceIds.has(instance.id)) {
        summary.skipped += 1;
        return;
      }

      runningInstanceIds.add(instance.id);
      try {
        await options.repository.testConnectivity(instance.id);
        summary.checked += 1;
      } catch (error) {
        summary.failed += 1;
        options.logger?.warn({ error, instanceId: instance.id }, 'Background instance poll failed');
      } finally {
        runningInstanceIds.delete(instance.id);
      }
    }));

    lastRunAt = currentTime.toISOString();
    lastSummary = summary;
    lastError = null;
    await writeServiceLog(summary);
    setNextRun(currentTime);
    return summary;
  }

  function start() {
    if (timer) return;
    const runTick = async () => {
      if (paused || tickRunning) return;
      tickRunning = true;
      try {
        const summary = await pollDueInstances();
        if (summary.checked || summary.failed) options.logger?.info({ summary }, 'Background instance polling completed');
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Background instance polling tick failed.';
        options.logger?.error({ error }, 'Background instance polling tick failed');
        await appendServiceLog({ type: 'Service', severity: 'Error', source: CMS_SERVICE_SOURCE, userName: null, message: 'Background instance polling tick failed', details: { error: lastError } });
      } finally {
        tickRunning = false;
        setNextRun();
      }
    };
    timer = setInterval(() => { void runTick(); }, tickIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    setNextRun();
    void runTick();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    setNextRun();
  }

  function pause() {
    paused = true;
    setNextRun();
    void appendServiceLog({ type: 'Service', severity: 'Warning', source: CMS_SERVICE_SOURCE, userName: null, message: 'Background poller paused', details: null });
  }

  function resume() {
    paused = false;
    setNextRun();
    void appendServiceLog({ type: 'Service', severity: 'Logging', source: CMS_SERVICE_SOURCE, userName: null, message: 'Background poller resumed', details: null });
  }

  async function runNow(): Promise<InstancePollerSummary> {
    if (tickRunning) {
      const summary: InstancePollerSummary = { checked: 0, skipped: runningInstanceIds.size, failed: 0 };
      lastSummary = summary;
      return summary;
    }
    tickRunning = true;
    try {
      const summary = await pollDueInstances({ force: true });
      options.logger?.info({ summary }, 'Background instance polling run requested by operator');
      await appendServiceLog({ type: 'Service', severity: summary.failed > 0 ? 'Warning' : 'Logging', source: CMS_SERVICE_SOURCE, userName: null, message: 'Background poller run requested now', details: summary });
      return summary;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Background instance polling run failed.';
      options.logger?.error({ error }, 'Background instance polling run failed');
      await appendServiceLog({ type: 'Service', severity: 'Error', source: CMS_SERVICE_SOURCE, userName: null, message: 'Background poller run requested now failed', details: { error: lastError } });
      throw error;
    } finally {
      tickRunning = false;
      setNextRun();
    }
  }

  function getStatus(): InstancePollerStatus {
    const isRunning = Boolean(timer);
    return {
      state: paused ? 'paused' : isRunning ? 'running' : 'stopped',
      isRunning,
      isPaused: paused,
      tickIntervalMs,
      inFlight: runningInstanceIds.size,
      lastRunAt,
      nextRunAt,
      lastSummary,
      lastError
    };
  }

  return { pollDueInstances, runNow, start, stop, pause, resume, getStatus };
}
