import knex, { type Knex } from 'knex';
import type { OxyGenInstance } from '../instances/types.js';
import type { InstanceRepository } from '../instances/types.js';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';

export type IssueCategoryCode = 'connectivity' | 'ssl' | 'license' | 'processing';
export type IssueSeverityCode = 'critical' | 'error' | 'warning' | 'logging' | 'verbose';

export type IssueCatalogAffectedInstance = {
  id: string;
  name: string;
  tenantId: string | null;
  tenantName: string | null;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  evidence: string;
};

export type IssueCatalogTypeSummary = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  matchKind: string;
  matchValue: string | null;
  enabled: boolean;
  sortOrder: number;
  category: { id: string; code: IssueCategoryCode; name: string; sortOrder: number };
  severity: { id: string; code: IssueSeverityCode; name: string; rank: number; sortOrder: number };
  affectedCount: number;
  affectedInstances: IssueCatalogAffectedInstance[];
};

export type IssueCatalogSnapshot = {
  configured: boolean;
  connected: boolean;
  generatedAt: string;
  error: string | null;
  categories: Array<{ id: string; code: IssueCategoryCode; name: string; sortOrder: number }>;
  severities: Array<{ id: string; code: IssueSeverityCode; name: string; rank: number; sortOrder: number }>;
  issueTypes: IssueCatalogTypeSummary[];
};

export type IssueCatalogReader = {
  readSnapshot(): Promise<IssueCatalogSnapshot>;
};

type RawIssueType = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  matchKind: string;
  matchValue: string | null;
  enabled: number | boolean;
  sortOrder: number;
  categoryId: string;
  categoryCode: IssueCategoryCode;
  categoryName: string;
  categorySortOrder: number;
  severityId: string;
  severityCode: IssueSeverityCode;
  severityName: string;
  severityRank: number;
  severitySortOrder: number;
};

type RawCategory = { id: string; code: IssueCategoryCode; name: string; sortOrder: number };
type RawSeverity = { id: string; code: IssueSeverityCode; name: string; rank: number; sortOrder: number };

type TenantRow = { id: string; name: string };

const emptySnapshot = (generatedAt = new Date().toISOString()): IssueCatalogSnapshot => ({
  configured: false,
  connected: false,
  generatedAt,
  error: null,
  categories: [],
  severities: [],
  issueTypes: []
});

function createConnection(settings: DatabaseSettings): Knex {
  return knex({
    client: 'mysql2',
    connection: {
      host: settings.host,
      port: settings.port,
      user: settings.user,
      password: settings.password,
      database: settings.database
    },
    pool: { min: 0, max: 2 }
  });
}

function rowsFromRaw<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    const first = result[0];
    return Array.isArray(first) ? first as T[] : result as T[];
  }
  return [];
}

function boolValue(value: number | boolean) {
  return value === true || value === 1;
}

