export type InstanceStatus = 'unknown' | 'up' | 'down' | 'auth-error' | 'ssl-error';

export type OxyGenInstance = {
  id: string;
  name: string;
  hostname: string;
  baseUrl: string;
  launchUrl: string;
  username: string;
  groupId: string;
  pollingIntervalSeconds: number;
  isEnabled: boolean;
  status: InstanceStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateInstanceInput = {
  name: string;
  hostname: string;
  username: string;
  password: string;
  groupId: string;
  pollingIntervalSeconds?: number;
  isEnabled?: boolean;
};

export type UpdateInstanceInput = {
  name: string;
  hostname: string;
  username: string;
  password?: string;
  groupId: string;
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
  listInstances(scope?: { groupIds?: string[]; includeAll?: boolean }): Promise<OxyGenInstance[]>;
  getInstance(instanceId: string): Promise<OxyGenInstance | null>;
  testConnectivity(instanceId: string): Promise<ConnectivityResult>;
}
