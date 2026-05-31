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
};

type Environment = Record<string, string | undefined>;

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function loadConfig(env: Environment = process.env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    host: env.API_HOST ?? '0.0.0.0',
    port: parsePort(env.API_PORT, 3000),
    database: {
      host: env.MYSQL_HOST ?? 'localhost',
      port: parsePort(env.MYSQL_PORT, 3306),
      user: env.MYSQL_USER ?? 'oxygen_cms',
      password: env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      database: env.MYSQL_DATABASE ?? 'oxygen_cms'
    }
  };
}