function dateValue(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function textIncludes(text: string | null | undefined, pattern: string | null) {
  if (!pattern) return false;
  return (text ?? '').toLowerCase().includes(pattern.toLowerCase());
}

function isTlsConnectionError(instance: OxyGenInstance) {
  return instance.status === 'down' && /\bTLS connection failed\b|secure TLS connection|TLS handshake/i.test(instance.lastError ?? '');
}

function sslIssue(instance: OxyGenInstance) {
  return instance.protocol === 'https' && !isTlsConnectionError(instance) && (instance.sslValid === false || instance.status === 'ssl-error');
}

function licenseEligible(instance: OxyGenInstance) {
  return instance.checkLicense && instance.status === 'up';
}

function processingFailure(instance: OxyGenInstance) {
  return instance.processingStatus === 'error' || instance.emmQueueStatus === 'error' || instance.smsStatus === 'error' || instance.hangfireStatus === 'error';
}

function processingWarning(instance: OxyGenInstance) {
  return instance.processingStatus === 'warning' || instance.emmQueueStatus === 'warning' || instance.smsStatus === 'warning' || instance.hangfireStatus === 'warning';
}

function evidenceFor(instance: OxyGenInstance, fallback: string) {
  return instance.lastError || fallback;
}

function affectedBy(type: RawIssueType, instance: OxyGenInstance): string | null {
  switch (type.matchKind) {
    case 'instance-status':
      return instance.status === type.matchValue ? evidenceFor(instance, `Availability status is ${instance.status}.`) : null;
    case 'last-error-contains':
      return textIncludes(instance.lastError, type.matchValue) ? evidenceFor(instance, `Last error contains ${type.matchValue}.`) : null;
    case 'tls-connection-error':
      return isTlsConnectionError(instance) ? evidenceFor(instance, 'TLS connection failed before certificate validation completed.') : null;
    case 'ssl-invalid':
      return sslIssue(instance) ? evidenceFor(instance, 'SSL certificate validation failed.') : null;
    case 'license-status':
      return licenseEligible(instance) && instance.licenseStatus === type.matchValue ? evidenceFor(instance, `License status is ${instance.licenseStatus}.`) : null;
    case 'license-missing':
      return licenseEligible(instance) && !instance.licenseKey && instance.licenseStatus !== 'valid' ? evidenceFor(instance, 'License key is missing, blank, or unavailable.') : null;
    case 'processing-status':
      return type.matchValue === 'error' && processingFailure(instance) ? 'One or more processing components are in error.' : null;
    case 'processing-warning':
      return processingWarning(instance) ? 'One or more processing components are warning or disabled.' : null;
    default:
      return null;
  }
}

function affectedInstances(type: RawIssueType, instances: OxyGenInstance[], tenants: Map<string, string>): IssueCatalogAffectedInstance[] {
  return instances
    .filter((instance) => instance.isEnabled && !instance.archived)
    .map((instance) => ({ instance, evidence: affectedBy(type, instance) }))
    .filter((entry): entry is { instance: OxyGenInstance; evidence: string } => Boolean(entry.evidence))
    .map(({ instance, evidence }) => ({
      id: instance.id,
      name: instance.name,
      tenantId: instance.tenantId,
      tenantName: instance.tenantId ? tenants.get(instance.tenantId) ?? null : null,
      status: instance.status,
      lastCheckedAt: instance.lastCheckedAt,
      lastError: instance.lastError,
      evidence
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function createIssueCatalogReader(setupSettingsStore: SetupSettingsStore, instanceRepository: InstanceRepository): IssueCatalogReader {
  return {
    async readSnapshot() {
      const generatedAt = new Date().toISOString();
      const settings = await setupSettingsStore.getDatabaseSettings();
      if (!settings) return emptySnapshot(generatedAt);

      const client = createConnection(settings);
      try {
        await client.raw('SELECT 1');
        const [categoryRows, severityRows, issueTypeRows, tenantRows, instances] = await Promise.all([
          client<RawCategory>('issue_categories').select({ id: 'id', code: 'code', name: 'name', sortOrder: 'sort_order' }).orderBy('sort_order'),
          client<RawSeverity>('issue_severities').select({ id: 'id', code: 'code', name: 'name', rank: 'severity_rank', sortOrder: 'sort_order' }).orderBy('sort_order'),
          client.raw(`
            SELECT
              it.id,
              it.code,
              it.label,
              it.description,
              it.match_kind AS matchKind,
              it.match_value AS matchValue,
              it.enabled,
              it.sort_order AS sortOrder,
              c.id AS categoryId,
              c.code AS categoryCode,
              c.name AS categoryName,
              c.sort_order AS categorySortOrder,
              s.id AS severityId,
              s.code AS severityCode,
              s.name AS severityName,
              s.severity_rank AS severityRank,
              s.sort_order AS severitySortOrder
            FROM discovered_issue_types it
            INNER JOIN issue_categories c ON c.id = it.category_id
            INNER JOIN issue_severities s ON s.id = it.severity_id
            WHERE it.enabled = 1
            ORDER BY c.sort_order ASC, s.severity_rank ASC, it.sort_order ASC, it.label ASC
          `),
          client<TenantRow>('tenants').select('id', 'name'),
          instanceRepository.listInstances({ includeAll: true, includeArchived: true })
        ]);
        const tenants = new Map(tenantRows.map((tenant) => [tenant.id, tenant.name]));
        const issueTypes = rowsFromRaw<RawIssueType>(issueTypeRows).map((row) => {
          const affected = affectedInstances(row, instances, tenants);
          return {
            id: row.id,
            code: row.code,
            label: row.label,
            description: row.description,
            matchKind: row.matchKind,
            matchValue: row.matchValue,
            enabled: boolValue(row.enabled),
            sortOrder: Number(row.sortOrder ?? 0),
            category: { id: row.categoryId, code: row.categoryCode, name: row.categoryName, sortOrder: Number(row.categorySortOrder ?? 0) },
            severity: { id: row.severityId, code: row.severityCode, name: row.severityName, rank: Number(row.severityRank ?? 0), sortOrder: Number(row.severitySortOrder ?? 0) },
            affectedCount: affected.length,
            affectedInstances: affected
          };
        });
        return {
          configured: true,
          connected: true,
          generatedAt,
          error: null,
          categories: categoryRows.map((row) => ({ ...row, sortOrder: Number(row.sortOrder ?? 0) })),
          severities: severityRows.map((row) => ({ ...row, rank: Number(row.rank ?? 0), sortOrder: Number(row.sortOrder ?? 0) })),
          issueTypes
        };
      } catch (error) {
        return {
          ...emptySnapshot(generatedAt),
          configured: true,
          error: error instanceof Error && error.message ? error.message : 'Issue catalog is unavailable.'
        };
      } finally {
        await client.destroy();
      }
    }
  };
}
