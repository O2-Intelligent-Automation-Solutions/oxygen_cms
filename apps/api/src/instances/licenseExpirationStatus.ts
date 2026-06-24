import type { OxyGenInstance } from './types.js';

export type LicenseExpirationDisplayStatus = 'hidden' | 'unknown' | 'valid' | 'expiring-soon' | 'expired' | 'missing' | 'invalid' | 'warning' | 'unavailable';

export type LicenseExpirationWarningSettings = {
  daysBeforeExpiration: number;
};

export const DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS: LicenseExpirationWarningSettings = {
  daysBeforeExpiration: 30
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function recordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return null;
}

export function licensePayload(instance: Pick<OxyGenInstance, 'licenseJson'>): Record<string, unknown> {
  return instance.licenseJson && typeof instance.licenseJson === 'object' && !Array.isArray(instance.licenseJson) ? instance.licenseJson as Record<string, unknown> : {};
}

export function licensePayloadWasEvaluated(instance: Pick<OxyGenInstance, 'licenseJson'>) {
  const payload = licensePayload(instance);
  return ['IsValid', 'isValid', 'IsExpired', 'isExpired', 'ExpiryDate', 'ExpirationDate', 'ExpiresAt', 'ExpiresOn', 'ValidUntil', 'validUntil', 'expiryDate', 'Features', 'features'].some((key) => key in payload);
}

export function licenseExpirationDate(instance: Pick<OxyGenInstance, 'licenseJson'>) {
  const payload = licensePayload(instance);
  const raw = recordValue(payload, ['ExpiryDate', 'ExpirationDate', 'ExpiresAt', 'ExpiresOn', 'ValidUntil', 'validUntil', 'expiryDate']);
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
  if (typeof raw === 'number') {
    const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof raw === 'string') {
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

export function daysUntilLicenseExpiration(instance: Pick<OxyGenInstance, 'licenseJson'>, now = new Date()) {
  const expiresAt = licenseExpirationDate(instance);
  return expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY) : null;
}

export function licensePayloadBoolean(instance: Pick<OxyGenInstance, 'licenseJson'>, keys: string[]) {
  const raw = recordValue(licensePayload(instance), keys);
  return typeof raw === 'boolean' ? raw : null;
}

export function licenseExpirationDisplayStatus(
  instance: Pick<OxyGenInstance, 'checkLicense' | 'status' | 'licenseKey' | 'licenseStatus' | 'licenseJson'>,
  settings: LicenseExpirationWarningSettings = DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS,
  now = new Date()
): LicenseExpirationDisplayStatus {
  if (!instance.checkLicense) return 'hidden';
  if (instance.status !== 'up') return 'unavailable';

  const evaluatedPayload = licensePayloadWasEvaluated(instance);
  const expiresAt = licenseExpirationDate(instance);
  const isExpired = licensePayloadBoolean(instance, ['IsExpired', 'isExpired']) === true;
  if (!evaluatedPayload && instance.licenseStatus === 'error') return 'unavailable';
  if (!instance.licenseKey && instance.licenseStatus === 'unknown') return 'unavailable';
  if (!instance.licenseKey && evaluatedPayload && instance.licenseStatus !== 'warning') return 'missing';
  if (instance.licenseStatus === 'expired' || isExpired || (expiresAt && expiresAt.getTime() < now.getTime())) return 'expired';

  if (instance.licenseStatus === 'error') return 'invalid';
  if (!instance.licenseKey && instance.licenseStatus !== 'warning') return 'unavailable';
  if (instance.licenseStatus === 'warning') return evaluatedPayload ? 'warning' : 'unavailable';
  if (instance.licenseStatus === 'unknown') return 'unknown';

  const isValid = instance.licenseStatus === 'valid' || licensePayloadBoolean(instance, ['IsValid', 'isValid']) === true;
  const warningDays = Math.max(0, Math.trunc(settings.daysBeforeExpiration));
  if (isValid && expiresAt && expiresAt.getTime() - now.getTime() <= warningDays * MS_PER_DAY) return 'expiring-soon';

  return isValid ? 'valid' : 'unknown';
}

export function licenseExpirationHasIssue(
  instance: Pick<OxyGenInstance, 'checkLicense' | 'status' | 'licenseKey' | 'licenseStatus' | 'licenseJson'>,
  settings: LicenseExpirationWarningSettings = DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS,
  now = new Date()
) {
  const status = licenseExpirationDisplayStatus(instance, settings, now);
  return status === 'expired' || status === 'missing' || status === 'expiring-soon' || status === 'invalid' || status === 'warning';
}

export function licenseExpirationIssueLabel(
  instance: Pick<OxyGenInstance, 'checkLicense' | 'status' | 'licenseKey' | 'licenseStatus' | 'licenseJson'>,
  settings: LicenseExpirationWarningSettings = DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS,
  now = new Date()
) {
  const status = licenseExpirationDisplayStatus(instance, settings, now);
  if (status === 'expired') return 'License expired';
  if (status === 'expiring-soon') return 'License expiring soon';
  if (status === 'missing') return 'License missing';
  if (status === 'invalid') return 'License invalid';
  if (status === 'warning') return 'License warning';
  if (status === 'unavailable') return 'License API unavailable';
  return `License ${status}`;
}
