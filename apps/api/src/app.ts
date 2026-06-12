import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyRequest, type FastifyServerOptions } from 'fastify';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInMemoryAppLogRepository } from './appLogs/inMemoryAppLogRepository.js';
import { createSetupAwareAppLogRepository } from './appLogs/mysqlAppLogRepository.js';
import { registerAppLogRoutes } from './appLogs/registerAppLogRoutes.js';
import type { AppLogRepository } from './appLogs/types.js';
import { createInMemoryAppSettingsRepository } from './appSettings/inMemoryAppSettingsRepository.js';
import { createSetupAwareAppSettingsRepository } from './appSettings/mysqlAppSettingsRepository.js';
import { registerAppSettingsRoutes } from './appSettings/registerAppSettingsRoutes.js';
import type { AppSettingsRepository } from './appSettings/types.js';
import { createInMemoryAuthRepository } from './auth/inMemoryAuthRepository.js';
import { createSetupAwareAuthRepository } from './auth/mysqlAuthRepository.js';
import { registerAuthRoutes } from './auth/registerAuthRoutes.js';
import type { AuthRepository } from './auth/types.js';
import { loadConfig } from './config/loadConfig.js';
import { registerDashboardRoutes } from './dashboard/registerDashboardRoutes.js';
import { createInMemoryGridPreferenceRepository } from './gridPreferences/inMemoryGridPreferenceRepository.js';
import { createSetupAwareGridPreferenceRepository } from './gridPreferences/mysqlGridPreferenceRepository.js';
import { registerGridPreferenceRoutes } from './gridPreferences/registerGridPreferenceRoutes.js';
import type { GridPreferenceRepository } from './gridPreferences/types.js';
import { createInMemoryInstanceRepository } from './instances/inMemoryInstanceRepository.js';
import { createInstancePoller, type InstancePoller } from './instances/instancePoller.js';
import { createSetupAwareInstanceRepository } from './instances/mysqlInstanceRepository.js';
import { registerInstanceRoutes } from './instances/registerInstanceRoutes.js';
import type { InstanceRepository } from './instances/types.js';
import { registerSetupRoutes } from './setup/registerSetupRoutes.js';
import { createDatabasePerformanceReader, type DatabasePerformanceReader } from './system/databasePerformance.js';
import { registerSystemRoutes } from './system/registerSystemRoutes.js';
import { createUpdateChecker, type UpdateChecker } from './system/updateInfo.js';
import { createMysqlDatabaseProvisioner, type DatabaseProvisioner } from './setup/databaseProvisioner.js';
import { createDefaultDeploymentConfig, type DeploymentConfig } from './setup/deploymentConfig.js';
import { createFileSetupSettingsStore, type SetupSettingsStore } from './setup/fileSetupSettingsStore.js';
import { createFileSetupStatusProvider, type SetupStatusProvider } from './setup/setupStatus.js';

type BuildAppOptions = FastifyServerOptions & {
  authRepository?: AuthRepository;
  setupStatusProvider?: SetupStatusProvider;
  setupSettingsStore?: SetupSettingsStore;
  databaseProvisioner?: DatabaseProvisioner;
  deploymentConfig?: DeploymentConfig;
  instanceRepository?: InstanceRepository;
  gridPreferenceRepository?: GridPreferenceRepository;
  appSettingsRepository?: AppSettingsRepository;
  appLogRepository?: AppLogRepository;
  instancePoller?: InstancePoller;
  databasePerformanceReader?: DatabasePerformanceReader;
  updateChecker?: UpdateChecker;
  enableBackgroundPolling?: boolean;
  backgroundPollingTickMs?: number;
  webDistPath?: string | false;
};

const defaultSettingsPath = basename(process.cwd()) === 'api'
  ? join(process.cwd(), 'data/settings.json')
  : join(process.cwd(), 'apps/api/data/settings.json');
function defaultWebDistPath() {
  return basename(process.cwd()) === 'api'
    ? join(process.cwd(), '../web/dist')
    : join(process.cwd(), 'apps/web/dist');
}

const defaultFallbackAuthRepository = createInMemoryAuthRepository();
const defaultSetupSettingsStore = createFileSetupSettingsStore(defaultSettingsPath);
const defaultSetupStatusProvider = createFileSetupStatusProvider(defaultSetupSettingsStore);
const defaultDatabaseProvisioner = createMysqlDatabaseProvisioner();
const defaultDeploymentConfig = createDefaultDeploymentConfig();
const defaultInstanceRepository = createInMemoryInstanceRepository();
const defaultGridPreferenceRepository = createInMemoryGridPreferenceRepository();
const defaultAppSettingsRepository = createInMemoryAppSettingsRepository();
const defaultAppLogRepository = createInMemoryAppLogRepository();

