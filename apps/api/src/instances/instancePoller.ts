import type { FastifyBaseLogger } from 'fastify';
import type { InstanceRepository, OxyGenInstance } from './types.js';

export type InstancePollerSummary = {
  checked: number;
  skipped: number;
  failed: number;
};

export type InstancePoller = {
  pollDueInstances(): Promise<InstancePollerSummary>;
  start(): void;
  stop(): void;
};

type InstancePollerOptions = {
  repository: InstanceRepository;
  now?: () => Date;
  tickIntervalMs?: number;
  logger?: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
};

const DEFAULT_TICK_INTERVAL_MS = 30_000;

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

  async function pollDueInstances(): Promise<InstancePollerSummary> {
    const instances = await options.repository.listInstances({ includeAll: true });
    const currentTime = now();
    const summary: InstancePollerSummary = { checked: 0, skipped: 0, failed: 0 };

    await Promise.all(instances.map(async (instance) => {
      if (!isDue(instance, currentTime) || runningInstanceIds.has(instance.id)) {
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

    return summary;
  }

  function start() {
    if (timer) return;
    const runTick = async () => {
      if (tickRunning) return;
      tickRunning = true;
      try {
        const summary = await pollDueInstances();
        if (summary.checked || summary.failed) options.logger?.info({ summary }, 'Background instance polling completed');
      } catch (error) {
        options.logger?.error({ error }, 'Background instance polling tick failed');
      } finally {
        tickRunning = false;
      }
    };
    timer = setInterval(() => { void runTick(); }, tickIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    void runTick();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { pollDueInstances, start, stop };
}
