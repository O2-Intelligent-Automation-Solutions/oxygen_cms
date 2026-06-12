import rootPackage from '../../../../package.json' with { type: 'json' };

export type CurrentVersionInfo = {
  version: string;
  commit: string | null;
  buildDate: string | null;
  repository: string;
  sourceUrl: string;
  updateChannel: string;
};

export type UpdateCheckResult = {
  checkedAt: string;
  source: 'github-release' | 'github-tag' | 'github-branch' | 'unavailable';
  available: boolean;
  currentVersion: string;
  latestVersion: string | null;
  latestName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  error: string | null;
};

export type VersionSnapshot = {
  current: CurrentVersionInfo;
  update: UpdateCheckResult;
};

type FetchLike = typeof fetch;

type GitHubRelease = {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
};

type GitHubTag = {
  name?: unknown;
  commit?: { sha?: unknown; url?: unknown };
  zipball_url?: unknown;
};

type GitHubRepository = {
  default_branch?: unknown;
  pushed_at?: unknown;
  updated_at?: unknown;
  html_url?: unknown;
};

type GitHubCommit = {
  sha?: unknown;
  html_url?: unknown;
  commit?: {
    committer?: { date?: unknown };
    author?: { date?: unknown };
    message?: unknown;
  };
};

export type UpdateChecker = {
  getVersionSnapshot(): Promise<VersionSnapshot>;
};

export type UpdateCheckerOptions = {
  fetchImpl?: FetchLike;
  repository?: string;
  sourceUrl?: string;
  updateChannel?: string;
  timeoutMs?: number;
  now?: () => Date;
};

const DEFAULT_REPOSITORY = 'O2-Intelligent-Automation-Solutions/oxygen_cms';

function envValue(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function currentVersion(repository: string, sourceUrl: string, updateChannel: string): CurrentVersionInfo {
  return {
    version: envValue('OXYGEN_CMS_VERSION') ?? rootPackage.version,
    commit: envValue('OXYGEN_CMS_BUILD_COMMIT') ?? envValue('GITHUB_SHA') ?? envValue('COMMIT_SHA'),
    buildDate: envValue('OXYGEN_CMS_BUILD_DATE') ?? envValue('BUILD_DATE'),
    repository,
    sourceUrl,
    updateChannel
  };
}

function normalizeVersion(value: string | null) {
  if (!value) return null;
  const withoutPrefix = value.trim().replace(/^release[-/]/i, '').replace(/^v/i, '');
  const match = withoutPrefix.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : withoutPrefix;
}

function compareVersions(left: string | null, right: string | null) {
  const l = normalizeVersion(left);
  const r = normalizeVersion(right);
  if (!l || !r) return 0;
  const lParts = l.split('.').map((part) => Number(part));
  const rParts = r.split('.').map((part) => Number(part));
  if (lParts.length < 3 || rParts.length < 3 || lParts.some(Number.isNaN) || rParts.some(Number.isNaN)) return l === r ? 0 : 0;
  for (let index = 0; index < 3; index += 1) {
    if (rParts[index] > lParts[index]) return 1;
    if (rParts[index] < lParts[index]) return -1;
  }
  return 0;
}

async function fetchJson<T>(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; body: T | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'oxygen-cms-update-checker'
      },
      signal: controller.signal
    });
    const body = await response.json().catch(() => null) as T | null;
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function unavailable(current: CurrentVersionInfo, checkedAt: string, error: string): VersionSnapshot {
  return {
    current,
    update: {
      checkedAt,
      source: 'unavailable',
      available: false,
      currentVersion: current.version,
      latestVersion: null,
      latestName: null,
      releaseUrl: null,
      publishedAt: null,
      error
    }
  };
}

