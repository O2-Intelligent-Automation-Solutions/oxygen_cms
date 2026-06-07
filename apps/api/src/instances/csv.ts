import type { CmsTenant } from '../auth/types.js';
import type { OxyGenInstance } from './types.js';

export const globalInstanceCsvHeaders = [
  'instance_guid',
  'name',
  'description',
  'tenant',
  'protocol',
  'host',
  'port',
  'username',
  'polling_interval_seconds',
  'is_enabled',
  'check_license',
  'archived',
  'metadata',
  'notes',
  'password'
] as const;

export const tenantInstanceCsvHeaders = [
  'instance_guid',
  'name',
  'description',
  'protocol',
  'host',
  'port',
  'username',
  'polling_interval_seconds',
  'is_enabled',
  'check_license',
  'archived',
  'metadata',
  'notes',
  'password'
] as const;

export type InstanceCsvScope = 'global' | 'tenant';
export type InstanceCsvHeader = (typeof globalInstanceCsvHeaders)[number] | (typeof tenantInstanceCsvHeaders)[number];

export type ParsedInstanceCsvRow = {
  rowNumber: number;
  values: Partial<Record<InstanceCsvHeader, string>>;
  raw: string[];
};

export type ParsedInstanceCsv = {
  headers: string[];
  rows: ParsedInstanceCsvRow[];
  errors: string[];
};

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      record.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      continue;
    }
    if (char === '\r') {
      if (next === '\n') continue;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      continue;
    }
    field += char;
  }

  if (inQuotes) throw new Error('CSV contains an unterminated quoted field.');
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export function exportInstancesToCsv(instances: OxyGenInstance[], tenants: CmsTenant[], scope: InstanceCsvScope) {
  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const headers = scope === 'global' ? globalInstanceCsvHeaders : tenantInstanceCsvHeaders;
  const lines = [headers.join(',')];

  for (const instance of instances) {
    const base: Record<InstanceCsvHeader, string | number | boolean | null> = {
      instance_guid: instance.id,
      name: instance.name,
      description: instance.description,
      tenant: instance.tenantId ? tenantsById.get(instance.tenantId) ?? '' : '',
      protocol: instance.protocol,
      host: instance.host,
      port: instance.port,
      username: instance.username,
      polling_interval_seconds: instance.pollingIntervalSeconds,
      is_enabled: instance.isEnabled,
      check_license: instance.checkLicense,
      archived: instance.archived,
      metadata: instance.metadata === null || instance.metadata === undefined ? '' : JSON.stringify(instance.metadata),
      notes: instance.notes,
      password: ''
    };
    lines.push(headers.map((header) => csvEscape(base[header])).join(','));
  }

  return `${lines.join('\n')}\n`;
}

export function parseInstanceCsv(csv: string): ParsedInstanceCsv {
  let records: string[][];
  try {
    records = parseCsvRecords(csv.trimStart());
  } catch (error) {
    return { headers: [], rows: [], errors: [error instanceof Error ? error.message : 'Unable to parse CSV.'] };
  }

  const [rawHeaders, ...rawRows] = records;
  if (!rawHeaders) return { headers: [], rows: [], errors: ['CSV must include a header row.'] };
  const headers = rawHeaders.map((header) => header.trim().toLowerCase());
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  const rows: ParsedInstanceCsvRow[] = [];
  rawRows.forEach((raw, index) => {
    if (raw.every((value) => value.trim() === '')) return;
    const values: Partial<Record<InstanceCsvHeader, string>> = {};
    headers.forEach((header, columnIndex) => {
      values[header as InstanceCsvHeader] = (raw[columnIndex] ?? '').trim();
    });
    rows.push({ rowNumber: index + 2, values, raw });
  });
  return { headers, rows, errors: [] };
}

export function validateInstanceCsvHeaders(headers: string[], scope: InstanceCsvScope) {
  const expected = scope === 'global' ? globalInstanceCsvHeaders : tenantInstanceCsvHeaders;
  const errors: string[] = [];
  for (const header of expected) {
    if (!headers.includes(header)) errors.push(`Missing required CSV column: ${header}`);
  }
  if (scope === 'tenant' && headers.includes('tenant')) errors.push('Tenant-scoped imports must not include a tenant column.');
  const allowed = new Set(expected);
  for (const header of headers) {
    if (!allowed.has(header as never)) errors.push(`Unexpected CSV column: ${header}`);
  }
  return errors;
}
