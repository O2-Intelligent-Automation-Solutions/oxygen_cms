export type DeploymentMode = 'self-contained' | 'custom';

export type DeploymentConfig = {
  mode: DeploymentMode;
  managedMysql: boolean;
  mysql?: {
    host: string;
    port: number;
    database: string;
    applicationUser: string;
    applicationPassword?: string;
    privilegedUser?: string;
    privilegedPassword?: string;
  };
};

export function createDefaultDeploymentConfig(env: NodeJS.ProcessEnv = process.env): DeploymentConfig {
  const managedMysql = env.CMS_MANAGED_MYSQL === 'true';
  if (!managedMysql) return { mode: 'custom', managedMysql: false };

  return {
    mode: 'self-contained',
    managedMysql: true,
    mysql: {
      host: env.MYSQL_HOST || 'mysql',
      port: Number(env.MYSQL_PORT || 3306),
      database: env.MYSQL_DATABASE || 'O2IAS_CMS',
      applicationUser: env.MYSQL_USER || 'oxygen_cms',
      applicationPassword: env.MYSQL_PASSWORD,
      privilegedUser: env.MYSQL_PRIVILEGED_USER || 'root',
      privilegedPassword: env.MYSQL_ROOT_PASSWORD
    }
  };
}

export function publicDeploymentConfig(config: DeploymentConfig) {
  return {
    mode: config.mode,
    managedMysql: config.managedMysql,
    mysql: config.mysql
      ? {
          host: config.mysql.host,
          port: config.mysql.port,
          database: config.mysql.database,
          applicationUser: config.mysql.applicationUser
        }
      : undefined
  };
}
