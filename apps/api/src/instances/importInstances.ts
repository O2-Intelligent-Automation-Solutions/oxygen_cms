import { z } from 'zod';
import type { AuthProfile, AuthRepository, CmsTenant } from '../auth/types.js';
import { createInstanceSchema, updateInstanceSchema } from './schemas.js';
import { parseInstanceCsv, validateInstanceCsvHeaders, type InstanceCsvScope } from './csv.js';
import type { CreateInstanceInput, InstanceRepository, OxyGenInstance, UpdateInstanceInput } from './types.js';

export type InstanceImportAction = 'create' | 'update' | 'skip' | 'error';

export type InstanceImportRowResult = {
  rowNumber: number;
  instanceGuid: string | null;
  name: string | null;
  action: InstanceImportAction;
  errors: string[];
  warnings: string[];
  instance?: OxyGenInstance;
};

export type InstanceImportResult = {
  dryRun: boolean;
  created: number;
  updated: number;
  failed: number;
  rows: InstanceImportRowResult[];
};

type PreparedImportRow = {
  rowNumber: number;
  action: 'create' | 'update';
  instanceGuid: string | null;
  name: string;
  input: CreateInstanceInput | UpdateInstanceInput;
  existing?: OxyGenInstance;
};

const uuidSchema = z.string().uuid();

function csvScope(profile: AuthProfile): InstanceCsvScope {
  return profile.user.tenantId ? 'tenant' : 'global';
}

function parseBoolean(value: string | undefined, errors: string[], fieldName: string, defaultValue: boolean) {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['true', 'yes', '1'].includes(normalized)) return true;
  if (['false', 'no', '0'].includes(normalized)) return false;
  errors.push(`${fieldName} must be true/false, yes/no, or 1/0.`);
  return defaultValue;
}


function parseMetadata(value: string | undefined, errors: string[]) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    errors.push('metadata must be valid JSON when provided.');
    return null;
  }
}

function parseOptionalPort(value: string | undefined, errors: string[]) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('port must be an integer between 1 and 65535.');
    return null;
  }
  return port;
}

function parseOptionalInterval(value: string | undefined, errors: string[]) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 300;
  const interval = Number(trimmed);
  if (!Number.isInteger(interval) || interval < 60 || interval > 86400) {
    errors.push('polling_interval_seconds must be an integer between 60 and 86400.');
    return 300;
  }
  return interval;
}

function tenantNameMap(tenants: CmsTenant[]) {
  const byName = new Map<string, CmsTenant>();
  for (const tenant of tenants) byName.set(tenant.name.trim().toLowerCase(), tenant);
  return byName;
}

function tenantName(tenants: CmsTenant[], tenantId: string | null) {
  if (!tenantId) return '';
  return tenants.find((tenant) => tenant.id === tenantId)?.name ?? tenantId;
}

