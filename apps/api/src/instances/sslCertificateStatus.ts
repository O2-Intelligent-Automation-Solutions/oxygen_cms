import type { OxyGenInstance } from './types.js';

export type SslCertificateDisplayStatus = 'hidden' | 'unknown' | 'valid' | 'expiring-soon' | 'expired' | 'invalid' | 'not-evaluated';

export type SslCertificateWarningSettings = {
  daysBeforeExpiration: number;
};

export const DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS: SslCertificateWarningSettings = {
  daysBeforeExpiration: 30
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseExpiresAt(value: string | null) {
  if (!value) return null;
  const expiresAt = new Date(value).getTime();
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

export function daysUntilSslExpiration(expiresAt: string | null, now = new Date()) {
  const expiresAtMs = parseExpiresAt(expiresAt);
  if (expiresAtMs === null) return null;
  return Math.ceil((expiresAtMs - now.getTime()) / MS_PER_DAY);
}

export function isTlsConnectionError(instance: Pick<OxyGenInstance, 'status' | 'lastError'>) {
  return instance.status === 'down' && /\bTLS connection failed\b|secure TLS connection|TLS handshake/i.test(instance.lastError ?? '');
}

export function sslCertificateDisplayStatus(
  instance: Pick<OxyGenInstance, 'protocol' | 'status' | 'sslValid' | 'sslExpiresAt' | 'lastError'>,
  settings: SslCertificateWarningSettings = DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS,
  now = new Date()
): SslCertificateDisplayStatus {
  if (instance.protocol !== 'https') return 'hidden';
  if (isTlsConnectionError(instance)) return 'not-evaluated';

  const expiresAtMs = parseExpiresAt(instance.sslExpiresAt);
  if (expiresAtMs !== null && expiresAtMs < now.getTime()) return 'expired';

  if (instance.sslValid === false || instance.status === 'ssl-error') return 'invalid';
  if (instance.sslValid === null) return 'unknown';

  const warningDays = Math.max(0, Math.trunc(settings.daysBeforeExpiration));
  if (expiresAtMs !== null && expiresAtMs - now.getTime() <= warningDays * MS_PER_DAY) return 'expiring-soon';

  return 'valid';
}

export function sslCertificateHasIssue(
  instance: Pick<OxyGenInstance, 'protocol' | 'status' | 'sslValid' | 'sslExpiresAt' | 'lastError'>,
  settings: SslCertificateWarningSettings = DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS,
  now = new Date()
) {
  const status = sslCertificateDisplayStatus(instance, settings, now);
  return status === 'expired' || status === 'expiring-soon' || status === 'invalid';
}

export function sslCertificateIssueLabel(
  instance: Pick<OxyGenInstance, 'protocol' | 'status' | 'sslValid' | 'sslExpiresAt' | 'lastError'>,
  settings: SslCertificateWarningSettings = DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS,
  now = new Date()
) {
  const status = sslCertificateDisplayStatus(instance, settings, now);
  if (status === 'expired') return 'SSL certificate expired';
  if (status === 'expiring-soon') return 'SSL certificate expiring soon';
  return 'SSL warning';
}