export function createUpdateChecker(options: UpdateCheckerOptions = {}): UpdateChecker {
  const repository = options.repository ?? envValue('OXYGEN_CMS_UPDATE_REPOSITORY') ?? DEFAULT_REPOSITORY;
  const sourceUrl = options.sourceUrl ?? envValue('OXYGEN_CMS_SOURCE_URL') ?? `https://github.com/${repository}`;
  const updateChannel = options.updateChannel ?? envValue('OXYGEN_CMS_UPDATE_CHANNEL') ?? 'stable';
  const timeoutMs = options.timeoutMs ?? Number(envValue('OXYGEN_CMS_UPDATE_TIMEOUT_MS') ?? 5000);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  return {
    async getVersionSnapshot() {
      const current = currentVersion(repository, sourceUrl, updateChannel);
      const checkedAt = now().toISOString();
      if (typeof fetchImpl !== 'function') return unavailable(current, checkedAt, 'Fetch is not available in this runtime.');

      try {
        const releaseUrl = `https://api.github.com/repos/${repository}/releases/latest`;
        const release = await fetchJson<GitHubRelease>(fetchImpl, releaseUrl, timeoutMs);
        if (release.ok && release.body) {
          const latestVersion = stringOrNull(release.body.tag_name);
          return {
            current,
            update: {
              checkedAt,
              source: 'github-release',
              available: compareVersions(current.version, latestVersion) > 0,
              currentVersion: current.version,
              latestVersion,
              latestName: stringOrNull(release.body.name) ?? latestVersion,
              releaseUrl: stringOrNull(release.body.html_url),
              publishedAt: stringOrNull(release.body.published_at),
              error: null
            }
          };
        }

        const tagsUrl = `https://api.github.com/repos/${repository}/tags?per_page=1`;
        const tags = await fetchJson<GitHubTag[]>(fetchImpl, tagsUrl, timeoutMs);
        if (tags.ok && Array.isArray(tags.body) && tags.body.length > 0) {
          const tag = tags.body[0];
          const latestVersion = stringOrNull(tag.name);
          return {
            current,
            update: {
              checkedAt,
              source: 'github-tag',
              available: compareVersions(current.version, latestVersion) > 0,
              currentVersion: current.version,
              latestVersion,
              latestName: latestVersion,
              releaseUrl: latestVersion ? `${sourceUrl}/releases/tag/${encodeURIComponent(latestVersion)}` : sourceUrl,
              publishedAt: null,
              error: null
            }
          };
        }

        const repositoryUrl = `https://api.github.com/repos/${repository}`;
        const repositoryMetadata = await fetchJson<GitHubRepository>(fetchImpl, repositoryUrl, timeoutMs);
        const defaultBranch = repositoryMetadata.ok && repositoryMetadata.body ? stringOrNull(repositoryMetadata.body.default_branch) : null;
        if (defaultBranch) {
          const branchUrl = `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(defaultBranch)}`;
          const branchCommit = await fetchJson<GitHubCommit>(fetchImpl, branchUrl, timeoutMs);
          const sha = branchCommit.ok && branchCommit.body ? stringOrNull(branchCommit.body.sha) : null;
          const commitUrl = branchCommit.ok && branchCommit.body ? stringOrNull(branchCommit.body.html_url) : null;
          return {
            current,
            update: {
              checkedAt,
              source: 'github-branch',
              available: Boolean(current.commit && sha && !sha.startsWith(current.commit) && !current.commit.startsWith(sha)),
              currentVersion: current.version,
              latestVersion: sha ? sha.slice(0, 12) : defaultBranch,
              latestName: sha ? `${defaultBranch} @ ${sha.slice(0, 12)}` : defaultBranch,
              releaseUrl: commitUrl ?? stringOrNull(repositoryMetadata.body?.html_url) ?? sourceUrl,
              publishedAt: branchCommit.ok && branchCommit.body ? stringOrNull(branchCommit.body.commit?.committer?.date) ?? stringOrNull(branchCommit.body.commit?.author?.date) : stringOrNull(repositoryMetadata.body?.pushed_at) ?? stringOrNull(repositoryMetadata.body?.updated_at),
              error: null
            }
          };
        }

        return unavailable(current, checkedAt, `GitHub update metadata unavailable. Latest release status ${release.status}; tags status ${tags.status}; repository status ${repositoryMetadata.status}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Update check failed.';
        return unavailable(current, checkedAt, message);
      }
    }
  };
}
