export type InstanceStatus = 'unknown' | 'up' | 'down' | 'auth-error' | 'ssl-error';
export type InstanceProtocol = 'http' | 'https';
export type ComponentStatus = 'unknown' | 'ok' | 'warning' | 'error';
export type LicenseStatus = 'unknown' | 'valid' | 'expired' | 'warning' | 'error';

export type OxyGenInstance = {
  id: string;
  name: string;
  description: string | null;
  tenantId: string | null;
  protocol: InstanceProtocol;
  host: string;
  port: number | null;
  hostname: string;
  baseUrl: string;
  launchUrl: string;
  apiBaseUrl: string;
  username: string;
  pollingIntervalSeconds: number;
  isEnabled: boolean;
  status: InstanceStatus;
  sslValid: boolean | null;
  sslExpiresAt: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  uptimePercent24h: number | null;
  uptimePercent7d: number | null;
  responseTimeMs: number | null;
  lastError: string | null;
  processingStatus: ComponentStatus;
  emmQueueStatus: ComponentStatus;
  smsStatus: ComponentStatus;
  hangfireStatus: ComponentStatus;
  licenseKey: string | null;
  licenseStatus: LicenseStatus;
  licenseJson: unknown | null;
  settingsJson: unknown | null;
  workflowSummaryJson: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateInstanceInput = {
  name: string;
  description?: string | null;
  tenantId?: string | null;
  protocol?: InstanceProtocol;
  host?: string;
  port?: number | null;
  hostname?: string;
  username: string;
  password: string;
  pollingIntervalSeconds?: number;
  isEnabled?: boolean;
};

export type UpdateInstanceInput = {
  name: string;
  description?: string | null;
  tenantId?: string | null;
  protocol?: InstanceProtocol;
  host?: string;
  port?: number | null;
  hostname?: string;
  username: string;
  password?: string;
  pollingIntervalSeconds?: number;
  isEnabled?: boolean;
};

export type ConnectivityResult = {
  ok: boolean;
  status: 'not-tested' | 'reachable' | 'unreachable' | 'auth-error' | 'ssl-error';
  message: string;
  checkedAt: string;
};

export interface InstanceRepository {
  createInstance(input: CreateInstanceInput): Promise<OxyGenInstance>;
  updateInstance(instanceId: string, input: UpdateInstanceInput): Promise<OxyGenInstance>;
  deleteInstance(instanceId: string): Promise<void>;
  listInstances(scope?: { instanceIds?: string[]; includeAll?: boolean }): Promise<OxyGenInstance[]>;
  getInstance(instanceId: string): Promise<OxyGenInstance | null>;
  testConnectivity(instanceId: string): Promise<ConnectivityResult>;
}
