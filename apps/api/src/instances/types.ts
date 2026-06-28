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
  checkLicense: boolean;
  archived: boolean;
  metadata: unknown | null;
  notes: string | null;
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
  id?: string;
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
  checkLicense?: boolean;
  archived?: boolean;
  metadata?: unknown | null;
  notes?: string | null;
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
  checkLicense?: boolean;
  archived?: boolean;
  metadata?: unknown | null;
  notes?: string | null;
};

export type ConnectivityStepResult = {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  httpStatusCode?: number;
  errorCode?: string;
  valid?: boolean | null;
  expiresAt?: string | null;
  durationMs?: number;
  address?: string | null;
  family?: number;
  host?: string;
  port?: number;
};

export type LicenseProbeResult = {
  step: ConnectivityStepResult;
  status: LicenseStatus;
  key: string | null;
  payload: unknown | null;
};

export type WorkflowTriggerIssue = {
  workflowTriggerId: string;
  workflowName: string | null;
  triggerStatus: string | null;
  statusInfo: string | null;
  triggerDate: string | null;
  workflowEventId: string | null;
  workflowEventStatus: string | null;
  workflowEventSequence: number | null;
  workflowEventLastError: string | null;
  serviceIdentifier: string | null;
  serviceName: string | null;
  serviceEventId: string | null;
  serviceEventSequence: number | null;
  serviceErrorMessage: string | null;
  serviceStackTrace: string | null;
  processingOutputs: string | null;
  mappedIndexData: unknown | null;
};

export type WorkflowTriggerSummary = {
  workflowTriggerId: string;
  workflowName: string | null;
  sourceIdentifier: string | null;
  sourceEndpointName: string | null;
  triggerStatus: string | null;
  statusInfo: string | null;
  triggerDate: string | null;
  completeDate: string | null;
  hasErrors: boolean;
  childTriggers: number | null;
  isParent: boolean;
};

export type WorkflowProbeResult = {
  step: ConnectivityStepResult;
  totalTriggers: number;
  triggerStatusCounts: Record<string, number>;
  openTriggers: WorkflowTriggerSummary[];
  activeErrorCount: number;
  activeErrors: WorkflowTriggerIssue[];
  recoveredErrorKeys?: string[];
};

export type ConnectivityResult = {
  ok: boolean;
  status: 'reachable' | 'unreachable' | 'auth-error' | 'ssl-error';
  message: string;
  checkedAt: string;
  durationMs: number;
  responseTimeMs: number | null;
  httpStatusCode: number | null;
  dns: ConnectivityStepResult;
  connect: ConnectivityStepResult;
  ssl: ConnectivityStepResult;
  authentication: ConnectivityStepResult;
  api: ConnectivityStepResult;
  settingsJson: unknown | null;
  license: LicenseProbeResult;
  workflows: WorkflowProbeResult;
};

export type InstanceCheckHistoryEntry = {
  checkType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  httpStatusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  detailsJson: unknown | null;
};

export type InstanceHealthDetails = {
  instance: OxyGenInstance;
  availability: InstanceCheckHistoryEntry[];
  latestConnectivity: InstanceCheckHistoryEntry | null;
  licenseHistory: InstanceCheckHistoryEntry[];
  workflowHistory: InstanceCheckHistoryEntry[];
  latestWorkflow: InstanceCheckHistoryEntry | null;
};

export interface InstanceRepository {
  createInstance(input: CreateInstanceInput): Promise<OxyGenInstance>;
  updateInstance(instanceId: string, input: UpdateInstanceInput): Promise<OxyGenInstance>;
  deleteInstance(instanceId: string): Promise<void>;
  listInstances(scope?: { instanceIds?: string[]; includeAll?: boolean; includeArchived?: boolean }): Promise<OxyGenInstance[]>;
  getInstance(instanceId: string): Promise<OxyGenInstance | null>;
  getHealthDetails(instanceId: string): Promise<InstanceHealthDetails>;
  testConnectivity(instanceId: string): Promise<ConnectivityResult>;
}
