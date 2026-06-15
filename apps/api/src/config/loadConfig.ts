import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

function loadProjectEnvironment() {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, '.env'),
    resolve(cwd, '..', '.env'),
    resolve(cwd, '..', '..', '.env')
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false });
    }
  }
}

loadProjectEnvironment();

export type AppConfig = {
  nodeEnv: string;
  host: string;
  port: number;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  queues: {
    enabled: boolean;
    redis: {
      host: string | null;
      port: number | null;
      password: string | null;
      tls: boolean;
    };
    bullBoard: {
      enabled: boolean;
      path: string;
    };
  };
  updateRunner: {
    enabled: boolean;
    command: string;
    cwd: string;
    confirmationVariable: string;
    targetRef: string | null;
  };
};

type Environment = Record<string, string | undefined>;

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function normalizeBasePath(value: string | undefined, fallback: string) {
  const raw = value?.trim() || fallback;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function loadConfig(env: Environment = process.env): AppConfig {
  const redisHost = env.REDIS_HOST?.trim() || null;
  const redisPort = redisHost ? parsePort(env.REDIS_PORT, 6379) : null;
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    host: env.API_HOST ?? '0.0.0.0',
    port: parsePort(env.API_PORT, 3000),
    database: {
      host: env.MYSQL_HOST ?? 'localhost',
      port: parsePort(env.MYSQL_PORT, 3306),
      user: env.MYSQL_USER ?? 'oxygen_cms',
      password: env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      database: env.MYSQL_DATABASE ?? 'O2IAS_CMS'
    },
    queues: {
      enabled: parseBoolean(env.BULLMQ_ENABLED, false) && Boolean(redisHost),
      redis: {
        host: redisHost,
        port: redisPort,
        password: env.REDIS_PASSWORD ?? null,
        tls: parseBoolean(env.REDIS_TLS, false)
      },
      bullBoard: {
        enabled: parseBoolean(env.BULL_BOARD_ENABLED, false),
        path: normalizeBasePath(env.BULL_BOARD_PATH, '/admin/queues')
      }
    },
    updateRunner: {
      enabled: parseBoolean(env.CMS_UPDATE_RUNNER_ENABLED, false),
      command: env.CMS_UPDATE_RUNNER_COMMAND?.trim() || 'scripts/deploy.sh',
      cwd: env.CMS_UPDATE_RUNNER_CWD?.trim() || process.cwd(),
      confirmationVariable: env.CMS_UPDATE_CONFIRMATION_VARIABLE?.trim() || 'CONFIRM_UPDATE',
      targetRef: env.CMS_UPDATE_TARGET_REF?.trim() || null
    }
  };
}
