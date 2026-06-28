import type { InstanceProtocol } from '../instances/types.js';

export type ProcessingRemoteAccess = {
  instance: {
    id: string;
    name: string;
    protocol: InstanceProtocol;
    host: string;
    port: number | null;
    apiBaseUrl: string;
    username: string;
  };
  password: string;
};

export type ProcessingGridResponse = {
  data: unknown[];
  total: number;
  raw?: unknown;
};

export type ProcessingDataSourceRequest = {
  skip: number;
  take: number;
  sort?: string;
  filter?: string;
  [key: string]: string | number | undefined;
};