export async function importInstancesFromCsv(options: {
  authRepository: AuthRepository;
  instanceRepository: InstanceRepository;
  profile: AuthProfile;
  csv: string;
  dryRun: boolean;
}): Promise<InstanceImportResult> {
  const scope = csvScope(options.profile);
  const parsed = parseInstanceCsv(options.csv);
  const rows: InstanceImportRowResult[] = [];
  const prepared: PreparedImportRow[] = [];

  for (const error of parsed.errors) {
    rows.push({ rowNumber: 1, instanceGuid: null, name: null, action: 'error', errors: [error], warnings: [] });
  }

  const headerErrors = parsed.errors.length === 0 ? validateInstanceCsvHeaders(parsed.headers, scope) : [];
  if (headerErrors.length > 0) {
    rows.push({ rowNumber: 1, instanceGuid: null, name: null, action: 'error', errors: headerErrors, warnings: [] });
  }

  const [instances, tenants] = await Promise.all([
    options.instanceRepository.listInstances({ includeAll: true, includeArchived: true }),
    options.authRepository.listTenants()
  ]);
  const instancesById = new Map(instances.map((instance) => [instance.id, instance]));
  const tenantsByName = tenantNameMap(tenants);
  const seenGuids = new Map<string, number>();

  if (headerErrors.length === 0 && parsed.errors.length === 0) {
    for (const parsedRow of parsed.rows) {
      const values = parsedRow.values;
      const errors: string[] = [];
      const warnings: string[] = [];
      const instanceGuid = values.instance_guid || '';
      const name = values.name || '';
      const existing = instanceGuid ? instancesById.get(instanceGuid) : undefined;
      const action = existing ? 'update' : 'create';

      if (instanceGuid) {
        const duplicateRow = seenGuids.get(instanceGuid);
        if (duplicateRow) errors.push(`Duplicate instance_guid also appears on row ${duplicateRow}.`);
        seenGuids.set(instanceGuid, parsedRow.rowNumber);
        if (!uuidSchema.safeParse(instanceGuid).success) errors.push('instance_guid must be a valid GUID when provided.');
      }
      if (!name) errors.push('name is required.');

      let tenantId: string | null = null;
      if (scope === 'tenant') {
        tenantId = options.profile.user.tenantId;
        if (existing && existing.tenantId !== tenantId) {
          errors.push(`Instance ${instanceGuid} is not assigned to your Tenant.`);
        }
      } else {
        const requestedTenant = values.tenant || '';
        if (requestedTenant) {
          const tenant = tenantsByName.get(requestedTenant.trim().toLowerCase());
          if (!tenant) errors.push(`Unknown Tenant: ${requestedTenant}`);
          else tenantId = tenant.id;
        }
        if (existing && existing.tenantId !== tenantId) {
          errors.push(`Tenant assignment cannot be changed by import for existing instance ${instanceGuid}. Current Tenant: ${tenantName(tenants, existing.tenantId) || 'Global'}.`);
        }
      }

      const password = values.password || '';
      if (action === 'create' && !password) errors.push('password is required when creating an instance.');

      const protocol = (values.protocol || 'https').toLowerCase();
      const inputBase = {
        id: instanceGuid || undefined,
        name,
        description: values.description || null,
        tenantId,
        protocol,
        host: values.host || undefined,
        port: parseOptionalPort(values.port, errors),
        username: values.username || 'admin',
        pollingIntervalSeconds: parseOptionalInterval(values.polling_interval_seconds, errors),
        isEnabled: parseBoolean(values.is_enabled, errors, 'is_enabled', true),
        checkLicense: parseBoolean(values.check_license, errors, 'check_license', true),
        archived: parseBoolean(values.archived, errors, 'archived', false),
        metadata: parseMetadata(values.metadata, errors),
        notes: values.notes || null
      };

      if (action === 'create') {
        const candidate = { ...inputBase, password };
        const parsedInput = createInstanceSchema.safeParse(candidate);
        if (!parsedInput.success) errors.push(...parsedInput.error.issues.map((issue) => issue.message));
        else if (errors.length === 0) prepared.push({ rowNumber: parsedRow.rowNumber, action, instanceGuid: instanceGuid || null, name, input: parsedInput.data });
      } else if (existing) {
        const candidate = { ...inputBase, password };
        const parsedInput = updateInstanceSchema.safeParse(candidate);
        if (!parsedInput.success) errors.push(...parsedInput.error.issues.map((issue) => issue.message));
        else if (errors.length === 0) prepared.push({ rowNumber: parsedRow.rowNumber, action, instanceGuid, name, input: parsedInput.data, existing });
      }

      rows.push({ rowNumber: parsedRow.rowNumber, instanceGuid: instanceGuid || null, name: name || null, action: errors.length > 0 ? 'error' : action, errors, warnings });
    }
  }

  const failed = rows.filter((row) => row.errors.length > 0).length;
  if (failed > 0 || options.dryRun) {
    return {
      dryRun: options.dryRun,
      created: failed > 0 ? 0 : prepared.filter((row) => row.action === 'create').length,
      updated: failed > 0 ? 0 : prepared.filter((row) => row.action === 'update').length,
      failed,
      rows
    };
  }

  let created = 0;
  let updated = 0;
  for (const row of prepared) {
    if (row.action === 'create') {
      const instance = await options.instanceRepository.createInstance(row.input as CreateInstanceInput);
      const result = rows.find((entry) => entry.rowNumber === row.rowNumber);
      if (result) result.instance = instance;
      created += 1;
    } else {
      const instance = await options.instanceRepository.updateInstance(row.instanceGuid as string, row.input as UpdateInstanceInput);
      const result = rows.find((entry) => entry.rowNumber === row.rowNumber);
      if (result) result.instance = instance;
      updated += 1;
    }
  }

  return { dryRun: false, created, updated, failed: 0, rows };
}
