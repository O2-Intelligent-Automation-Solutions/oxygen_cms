import { describe, expect, it } from 'vitest';
import { issueCatalogTestInternals } from '../src/system/issueCatalog.js';
import type { OxyGenInstance } from '../src/instances/types.js';

const baseInstance: OxyGenInstance = {
  id: 'briscoe-oxygen',
  name: 'Briscoe',
  description: null,
  tenantId: 'tenant-9104',
  protocol: 'https',
  host: 'oxygen.briscoeprotective.com',
  port: 443,
  hostname: 'oxygen.briscoeprotective.com:443',
  baseUrl: 'https://oxygen.briscoeprotective.com:443',
  launchUrl: 'https://oxygen.briscoeprotective.com:443/OxyGen.aspx',
  apiBaseUrl: 'https://oxygen.briscoeprotective.com:443',
  username: 'admin',
  pollingIntervalSeconds: 300,
  isEnabled: true,
  checkLicense: true,
  archived: false,
  metadata: null,
  notes: null,
  status: 'auth-error',
  sslValid: false,
  sslExpiresAt: '2026-06-09T23:59:59.000Z',
  lastCheckedAt: '2026-06-13T15:09:25.000Z',
  lastSuccessAt: null,
  lastFailureAt: '2026-06-13T15:09:25.000Z',
  uptimePercent24h: null,
  uptimePercent7d: null,
  responseTimeMs: 2510,
  lastError: 'OxyGen authentication failed with HTTP 502.',
  processingStatus: 'unknown',
  emmQueueStatus: 'unknown',
  smsStatus: 'unknown',
  hangfireStatus: 'unknown',
  licenseKey: null,
  licenseStatus: 'unknown',
  licenseJson: null,
  settingsJson: null,
  workflowSummaryJson: null,
  createdAt: '2026-06-13T00:00:00.000Z',
  updatedAt: '2026-06-13T00:00:00.000Z'
};

const expiredRule = {
  id: 'ssl-expired',
  code: 'CERT_HAS_EXPIRED',
  label: 'SSL certificate expired',
  description: 'Remote HTTPS certificate has expired.',
  categoryId: 'ssl',
  categoryCode: 'ssl',
  categoryName: 'SSL',
  categorySortOrder: 20,
  severityId: 'warning',
  severityCode: 'warning',
  severityName: 'Warning',
  severityRank: 30,
  severitySortOrder: 30,
  enabled: true,
  sortOrder: 110,
  matchKind: 'last-error-contains',
  matchValue: 'CERT_HAS_EXPIRED'
};

const genericSslRule = {
  ...expiredRule,
  id: 'ssl-invalid',
  code: 'SSL_CERTIFICATE_INVALID',
  label: 'SSL certificate validation failed',
  matchKind: 'ssl-invalid',
  matchValue: null,
  sortOrder: 130
};

const licenseExpiredRule = {
  ...expiredRule,
  id: 'license-expired',
  code: 'LICENSE_EXPIRED',
  label: 'License expired',
  categoryId: 'license',
  categoryCode: 'license',
  categoryName: 'License',
  severityId: 'error',
  severityCode: 'error',
  severityName: 'Error',
  matchKind: 'license-status',
  matchValue: 'expired'
};

const licenseInvalidRule = {
  ...licenseExpiredRule,
  id: 'license-invalid',
  code: 'LICENSE_INVALID',
  label: 'License invalid',
  matchKind: 'license-status',
  matchValue: 'error'
};

const licenseMissingRule = {
  ...licenseExpiredRule,
  id: 'license-missing',
  code: 'LICENSE_MISSING',
  label: 'License missing or blank',
  matchKind: 'license-missing',
  matchValue: null
};

const latestConnectivity = {
  status: 'down',
  errorCode: 'AUTH_HTTP_ERROR',
  errorMessage: 'OxyGen authentication failed with HTTP 502.',
  httpStatusCode: 502,
  detailsJson: {
    ssl: {
      ok: false,
      valid: false,
      message: 'CERT_HAS_EXPIRED',
      errorCode: 'CERT_HAS_EXPIRED',
      expiresAt: '2026-06-09T23:59:59.000Z'
    },
    authentication: {
      ok: false,
      errorCode: 'AUTH_HTTP_ERROR',
      message: 'OxyGen authentication failed with HTTP 502.'
    }
  }
};

const evaluatedExpiredLicense = {
  status: 'error',
  errorCode: 'LICENSE_STATUS_ERROR',
  errorMessage: 'License expired.',
  httpStatusCode: 200,
  detailsJson: { status: 'expired', keyPresent: true, payload: { IsExpired: true, IsValid: false, LicenseKey: 'REDACTED' } }
};

const evaluatedMissingLicense = {
  status: 'error',
  errorCode: 'LICENSE_STATUS_ERROR',
  errorMessage: 'License invalid or blank.',
  httpStatusCode: 200,
  detailsJson: { status: 'error', keyPresent: false, payload: { IsExpired: false, IsValid: false, LicenseKey: null } }
};