type ApplicationActivity = {
  type: 'Audit' | 'Service' | 'CRUD' | 'Connection' | 'Security' | 'UI';
  message: string;
  entityGuid: string | null;
  tenantId: string | null;
};

type LoggedResponsePayloadRequest = FastifyRequest & { appLogResponsePayload?: unknown };

const entityPathLabels: Record<string, string> = {
  instances: 'Instance',
  tenants: 'Tenant',
  roles: 'Role',
  groups: 'User Group',
  users: 'User'
};

function pathnameFromUrl(url: string) {
  return url.split('?')[0] ?? url;
}

function pathSegments(url: string) {
  return pathnameFromUrl(url).split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function entityGuidFromSegments(segments: string[]) {
  const candidate = segments[2];
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : null;
}

function actionVerb(method: string) {
  if (method === 'POST') return 'Created';
  if (method === 'PATCH' || method === 'PUT') return 'Updated';
  if (method === 'DELETE') return 'Deleted';
  return 'Changed';
}

function apiCallPath(url: string, entityGuid: string | null) {
  const path = pathnameFromUrl(url);
  return entityGuid ? path.replace(entityGuid, '{Entity_Guid}') : path;
}

function classifyApplicationActivity(method: string, url: string, statusCode: number): ApplicationActivity | null {
  const segments = pathSegments(url);
  const area = segments[1] ?? '';
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD' || area === 'logs' || area === 'health') return null;

  const succeeded = statusCode < 400;
  if (area === 'auth') {
    if (segments[2] === 'login') return { type: 'Audit', message: succeeded ? 'User signed in.' : 'User sign-in failed.', entityGuid: null, tenantId: null };
    if (segments[2] === 'logout') return { type: 'Audit', message: succeeded ? 'User signed out.' : 'User sign-out failed.', entityGuid: null, tenantId: null };
    if (segments[2] === 'bootstrap') return { type: 'Audit', message: succeeded ? 'Initial admin account created.' : 'Initial admin account creation failed.', entityGuid: null, tenantId: null };
  }

  if (url.includes('/test-connectivity') || url.includes('/connectivity-test')) return null;

  if (area === 'system' && segments[2] === 'poller') {
    const action = segments[3] === 'run-now' ? 'run now' : segments[3] ?? 'update';
    return { type: 'Service', message: succeeded ? `Background poller ${action} requested.` : `Background poller ${action} request failed.`, entityGuid: null, tenantId: null };
  }

  if (area === 'grid-preferences') {
    const gridKey = segments[2] ? ` for ${segments[2]}` : '';
    return { type: 'UI', message: succeeded ? `Updated grid layout preferences${gridKey}.` : `Grid layout preference update${gridKey} failed.`, entityGuid: null, tenantId: null };
  }

  if (area === 'app-settings') {
    const setting = segments[2] === 'log-retention' ? 'log retention setting' : segments[2] === 'labels' ? 'label settings' : 'application settings';
    return { type: 'UI', message: succeeded ? `Updated ${setting}.` : `Update to ${setting} failed.`, entityGuid: null, tenantId: null };
  }

  const entityLabel = entityPathLabels[area];
  if (entityLabel && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const verb = actionVerb(method);
    return { type: 'CRUD', message: succeeded ? `${verb} ${entityLabel}` : `${verb} ${entityLabel} Failed`, entityGuid: entityGuidFromSegments(segments), tenantId: null };
  }

  if (url.startsWith('/api/')) return { type: 'UI', message: succeeded ? 'User action completed.' : 'User action failed.', entityGuid: null, tenantId: null };
  return null;
}

function severityFromStatus(statusCode: number) {
  if (statusCode >= 500) return 'Critical' as const;
  if (statusCode >= 400) return 'Error' as const;
  return 'Logging' as const;
}


function parseJsonPayload(payload: unknown): unknown | null {
  if (!payload) return null;
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : typeof payload === 'string' ? payload : '';
  if (!text.trim()) return null;
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function authProfileNameFromPayload(payload: unknown): string | null {
  const root = objectRecord(parseJsonPayload(payload));
  const user = objectRecord(root?.user);
  return stringValue(user?.displayName) ?? stringValue(user?.email);
}

function responseEntity(payload: unknown, area: string): Record<string, unknown> | null {
  const root = objectRecord(payload);
  if (!root) return null;
  if (area === 'tenants') return objectRecord(root.tenant);
  if (area === 'roles') return objectRecord(root.role);
  if (area === 'groups') return objectRecord(root.group);
  if (area === 'instances') return objectRecord(root.instance);
  if (area === 'users') return objectRecord(root.user) ?? objectRecord(root.user && typeof root.user === 'object' ? root.user : null) ?? objectRecord(root);
  return null;
}

function requestBodyTenantId(body: unknown): string | null {
  return stringValue(objectRecord(body)?.tenantId);
}

async function resolveEntityTenantId(activity: ApplicationActivity, method: string, url: string, requestBody: unknown, responsePayload: unknown, authRepository: AuthRepository, instanceRepository: InstanceRepository): Promise<{ entityGuid: string | null; tenantId: string | null }> {
  const segments = pathSegments(url);
  const area = segments[1] ?? '';
  const parsedPayload = parseJsonPayload(responsePayload);
  const entity = responseEntity(parsedPayload, area);
  const responseEntityGuid = stringValue(entity?.id);
  const responseTenantId = area === 'tenants' ? responseEntityGuid : stringValue(entity?.tenantId);
  const entityGuid = activity.entityGuid ?? responseEntityGuid;
  const explicitTenantId = activity.tenantId ?? responseTenantId ?? requestBodyTenantId(requestBody);
  if (area === 'tenants') return { entityGuid, tenantId: entityGuid ?? explicitTenantId };
  if (explicitTenantId) return { entityGuid, tenantId: explicitTenantId };
  if (!entityGuid) return { entityGuid, tenantId: null };
  if (area === 'instances') return { entityGuid, tenantId: (await instanceRepository.getInstance(entityGuid).catch(() => null))?.tenantId ?? null };
  if (area === 'users') return { entityGuid, tenantId: (await authRepository.listUsers().catch(() => [])).find((entry) => entry.user.id === entityGuid)?.user.tenantId ?? null };
  if (area === 'groups') return { entityGuid, tenantId: (await authRepository.listGroups().catch(() => [])).find((entry) => entry.id === entityGuid)?.tenantId ?? null };
  if (area === 'roles') return { entityGuid, tenantId: (await authRepository.listRoles().catch(() => [])).find((entry) => entry.id === entityGuid)?.tenantId ?? null };
  return { entityGuid, tenantId: null };
}

function extractResponseError(payload: unknown): string | null {
  if (!payload) return null;
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : typeof payload === 'string' ? payload : '';
  if (!text.trim()) return null;
  const parsed = parseJsonPayload(payload) as { error?: unknown; message?: unknown } | null;
  if (!parsed) return text.trim();
  if (typeof parsed.error === 'string') return parsed.error;
  if (typeof parsed.message === 'string') return parsed.message;
  return null;
}

async function resolveUserName(authRepository: AuthRepository, authorization?: string): Promise<string | null> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
  if (!token) return null;
  const profile = await authRepository.getProfileByToken(token).catch(() => null);
  return profile?.user.email ?? null;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const {
    setupSettingsStore = defaultSetupSettingsStore,
    setupStatusProvider = defaultSetupStatusProvider,
    databaseProvisioner = defaultDatabaseProvisioner,
    deploymentConfig = defaultDeploymentConfig,
    instanceRepository: providedInstanceRepository,
    gridPreferenceRepository: providedGridPreferenceRepository,
    appSettingsRepository: providedAppSettingsRepository,
    appLogRepository: providedAppLogRepository,
    instancePoller: providedInstancePoller,
    databasePerformanceReader: providedDatabasePerformanceReader,
    updateChecker: providedUpdateChecker,
    enableBackgroundPolling,
    backgroundPollingTickMs,
    webDistPath = defaultWebDistPath(),
    ...fastifyOptions
  } = options;
  const authRepository = options.authRepository ?? createSetupAwareAuthRepository(setupSettingsStore, defaultFallbackAuthRepository);
  const instanceRepository = providedInstanceRepository ?? createSetupAwareInstanceRepository(setupSettingsStore, defaultInstanceRepository);
  const gridPreferenceRepository = providedGridPreferenceRepository ?? createSetupAwareGridPreferenceRepository(setupSettingsStore, defaultGridPreferenceRepository);
  const appSettingsRepository = providedAppSettingsRepository ?? createSetupAwareAppSettingsRepository(setupSettingsStore, defaultAppSettingsRepository);
  const appLogRepository = providedAppLogRepository ?? createSetupAwareAppLogRepository(setupSettingsStore, defaultAppLogRepository);
  const databasePerformanceReader = providedDatabasePerformanceReader ?? createDatabasePerformanceReader(setupSettingsStore);
  const updateChecker = providedUpdateChecker ?? createUpdateChecker();
  const app = Fastify(fastifyOptions);
  app.addHook('onSend', async (request, _reply, payload) => {
    (request as LoggedResponsePayloadRequest).appLogResponsePayload = payload;
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    const activity = classifyApplicationActivity(request.method, request.url, reply.statusCode);
    if (!activity) return;
    const userName = await resolveUserName(authRepository, request.headers.authorization) ?? (request.url.startsWith('/api/auth/login') && reply.statusCode < 400 ? authProfileNameFromPayload((request as LoggedResponsePayloadRequest).appLogResponsePayload) : null);
    const responsePayload = (request as LoggedResponsePayloadRequest).appLogResponsePayload;
    const resolved = await resolveEntityTenantId(activity, request.method, request.url, request.body, responsePayload, authRepository, instanceRepository);
    const apiCall = `${request.method} ${apiCallPath(request.url, resolved.entityGuid)}`;
    const responseError = extractResponseError(responsePayload);
    await appLogRepository.append({
      type: activity.type,
      severity: severityFromStatus(reply.statusCode),
      source: userName ?? (activity.type === 'Audit' ? 'OxyGen CMS' : 'UI'),
      userName: userName ?? (request.url.startsWith('/api/auth/login') ? 'anonymous' : null),
      entityGuid: resolved.entityGuid,
      tenantId: resolved.tenantId,
      message: activity.message,
      details: {
        apiCall,
        method: request.method,
        url: pathnameFromUrl(request.url),
        responseCode: reply.statusCode,
        statusCode: reply.statusCode,
        entityGuid: resolved.entityGuid,
        tenantId: resolved.tenantId,
        error: responseError
      }
    }).catch((error) => app.log.warn({ error }, 'Failed to persist application activity log'));
  });
  const config = loadConfig();

  await app.register(helmet);
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  app.get('/api/health', async () => ({
    status: 'ok' as const,
    service: 'oxygen-cms-api' as const,
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  }));

  await registerSetupRoutes(app, authRepository, setupStatusProvider, setupSettingsStore, databaseProvisioner, deploymentConfig);
  await registerAuthRoutes(app, authRepository);
  await registerInstanceRoutes(app, authRepository, instanceRepository, appLogRepository);

  const instancePoller = providedInstancePoller ?? createInstancePoller({ repository: instanceRepository, tickIntervalMs: backgroundPollingTickMs, logger: app.log, appLogRepository });

  await registerDashboardRoutes(app, authRepository, instanceRepository, instancePoller);
  await registerGridPreferenceRoutes(app, authRepository, gridPreferenceRepository);
  await registerAppSettingsRoutes(app, authRepository, appSettingsRepository);
  await registerAppLogRoutes(app, authRepository, appLogRepository, appSettingsRepository);
  await registerSystemRoutes(app, authRepository, instancePoller, databasePerformanceReader, updateChecker);

  async function pruneExpiredApplicationLogs() {
    try {
      const retention = await appSettingsRepository.getLogRetention();
      await appLogRepository.pruneOlderThan(retention.days);
    } catch (error) {
      app.log.warn({ error }, 'Failed to prune expired activity history');
    }
  }

  void pruneExpiredApplicationLogs();
  const retentionTimer = setInterval(() => { void pruneExpiredApplicationLogs(); }, 60 * 60 * 1000);
  if (typeof retentionTimer.unref === 'function') retentionTimer.unref();
  app.addHook('onClose', async () => { clearInterval(retentionTimer); });

  if (enableBackgroundPolling ?? config.nodeEnv !== 'test') {
    instancePoller.start();
    app.addHook('onClose', async () => { instancePoller.stop(); });
  }

  if (webDistPath && existsSync(join(webDistPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      index: false,
      wildcard: false
    });
    app.get('/*', async (request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