const timedOutLicense = {
  status: 'error',
  errorCode: 'Error',
  errorMessage: 'Request timed out.',
  httpStatusCode: null,
  detailsJson: { status: 'error', keyPresent: false, payload: null }
};

const forbiddenLicense = {
  status: 'error',
  errorCode: 'LICENSE_HTTP_ERROR',
  errorMessage: 'License API probe failed with HTTP 403.',
  httpStatusCode: 403,
  detailsJson: { status: 'error', keyPresent: false, payload: null }
};

const defaultSslWarningSettings = { daysBeforeExpiration: 30 };
const defaultLicenseWarningSettings = { daysBeforeExpiration: 30 };

describe('issue catalog matching', () => {
  it('uses latest connectivity SSL details for specific SSL codes instead of generic ssl-invalid', () => {
    expect(issueCatalogTestInternals.affectedBy(expiredRule as never, baseInstance, latestConnectivity, null, defaultSslWarningSettings, defaultLicenseWarningSettings)).toBe('OxyGen authentication failed with HTTP 502.');
    expect(issueCatalogTestInternals.affectedBy(genericSslRule as never, baseInstance, latestConnectivity, null, defaultSslWarningSettings, defaultLicenseWarningSettings)).toBeNull();
  });

  it('requires an evaluated license payload before assigning license issue types', () => {
    const holmes = { ...baseInstance, id: 'holmes', name: 'Holmes', status: 'up' as const, licenseStatus: 'error' as const, lastError: 'Connectivity test completed with license issue: Request timed out.' };

    expect(issueCatalogTestInternals.affectedBy(licenseInvalidRule as never, holmes, null, timedOutLicense, defaultSslWarningSettings, defaultLicenseWarningSettings)).toBeNull();
    expect(issueCatalogTestInternals.affectedBy(licenseInvalidRule as never, holmes, null, forbiddenLicense, defaultSslWarningSettings, defaultLicenseWarningSettings)).toBeNull();
  });

  it('keeps evaluated expired and blank license payloads in specific license buckets', () => {
    const bold = { ...baseInstance, id: 'bold', name: 'BOLD Branded Demo Instance', status: 'up' as const, licenseStatus: 'expired' as const, licenseKey: 'REDACTED', lastError: 'Connectivity test completed with license issue: License expired.' };
    const vanfire = { ...baseInstance, id: 'vanfire', name: 'VanFire', status: 'up' as const, licenseStatus: 'error' as const, licenseKey: null, lastError: 'Connectivity test completed with license issue: License invalid or blank.' };

    expect(issueCatalogTestInternals.affectedBy(licenseExpiredRule as never, bold, null, evaluatedExpiredLicense, defaultSslWarningSettings, defaultLicenseWarningSettings)).toBe('Connectivity test completed with license issue: License expired.');
    expect(issueCatalogTestInternals.affectedBy(licenseMissingRule as never, vanfire, null, evaluatedMissingLicense, defaultSslWarningSettings, defaultLicenseWarningSettings)).toBe('Connectivity test completed with license issue: License invalid or blank.');
    expect(issueCatalogTestInternals.affectedBy(licenseInvalidRule as never, vanfire, null, evaluatedMissingLicense, defaultSslWarningSettings, defaultLicenseWarningSettings)).toBeNull();
  });

  it('deduplicates affected instances that share tenant, name, host, and port', () => {
    const first = { ...baseInstance, id: 'bold-1', name: 'BOLD Branded Demo Instance', tenantId: '10002', hostname: 'bolddemo.oxygenbpm.com:443', status: 'up' as const, licenseStatus: 'expired' as const, licenseKey: 'REDACTED', lastError: 'Connectivity test completed with license issue: License expired.' };
    const second = { ...first, id: 'bold-2' };
    const latestLicenseByInstance = new Map([
      ['bold-1', evaluatedExpiredLicense],
      ['bold-2', evaluatedExpiredLicense]
    ]);

    const affected = issueCatalogTestInternals.affectedInstances(licenseExpiredRule as never, [first, second], new Map(), new Map(), latestLicenseByInstance, defaultSslWarningSettings, defaultLicenseWarningSettings);

    expect(affected).toHaveLength(1);
    expect(affected[0].id).toBe('bold-1');
  });

  it('uses the SSL warning threshold, not the license threshold, for ssl-expiring-soon affected instances', () => {
    const sslSoonRule = { ...genericSslRule, id: 'ssl-expiring-soon', code: 'SSL_EXPIRING_SOON', matchKind: 'ssl-expiring-soon', matchValue: null };
    const amherstLike = {
      ...baseInstance,
      id: 'amherst-like',
      name: 'Amherst-like',
      status: 'up' as const,
      sslValid: true,
      sslExpiresAt: new Date(Date.now() + 22 * 86400000).toISOString(),
      lastError: null
    };

    const affected = issueCatalogTestInternals.affectedInstances(
      sslSoonRule as never,
      [amherstLike],
      new Map(),
      new Map(),
      new Map(),
      { daysBeforeExpiration: 20 },
      { daysBeforeExpiration: 30 }
    );

    expect(affected).toHaveLength(0);
  });

});
