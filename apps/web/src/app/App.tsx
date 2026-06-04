import {
  Activity, ChevronDown, ChevronLeft, ChevronRight, Database, ExternalLink, Eye, EyeOff, LayoutDashboard,
  ClipboardList, LogOut, Menu, Pause, Pencil, Play, Plus, RotateCw, Server, Settings, ShieldCheck, Trash2, UserCircle, UserPlus, X
} from 'lucide-react';
import { type GridCustomCellProps } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { createJSONEditor, Mode, type Content } from 'vanilla-jsoneditor';
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ManagedGrid, type ManagedGridColumn } from './ManagedGrid';
import o2Logo from '../brand/assets/o2-ias-logo-dark.png';
import oxygenLogo from '../brand/assets/oxygen-logo-inline-dark.png';
import oxygenFullLogo from '../brand/assets/oxygen-logo-full-dark.png';

type TenantId = string | null;
type RoleName = string;
type GroupInstanceAccessMode = 'none' | 'all' | 'specific';
type UserInstanceAccessMode = 'inherit' | 'none' | 'all' | 'specific';
type PublicUser = { id: string; email: string; displayName: string; tenantId: TenantId; instanceAccessMode: UserInstanceAccessMode; instanceIds: string[]; isActive: boolean };
type AuthProfile = { user: PublicUser; roles: RoleName[]; groups: Array<{ id: string; name: string; tenantId: TenantId; instanceAccessMode: GroupInstanceAccessMode; instanceIds: string[] }> };
type Group = { id: string; name: string; description: string | null; tenantId: TenantId; instanceAccessMode: GroupInstanceAccessMode; instanceIds: string[] };
type Role = { id: string; name: string; description: string | null; tenantId: TenantId; isSystem: boolean };
type Tenant = { id: string; name: string; description: string | null };
type UserProfile = AuthProfile;
type OxyGenInstance = { id: string; name: string; description: string | null; tenantId: TenantId; protocol: 'http' | 'https'; host: string; port: number | null; hostname: string; baseUrl: string; launchUrl: string; apiBaseUrl: string; username: string; pollingIntervalSeconds: number; isEnabled: boolean; status: string; sslValid: boolean | null; sslExpiresAt: string | null; lastCheckedAt: string | null; lastSuccessAt: string | null; lastFailureAt: string | null; uptimePercent24h: number | null; uptimePercent7d: number | null; responseTimeMs: number | null; processingStatus: string; emmQueueStatus: string; smsStatus: string; hangfireStatus: string; licenseKey: string | null; licenseStatus: string; licenseJson: unknown | null; settingsJson: unknown | null; workflowSummaryJson: unknown | null; lastError: string | null; createdAt: string; updatedAt: string };
type DashboardSeverity = 'ok' | 'warning' | 'failure' | 'unknown';
type InstanceHealthModalKind = 'availability' | 'ssl' | 'license' | 'response' | 'endpoint' | 'monitoring' | 'workflow' | 'record';
type InstanceCheckHistoryEntry = { checkType: string; status: string; startedAt: string; finishedAt: string | null; durationMs: number | null; httpStatusCode: number | null; errorCode: string | null; errorMessage: string | null; detailsJson: unknown | null };
type InstanceHealthDetails = { instance: OxyGenInstance; availability: InstanceCheckHistoryEntry[]; latestConnectivity: InstanceCheckHistoryEntry | null; licenseHistory: InstanceCheckHistoryEntry[] };
type InstancePollerSummary = { checked: number; skipped: number; failed: number };
type InstancePollerStatus = { state: 'running' | 'paused' | 'stopped'; isRunning: boolean; isPaused: boolean; tickIntervalMs: number; inFlight: number; lastRunAt: string | null; nextRunAt: string | null; lastSummary: InstancePollerSummary | null; lastError: string | null };
type AppLogType = 'Audit' | 'Service' | 'CRUD' | 'Connection' | 'Security' | 'UI';
type AppLogSeverity = 'Critical' | 'Error' | 'Warning' | 'Logging' | 'Verbose';
type AppLogEntry = { id: string; type: AppLogType; severity: AppLogSeverity; source: string; userName: string | null; message: string; details: unknown | null; createdAt: string };
type AppLogGridRow = { id: string; createdAt: string; type: AppLogType; severity: AppLogSeverity; source: string; userName: string; message: string; raw: AppLogEntry };
type LogRetentionSettings = { days: number };
type ConnectivityStepDetail = { ok?: boolean; skipped?: boolean; message?: string; httpStatusCode?: number; errorCode?: string; valid?: boolean | null; expiresAt?: string | null; durationMs?: number };
type ConnectivityDetailsJson = { dns?: ConnectivityStepDetail; ssl?: ConnectivityStepDetail; authentication?: ConnectivityStepDetail; api?: ConnectivityStepDetail; license?: ConnectivityStepDetail };
type DashboardInstance = OxyGenInstance & { issues: string[]; issueCount: number; hasIssue: boolean; severity?: DashboardSeverity; primaryIssue?: string | null };
type DashboardSummary = { scope: 'tenant' | 'global'; tenant: { id: string; name: string; description: string | null } | null; poller: InstancePollerStatus | null; counts: { tenants: number; groups: number; users: number; roles: number; tenantRoles: number; globalRoles: number; instances: number; totalInstances: number; instancesWithIssues: number; upInstances: number; downInstances: number; sslIssues: number; licenseIssues: number; disabledInstances: number; connectivityIssues: number; processingIssues: number; unknownInstances: number }; instances: DashboardInstance[] };
type BootstrapStatus = { requiresBootstrap: boolean };
type SetupNextStep = 'database' | 'schema' | 'admin' | 'complete';
type SetupStatus = { database: { configured: boolean; connected: boolean; schemaCurrent: boolean; defaultDatabaseName: string; targetSchemaVersion: string }; admin: { exists: boolean }; nextStep: SetupNextStep; requiresSetup: boolean };
type DatabaseSetupResponse = { ok: boolean; mode?: string; database: string; message?: string; nextStep?: SetupNextStep; targetSchemaVersion?: string; appliedVersions?: string[]; createdDatabase?: boolean; createdUser?: boolean };
type DeploymentStatus = { mode: 'self-contained' | 'custom'; managedMysql: boolean; mysql?: { host: string; port: number; database: string; applicationUser: string } };
type AppLabels = { tenant: string };
type DatabaseMode = 'managed-mysql' | 'local-mysql' | 'existing-mysql';
type DbWizardStep = 'mode' | 'connection' | 'credentials' | 'review';
type NavSection = 'dashboard' | 'organizations' | 'instances' | 'instance-dashboard' | 'users' | 'user-groups' | 'roles' | 'settings-general' | 'settings-logs' | 'settings-advanced';
type ModalKind = 'user' | 'group' | 'role' | 'tenant' | 'instance';
type ModalEntity = UserProfile | Group | Role | Tenant | OxyGenInstance;
type ModalState = { kind: ModalKind; data?: ModalEntity } | null;
type DashboardIssueFilter = 'all' | 'issues';
type DashboardRefreshMode = 'quiet' | 'manual';
type StatusTone = 'success' | 'warning' | 'failure';
const AUTH_STORAGE_KEY = 'oxygen_cms.authToken';

function ReadOnlyJsonEditor({ value }: { value: unknown }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof createJSONEditor> | null>(null);
  const content: Content = { json: value ?? null };

  useEffect(() => {
    if (!containerRef.current) return;
    editorRef.current = createJSONEditor({
      target: containerRef.current,
      props: { content, readOnly: true, mode: Mode.tree, mainMenuBar: true, navigationBar: true, statusBar: true }
    });
    return () => {
      void editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    editorRef.current?.updateProps({ content, readOnly: true });
  }, [JSON.stringify(value ?? null)]);

  return <div className="license-json-editor jse-theme-dark" ref={containerRef} />;
}
type GroupGridRow = { id: string; name: string; description: string; tenant: string; instanceAccess: string; raw: Group };
type RoleGridRow = { id: string; name: string; description: string; tenant: string; system: string; raw: Role };
type TenantGridRow = { id: string; name: string; description: string; raw: Tenant };
type UserGridRow = { id: string; displayName: string; email: string; role: string; groups: string; tenant: string; instanceAccess: string; raw: UserProfile };
type InstanceGridRow = { id: string; name: string; tenant: string; host: string; status: string; ssl: string; license: string; processing: string; enabled: string; description: string; protocol: string; port: string; hostname: string; baseUrl: string; apiBaseUrl: string; username: string; pollingInterval: string; sslExpiresAt: string; lastCheckedAt: string; uptime24h: string; emmQueue: string; sms: string; hangfire: string; licenseKey: string; lastError: string; raw: OxyGenInstance };
const tenantColumnDefs: ManagedGridColumn<TenantGridRow>[] = [
  { key: 'name', title: 'Name' },
  { key: 'description', title: 'Description' }
];
const groupColumnDefs: ManagedGridColumn<GroupGridRow>[] = [
  { key: 'name', title: 'Name' },
  { key: 'tenant', title: 'Tenant' },
  { key: 'description', title: 'Description' },
  { key: 'instanceAccess', title: 'Instance Access' }
];
const roleColumnDefs: ManagedGridColumn<RoleGridRow>[] = [
  { key: 'name', title: 'Name' },
  { key: 'tenant', title: 'Tenant' },
  { key: 'system', title: 'System', width: 110 },
  { key: 'description', title: 'Description' }
];
const userColumnDefs: ManagedGridColumn<UserGridRow>[] = [
  { key: 'displayName', title: 'Name' },
  { key: 'email', title: 'Email' },
  { key: 'role', title: 'Role' },
  { key: 'tenant', title: 'Tenant' },
  { key: 'groups', title: 'Groups' },
  { key: 'instanceAccess', title: 'Instance Access' }
];
const instanceColumnDefs: ManagedGridColumn<InstanceGridRow>[] = [
  { key: 'name', title: 'Name' },
  { key: 'tenant', title: 'Tenant' },
  { key: 'host', title: 'Host' },
  { key: 'status', title: 'Up/Down', width: 130 },
  { key: 'ssl', title: 'SSL', width: 110 },
  { key: 'license', title: 'License', width: 130 },
  { key: 'processing', title: 'Processing', width: 140 },
  { key: 'enabled', title: 'Enabled', width: 120 },
  { key: 'description', title: 'Description', defaultVisible: false },
  { key: 'protocol', title: 'Protocol', width: 120, defaultVisible: false },
  { key: 'port', title: 'Port', width: 100, defaultVisible: false },
  { key: 'hostname', title: 'Hostname', defaultVisible: false },
  { key: 'baseUrl', title: 'Base URL', defaultVisible: false },
  { key: 'apiBaseUrl', title: 'API Base URL', defaultVisible: false },
  { key: 'username', title: 'Username', width: 130, defaultVisible: false },
  { key: 'pollingInterval', title: 'Polling Interval', width: 160, defaultVisible: false },
  { key: 'sslExpiresAt', title: 'SSL Expires', width: 160, defaultVisible: false },
  { key: 'lastCheckedAt', title: 'Last Checked', width: 170, defaultVisible: false },
  { key: 'uptime24h', title: 'Uptime 24h', width: 130, defaultVisible: false },
  { key: 'emmQueue', title: 'EMM Queue', width: 130, defaultVisible: false },
  { key: 'sms', title: 'SMS', width: 110, defaultVisible: false },
  { key: 'hangfire', title: 'Hangfire', width: 130, defaultVisible: false },
  { key: 'licenseKey', title: 'License Key', width: 160, defaultVisible: false },
  { key: 'lastError', title: 'Last Error', defaultVisible: false }
];
const appLogColumnDefs: ManagedGridColumn<AppLogGridRow>[] = [
  { key: 'createdAt', title: 'Timestamp', width: 190 },
  { key: 'type', title: 'Type', width: 130 },
  { key: 'severity', title: 'Severity', width: 130 },
  { key: 'source', title: 'Source', width: 160 },
  { key: 'userName', title: 'User Name', width: 170 },
  { key: 'message', title: 'Message' }
];

const logTypes: Array<'all' | AppLogType> = ['all', 'Audit', 'Service', 'CRUD', 'Connection', 'Security', 'UI'];
const logSeverities: Array<'all' | AppLogSeverity> = ['all', 'Critical', 'Error', 'Warning', 'Logging', 'Verbose'];

const capabilities = [
  { icon: Server, label: 'Instance monitoring', detail: 'Track OxyGen availability, SSL, auth, and API health.' },
  { icon: Activity, label: 'Workflow visibility', detail: 'Surface pending, failed, and recovery workflow triggers.' },
  { icon: Database, label: 'Settings intelligence', detail: 'Query global settings across customer instances.' },
  { icon: ShieldCheck, label: 'Secure access', detail: 'Local authentication, roles, and group-scoped access.' },
];

const passwordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}';

function generateSecurePassword(length = 24) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => passwordAlphabet[value % passwordAlphabet.length]).join('');
}

function apiErrorMessage(status: number, body: Record<string, unknown>) {
  const base = String(body.error || body.message || `Request failed with status ${status}`);
  const details = body.details ? ` ${JSON.stringify(body.details)}` : '';
  return import.meta.env.DEV ? `API ${status}: ${base}${details}` : base;
}

async function api<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(response.status, body as Record<string, unknown>));
  return body as T;
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem(AUTH_STORAGE_KEY) || '');
  const [requiresBootstrap, setRequiresBootstrap] = useState<boolean | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus | null>(null);
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>('managed-mysql');
  const [dbWizardStep, setDbWizardStep] = useState<DbWizardStep>('mode');
  const [dbHost, setDbHost] = useState('localhost');
  const [dbPort, setDbPort] = useState(3306);
  const [dbName, setDbName] = useState('O2IAS_CMS');
  const [localAdminUser, setLocalAdminUser] = useState('root');
  const [connectAdminUser, setConnectAdminUser] = useState('');
  const [localAppUser, setLocalAppUser] = useState('oxygen_cms');
  const [connectAppUser, setConnectAppUser] = useState('');
  const [createAppDbPassword, setCreateAppDbPassword] = useState(() => generateSecurePassword());
  const [showCreateAppDbPassword, setShowCreateAppDbPassword] = useState(false);
  const [createPrivilegedDbPassword, setCreatePrivilegedDbPassword] = useState('');
  const [showCreatePrivilegedDbPassword, setShowCreatePrivilegedDbPassword] = useState(false);
  const [connectPrivilegedDbPassword, setConnectPrivilegedDbPassword] = useState('');
  const [showConnectPrivilegedDbPassword, setShowConnectPrivilegedDbPassword] = useState(false);
  const [connectAppDbPassword, setConnectAppDbPassword] = useState('');
  const [showConnectAppDbPassword, setShowConnectAppDbPassword] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [instances, setInstances] = useState<OxyGenInstance[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardTenantFilter, setDashboardTenantFilter] = useState('all');
  const [dashboardIssueFilter, setDashboardIssueFilter] = useState<DashboardIssueFilter>('all');
  const [isDashboardRefreshing, setIsDashboardRefreshing] = useState(false);
  const [dashboardLastRefreshedAt, setDashboardLastRefreshedAt] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [selectedInstanceDetail, setSelectedInstanceDetail] = useState<OxyGenInstance | null>(null);
  const [appLabels, setAppLabels] = useState<AppLabels>({ tenant: 'Tenant' });
  const [logRetention, setLogRetention] = useState<LogRetentionSettings>({ days: 90 });
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | AppLogType>('all');
  const [logSeverityFilter, setLogSeverityFilter] = useState<'all' | AppLogSeverity>('all');
  const [logUserFilter, setLogUserFilter] = useState('');
  const [isLogsRefreshing, setIsLogsRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<StatusTone>('success');
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleName>('Operator');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [instanceProtocol, setInstanceProtocol] = useState<'http' | 'https'>('https');
  const [instancePort, setInstancePort] = useState('443');
  const [instancePollingEnabled, setInstancePollingEnabled] = useState(true);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set(['security']));
  const [modal, setModal] = useState<ModalState>(null);
  const [healthModal, setHealthModal] = useState<InstanceHealthModalKind | null>(null);
  const [healthDetails, setHealthDetails] = useState<InstanceHealthDetails | null>(null);
  const [isHealthDetailsLoading, setIsHealthDetailsLoading] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const isSystemAdmin = useMemo(() => profile?.roles.includes('SystemAdmin') ?? false, [profile]);
  const tenantLabel = appLabels.tenant || 'Tenant';
  const tenantLabelPlural = `${tenantLabel}s`;
  const tenantLabelLower = tenantLabel.toLowerCase();
  const tenantName = (tenantId: TenantId) => tenantId ? tenants.find((tenant) => tenant.id === tenantId)?.name || `Unknown ${tenantLabelLower}` : 'Global';
  const tenantOptionLabel = (tenant: Tenant) => tenant.description ? `${tenant.name} — ${tenant.description}` : tenant.name;
  const groupOptionLabel = (group: Group) => group.description ? `${group.name} — ${group.description}` : group.name;
  const availableRoles = roles.length ? roles : [{ id: 'operator', name: 'Operator', description: null, tenantId: null, isSystem: false }];
  const instanceName = (instanceId: string) => instances.find((instance) => instance.id === instanceId)?.name || instanceId;
  const accessLabel = (mode: string, instanceIds: string[]) => mode === 'all' ? 'All instances' : mode === 'none' ? 'No instances' : mode === 'inherit' ? 'Inherited from groups' : `${instanceIds.length} specific instance${instanceIds.length === 1 ? '' : 's'}`;
  const launchUrlForInstance = (instance: OxyGenInstance) => `${instance.protocol}://${instance.host}:${instance.port ?? (instance.protocol === 'http' ? 80 : 443)}/optws/oxygen.aspx`;
  const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not checked';
  const formatNullable = (value: string | number | null | undefined, fallback = 'Unknown') => value === null || value === undefined || value === '' ? fallback : String(value);
  const selectedInstance = selectedInstanceDetail || instances.find((instance) => instance.id === selectedInstanceId) || null;
  const InstanceAccessCheckboxes = ({ selected }: { selected: string[] }) => <div className="checkbox-group">{instances.length === 0 ? <span>No instances enrolled yet.</span> : instances.map((instance) => <label key={instance.id} className="checkbox-label"><input name="instanceIds" type="checkbox" value={instance.id} defaultChecked={selected.includes(instance.id)} /> {instance.name}</label>)}</div>;

  async function loadSetupStatus(active = true) {
    try {
      const s = await api<SetupStatus>('/api/setup/status');
      if (!active) return;
      setSetupStatus(s);
      setDbName((current) => current || s.database.defaultDatabaseName);
      setRequiresBootstrap(s.requiresSetup && s.nextStep !== 'complete');
    } catch (err) {
      if (active) setError(err instanceof Error ? err.message : 'Unable to load setup status.');
    }
  }

  async function loadDeploymentStatus(active = true) {
    try {
      const deployment = await api<DeploymentStatus>('/api/setup/deployment');
      if (!active) return;
      setDeploymentStatus(deployment);
      if (deployment.managedMysql && deployment.mysql) {
        setDatabaseMode('managed-mysql');
        setDbHost(deployment.mysql.host);
        setDbPort(deployment.mysql.port);
        setDbName(deployment.mysql.database);
        setLocalAppUser(deployment.mysql.applicationUser);
      } else {
        setDatabaseMode('existing-mysql');
      }
    } catch {
      if (active) setDeploymentStatus({ mode: 'custom', managedMysql: false });
    }
  }

  useEffect(() => {
    let active = true;
    loadSetupStatus(active);
    loadDeploymentStatus(active);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => {
      setIsMobileViewport(query.matches);
      if (!query.matches) setIsMobileDrawerOpen(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isMobileDrawerOpen) return undefined;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setIsMobileDrawerOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileDrawerOpen]);

  async function loadInstances(t = token) {
    if (!t) return;
    const res = await api<{ instances: OxyGenInstance[] }>('/api/instances', { token: t });
    setInstances(res.instances);
    setSelectedInstanceDetail((current) => current ? res.instances.find((instance) => instance.id === current.id) || current : current);
  }

  async function loadDashboard(t = token, mode: DashboardRefreshMode = 'quiet') {
    if (!t) return;
    if (mode === 'manual') clearStatus();
    setIsDashboardRefreshing(true);
    try {
      const res = await api<{ dashboard: DashboardSummary }>('/api/dashboard', { token: t });
      setDashboard(res.dashboard);
      setInstances(res.dashboard.instances);
      setDashboardLastRefreshedAt(new Date().toISOString());
      setSelectedInstanceDetail((current) => current ? res.dashboard.instances.find((instance) => instance.id === current.id) || current : current);
      if (mode === 'manual') setMessage('Dashboard refreshed.');
    } catch (err) {
      if (mode === 'manual') setError(err instanceof Error ? err.message : 'Dashboard refresh failed.');
      else throw err;
    } finally {
      setIsDashboardRefreshing(false);
    }
  }

  async function loadAppLabels(t = token) {
    if (!t) return;
    const res = await api<{ labels: AppLabels }>('/api/app-settings/labels', { token: t });
    setAppLabels(res.labels);
  }

  async function loadLogRetention(t = token) {
    if (!t) return;
    const res = await api<{ logRetention: LogRetentionSettings }>('/api/app-settings/log-retention', { token: t });
    setLogRetention(res.logRetention);
  }

  async function loadAppLogs(t = token) {
    if (!t) return;
    setIsLogsRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: '250' });
      if (logTypeFilter !== 'all') params.set('type', logTypeFilter);
      if (logSeverityFilter !== 'all') params.set('severity', logSeverityFilter);
      if (logUserFilter.trim()) params.set('userName', logUserFilter.trim());
      const res = await api<{ logs: AppLogEntry[] }>(`/api/logs?${params.toString()}`, { token: t });
      setAppLogs(res.logs);
    } finally {
      setIsLogsRefreshing(false);
    }
  }

  async function handlePollerControl(action: 'pause' | 'resume' | 'run-now') {
    clearStatus();
    try {
      const res = await api<{ poller: InstancePollerStatus; summary?: InstancePollerSummary | null }>(`/api/system/poller/${action}`, { method: 'POST', token });
      setDashboard((current) => current ? { ...current, poller: res.poller } : current);
      if (action === 'run-now') {
        const summary = res.summary;
        showStatus(summary ? `Polling runner executed: ${summary.checked} checked, ${summary.skipped} skipped, ${summary.failed} failed.` : 'Polling runner executed.', summary && summary.failed > 0 ? 'warning' : 'success');
      } else {
        showStatus(`Background polling ${action === 'pause' ? 'paused' : 'resumed'}.`, action === 'pause' ? 'warning' : 'success');
      }
      await loadDashboard(token).catch(() => undefined);
      await loadAppLogs(token).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action === 'run-now' ? 'run' : action} background polling.`);
    }
  }

  async function handleSaveLogRetention(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const f = new FormData(e.currentTarget);
    try {
      const res = await api<{ logRetention: LogRetentionSettings }>('/api/app-settings/log-retention', { method: 'PUT', token, body: JSON.stringify({ days: Number(f.get('days')) }) });
      setLogRetention(res.logRetention);
      setMessage(`Log retention updated to ${res.logRetention.days} day${res.logRetention.days === 1 ? '' : 's'}.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Log retention update failed.'); }
  }

  async function handleSaveLabels(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const f = new FormData(e.currentTarget);
    try {
      const res = await api<{ labels: AppLabels }>('/api/app-settings/labels', { method: 'PUT', token, body: JSON.stringify({ tenant: f.get('tenant') }) });
      setAppLabels(res.labels);
      setMessage(`Updated application labels. ${res.labels.tenant} labels are now active.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Label settings update failed.'); }
  }

  async function refreshAdminData(t = token) {
    if (!t) return;
    const [gr, ur, rr, tr] = await Promise.all([
      api<{ groups: Group[] }>('/api/groups', { token: t }),
      api<{ users: UserProfile[] }>('/api/users', { token: t }),
      api<{ roles: Role[] }>('/api/roles', { token: t }),
      api<{ tenants: Tenant[] }>('/api/tenants', { token: t }),
    ]);
    setGroups(gr.groups);
    setUsers(ur.users);
    setRoles(rr.roles);
    setTenants(tr.tenants);
    await loadDashboard(t);
    if (!selectedGroupId && gr.groups[0]) setSelectedGroupId(gr.groups[0].id);
    if (!selectedRole && rr.roles[0]) setSelectedRole(rr.roles[0].name);
  }

  async function restoreSession(t: string) {
    try {
      const restored = await api<AuthProfile>('/api/auth/me', { token: t });
      setProfile(restored);
      await loadAppLabels(t);
      await loadLogRetention(t).catch(() => undefined);
      if (restored.roles.includes('SystemAdmin')) await refreshAdminData(t);
      else await loadDashboard(t);
    } catch (err) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setToken('');
      setProfile(null);
      setDashboard(null);
      setInstances([]);
      setMessage('Session expired. Please sign in again.');
    }
  }

  useEffect(() => {
    if (token) localStorage.setItem(AUTH_STORAGE_KEY, token);
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  }, [token]);

  useEffect(() => {
    if (!token || profile) return;
    void restoreSession(token);
  }, [token, profile]);

  useEffect(() => {
    if (!token || !profile || activeSection !== 'dashboard') return undefined;
    void loadDashboard(token).catch((err) => setError(err instanceof Error ? err.message : 'Dashboard refresh failed.'));
    const refreshTimer = window.setInterval(() => {
      void loadDashboard(token).catch((err) => setError(err instanceof Error ? err.message : 'Dashboard refresh failed.'));
    }, 30000);
    const handleFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void loadDashboard(token).catch((err) => setError(err instanceof Error ? err.message : 'Dashboard refresh failed.'));
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [token, profile, activeSection]);

  useEffect(() => {
    if (!token || !profile || activeSection !== 'settings-logs') return undefined;
    void loadLogRetention(token).catch((err) => setError(err instanceof Error ? err.message : 'Log retention load failed.'));
    void loadAppLogs(token).catch((err) => setError(err instanceof Error ? err.message : 'Logs refresh failed.'));
    const refreshTimer = window.setInterval(() => {
      void loadAppLogs(token).catch((err) => setError(err instanceof Error ? err.message : 'Logs refresh failed.'));
    }, 10000);
    return () => window.clearInterval(refreshTimer);
  }, [token, profile, activeSection, logTypeFilter, logSeverityFilter, logUserFilter]);

  function clearStatus() { setError(''); setMessage(''); setMessageTone('success'); }
  function showStatus(text: string, tone: StatusTone = 'success') { setError(''); setMessage(text); setMessageTone(tone); }
  function showNotImplemented(label: string) { showStatus(`${label}: Not Implemented`, 'warning'); }
  function nav(section: NavSection, implemented = true, label?: string) {
    setActiveSection(section);
    setIsMobileDrawerOpen(false);
    if (!implemented) showNotImplemented(label || section);
  }

  function closeInstanceDashboard() {
    setActiveSection('instances');
    setSelectedInstanceId('');
    setSelectedInstanceDetail(null);
  }

  async function handleDatabaseSetup(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault(); clearStatus();
    const isManaged = databaseMode === 'managed-mysql';
    const payload = {
      mode: databaseMode === 'existing-mysql' ? 'existing-mysql' : 'local-mysql',
      host: databaseMode === 'existing-mysql' ? dbHost : 'localhost',
      port: dbPort,
      database: dbName || 'O2IAS_CMS',
      adminUser: databaseMode === 'existing-mysql' ? connectAdminUser : localAdminUser,
      adminPassword: databaseMode === 'existing-mysql' ? connectPrivilegedDbPassword : createPrivilegedDbPassword,
      appUser: databaseMode === 'existing-mysql' ? connectAppUser : localAppUser,
      appPassword: databaseMode === 'existing-mysql' ? connectAppDbPassword : createAppDbPassword
    };
    try {
      const provision = isManaged
        ? await api<DatabaseSetupResponse>('/api/setup/database/provision-managed', { method: 'POST' })
        : await api<DatabaseSetupResponse>('/api/setup/database/provision', { method: 'POST', body: JSON.stringify(payload) });
      setMessage(`${isManaged ? 'Self-contained MySQL deployment settings loaded.' : 'Database settings validated.'} Saved ${provision.database}; database ${provision.createdDatabase ? 'created/verified' : 'verified'}, user ${provision.createdUser ? 'created/updated' : 'verified'}; proceed to schema update.`);
      await loadSetupStatus();
    } catch (err) { setError(err instanceof Error ? err.message : 'Database setup failed.'); }
  }

  async function handleApplySchema() {
    clearStatus();
    try {
      const schema = await api<DatabaseSetupResponse>('/api/setup/database/apply-schema', { method: 'POST' });
      setMessage(`Schema version ${schema.targetSchemaVersion || setupStatus?.database.targetSchemaVersion || '0.01'} is current for ${schema.database}. Applied versions: ${(schema.appliedVersions || []).join(', ') || 'none'}.`);
      await loadSetupStatus();
    } catch (err) { setError(err instanceof Error ? err.message : 'Schema update failed.'); }
  }

  async function handleBootstrap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget;
    const f = new FormData(el);
    try {
      await api<AuthProfile>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ email: f.get('email'), displayName: f.get('displayName'), password: f.get('password') }) });
      setMessage('Initial setup succeeded. You can now sign in.'); setRequiresBootstrap(false); el.reset(); await loadSetupStatus();
    } catch (err) { setError(err instanceof Error ? err.message : 'Bootstrap failed.'); }
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const f = new FormData(e.currentTarget);
    try {
      const login = await api<{ token: string } & AuthProfile>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
      setToken(login.token);
      setProfile({ user: login.user, roles: login.roles, groups: login.groups });
      setMessage(`Signed in as ${login.user.displayName}.`);
      await loadAppLabels(login.token);
      await loadLogRetention(login.token).catch(() => undefined);
      if (login.roles.includes('SystemAdmin')) await refreshAdminData(login.token);
      else await loadDashboard(login.token);
    } catch (err) { setError(err instanceof Error ? err.message : 'Login failed.'); }
  }

  const tenantPayload = () => selectedTenantId || null;

  async function handleSaveTenant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget; const f = new FormData(el);
    const editing = modal?.kind === 'tenant' ? modal.data as Tenant | undefined : undefined;
    const payload = { name: f.get('name'), description: f.get('description') || null };
    try {
      if (editing) { const res = await api<{ tenant: Tenant }>(`/api/tenants/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated ${tenantLabelLower} ${res.tenant.name}.`); }
      else { const res = await api<{ tenant: Tenant }>('/api/tenants', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created ${tenantLabelLower} ${res.tenant.name}.`); }
      el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? `${tenantLabel} update failed.` : `${tenantLabel} creation failed.`); }
  }

  async function handleSaveRole(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget; const f = new FormData(el);
    const editing = modal?.kind === 'role' ? modal.data as Role | undefined : undefined;
    const payload = { name: f.get('name'), description: f.get('description') || null, tenantId: editing ? editing.tenantId : tenantPayload() };
    try {
      if (editing) { const res = await api<{ role: Role }>(`/api/roles/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated role ${res.role.name}.`); }
      else { const res = await api<{ role: Role }>('/api/roles', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created role ${res.role.name}.`); }
      el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'Role update failed.' : 'Role creation failed.'); }
  }

  async function handleSaveGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget; const f = new FormData(el);
    const editing = modal?.kind === 'group' ? modal.data as Group | undefined : undefined;
    const payload = { name: f.get('name'), description: f.get('description') || null, tenantId: editing ? editing.tenantId : tenantPayload(), instanceAccessMode: f.get('instanceAccessMode'), instanceIds: f.getAll('instanceIds') };
    try {
      if (editing) { const res = await api<{ group: Group }>(`/api/groups/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated group ${res.group.name}.`); }
      else { const res = await api<{ group: Group }>('/api/groups', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created group ${res.group.name}.`); }
      el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'Group update failed.' : 'Group creation failed.'); }
  }

  async function handleSaveUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget; const f = new FormData(el);
    const editing = modal?.kind === 'user' ? modal.data as UserProfile | undefined : undefined;
    const password = String(f.get('password') || '');
    const payload: Record<string, unknown> = { email: f.get('email'), displayName: f.get('displayName'), roleNames: [selectedRole], groupIds: selectedGroupId ? [selectedGroupId] : [], tenantId: editing ? editing.user.tenantId : tenantPayload(), instanceAccessMode: f.get('instanceAccessMode'), instanceIds: f.getAll('instanceIds') };
    if (!editing || password) payload.password = password;
    try {
      if (editing) { await api<UserProfile>(`/api/users/${editing.user.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated user ${f.get('email')}.`); }
      else { await api<UserProfile>('/api/users', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created user ${f.get('email')}.`); }
      el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'User update failed.' : 'User creation failed.'); }
  }

  async function handleSaveInstance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget; const f = new FormData(el);
    const editing = modal?.kind === 'instance' ? modal.data as OxyGenInstance | undefined : undefined;
    const password = String(f.get('password') || '');
    const portValue = f.get('port');
    const username = String(f.get('username') || '').trim() || 'admin';
    const payload: Record<string, unknown> = { name: f.get('name'), description: f.get('description') || null, tenantId: editing ? editing.tenantId : selectedTenantId || null, protocol: f.get('protocol') || 'https', host: f.get('host'), port: portValue ? Number(portValue) : null, username, pollingIntervalSeconds: Number(f.get('pollingIntervalSeconds') || 300), isEnabled: f.get('isEnabled') === 'on' };
    if (!editing || password) payload.password = password;
    try {
      if (editing) { const res = await api<{ instance: OxyGenInstance }>(`/api/instances/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated instance ${res.instance.name}.`); }
      else { const res = await api<{ instance: OxyGenInstance }>('/api/instances', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created instance ${res.instance.name}.`); }
      el.reset(); setModal(null); await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'Instance update failed.' : 'Instance creation failed.'); }
  }

  async function testInstanceConnectivity(instance: OxyGenInstance) {
    clearStatus();
    try {
      const res = await api<{ ok: boolean; status: string; message: string; responseTimeMs?: number | null }>(`/api/instances/${instance.id}/test-connectivity`, { method: 'POST', token });
      const tone: StatusTone = res.ok ? 'success' : res.status === 'ssl-error' ? 'warning' : 'failure';
      showStatus(`${instance.name}: ${res.message} (${res.status}${typeof res.responseTimeMs === 'number' ? `, ${res.responseTimeMs} ms response` : ''})`, tone);
      const data = await api<{ instances: OxyGenInstance[] }>('/api/instances', { token });
      setInstances(data.instances);
      const refreshed = data.instances.find((entry) => entry.id === instance.id) || null;
      if (refreshed && selectedInstanceId === instance.id) setSelectedInstanceDetail(refreshed);
      await loadDashboard(token, 'quiet');
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Connectivity test failed.'); setMessageTone('failure'); }
  }

  async function openInstanceDashboard(instance: OxyGenInstance) {
    clearStatus();
    setSelectedInstanceId(instance.id);
    setSelectedInstanceDetail(instance);
    setActiveSection('instance-dashboard');
    try {
      const res = await api<{ instance: OxyGenInstance }>(`/api/instances/${instance.id}`, { token });
      setSelectedInstanceDetail(res.instance);
      setInstances((current) => current.map((entry) => entry.id === res.instance.id ? res.instance : entry));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load instance dashboard.');
    }
  }

  async function testInstanceFormConnectivity(form: HTMLFormElement | null) {
    if (!form) return;
    clearStatus();
    const editing = modal?.kind === 'instance' ? modal.data as OxyGenInstance | undefined : undefined;
    const f = new FormData(form);
    const password = String(f.get('password') || '');
    if (!password && editing) {
      await testInstanceConnectivity(editing);
      return;
    }
    if (!password) {
      setError('Enter the remote OxyGen password before testing the connection.');
      return;
    }
    try {
      const res = await api<{ ok: boolean; status: string; message: string; durationMs?: number }>('/api/instances/test-connectivity', {
        method: 'POST',
        token,
        body: JSON.stringify({
          protocol: f.get('protocol'),
          host: f.get('host'),
          port: Number(f.get('port') || 0),
          username: String(f.get('username') || '').trim() || undefined,
          password
        })
      });
      setMessage(`${String(f.get('name') || editing?.name || 'Unsaved instance')}: ${res.message} (${res.status}${typeof res.durationMs === 'number' ? `, ${res.durationMs} ms` : ''})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connectivity test failed.');
    }
  }

  async function deleteItem(kind: ModalKind, id: string, label: string) {
    clearStatus();
    if (!window.confirm(`Delete ${label}?`)) return;
    const path = kind === 'user' ? `/api/users/${id}` : kind === 'group' ? `/api/groups/${id}` : kind === 'role' ? `/api/roles/${id}` : kind === 'instance' ? `/api/instances/${id}` : `/api/tenants/${id}`;
    try {
      await api<unknown>(path, { method: 'DELETE', token });
      setMessage(`Deleted ${label}.`);
      if (kind === 'instance') { if (selectedInstanceId === id) { setSelectedInstanceId(''); setSelectedInstanceDetail(null); setActiveSection('instances'); } await loadInstances(); }
      else await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : `Delete failed for ${label}.`); }
  }

  function openCreateUserModal() { setSelectedRole(availableRoles.find((r) => !r.isSystem)?.name || availableRoles[0]?.name || 'Viewer'); setSelectedGroupId(''); setSelectedTenantId(''); setModal({ kind: 'user' }); }
  function openEditUserModal(user: UserProfile) { setSelectedRole(user.roles[0] || 'Viewer'); setSelectedGroupId(user.groups[0]?.id || ''); setSelectedTenantId(user.user.tenantId || ''); setModal({ kind: 'user', data: user }); }
  function openCreateGroupModal() { setSelectedTenantId(''); setModal({ kind: 'group' }); }
  function openEditGroupModal(group: Group) { setSelectedTenantId(group.tenantId || ''); setModal({ kind: 'group', data: group }); }
  function openCreateRoleModal() { setSelectedTenantId(''); setModal({ kind: 'role' }); }
  function openEditRoleModal(role: Role) { setSelectedTenantId(role.tenantId || ''); setModal({ kind: 'role', data: role }); }
  function openCreateTenantModal() { setModal({ kind: 'tenant' }); }
  function openEditTenantModal(tenant: Tenant) { setModal({ kind: 'tenant', data: tenant }); }
  function openCreateInstanceModal() { setSelectedTenantId(''); setInstanceProtocol('https'); setInstancePort('443'); setInstancePollingEnabled(true); setModal({ kind: 'instance' }); }
  function openEditInstanceModal(instance: OxyGenInstance) { setSelectedTenantId(instance.tenantId || ''); setInstanceProtocol(instance.protocol); setInstancePort(String(instance.port ?? (instance.protocol === 'http' ? 80 : 443))); setInstancePollingEnabled(instance.isEnabled); setModal({ kind: 'instance', data: instance }); }

  function handleLogout() { setToken(''); setProfile(null); setDashboard(null); setGroups([]); setUsers([]); setRoles([]); setTenants([]); setInstances([]); setSelectedInstanceId(''); setSelectedInstanceDetail(null); setDashboardLastRefreshedAt(null); setActiveSection('dashboard'); setIsMobileDrawerOpen(false); setMessage('Signed out.'); }
  function toggleAccordion(key: string) { setOpenAccordions((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  function handleSidebarParentClick(key: 'organizations' | 'security' | 'settings') {
    if (!isDrawerExpanded && !isMobileViewport) {
      if (key === 'organizations') { nav('instances'); void loadInstances(); return; }
      if (key === 'security') { nav('users'); return; }
      nav('settings-general');
      return;
    }
    toggleAccordion(key);
  }

  const labeledGroupColumnDefs = useMemo<ManagedGridColumn<GroupGridRow>[]>(() => groupColumnDefs.map((column) => column.key === 'tenant' ? { ...column, title: tenantLabel } : column), [tenantLabel]);
  const labeledRoleColumnDefs = useMemo<ManagedGridColumn<RoleGridRow>[]>(() => roleColumnDefs.map((column) => column.key === 'tenant' ? { ...column, title: tenantLabel } : column), [tenantLabel]);
  const labeledUserColumnDefs = useMemo<ManagedGridColumn<UserGridRow>[]>(() => userColumnDefs.map((column) => column.key === 'tenant' ? { ...column, title: tenantLabel } : column), [tenantLabel]);
  const labeledInstanceColumnDefs = useMemo<ManagedGridColumn<InstanceGridRow>[]>(() => instanceColumnDefs.map((column) => column.key === 'tenant' ? { ...column, title: tenantLabel } : column), [tenantLabel]);

  const userRows = useMemo<UserGridRow[]>(() => users.map((entry) => ({ id: entry.user.id, displayName: entry.user.displayName, email: entry.user.email, role: entry.roles.join(', '), groups: entry.groups.map((group) => group.name).join(', '), tenant: tenantName(entry.user.tenantId), instanceAccess: accessLabel(entry.user.instanceAccessMode, entry.user.instanceIds), raw: entry })), [users, tenants, instances]);
  const groupRows = useMemo<GroupGridRow[]>(() => groups.map((group) => ({ id: group.id, name: group.name, description: group.description || '', tenant: tenantName(group.tenantId), instanceAccess: accessLabel(group.instanceAccessMode, group.instanceIds), raw: group })), [groups, tenants, instances]);
  const roleRows = useMemo<RoleGridRow[]>(() => roles.map((role) => ({ id: role.id, name: role.name, description: role.description || '', tenant: tenantName(role.tenantId), system: role.isSystem ? 'Yes' : 'No', raw: role })), [roles, tenants]);
  const tenantRows = useMemo<TenantGridRow[]>(() => tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, description: tenant.description || '', raw: tenant })), [tenants]);
  const instanceRows = useMemo<InstanceGridRow[]>(() => instances.map((instance) => ({ id: instance.id, name: instance.name, tenant: tenantName(instance.tenantId), host: instance.host, status: instance.status, ssl: instance.sslValid === null ? 'Unknown' : instance.sslValid ? 'Valid' : 'Invalid', license: instance.licenseStatus, processing: instance.processingStatus, enabled: instance.isEnabled ? 'Yes' : 'No', description: instance.description || '', protocol: instance.protocol.toUpperCase(), port: String(instance.port ?? ''), hostname: instance.hostname, baseUrl: instance.baseUrl, apiBaseUrl: instance.apiBaseUrl, username: instance.username, pollingInterval: `${instance.pollingIntervalSeconds}s`, sslExpiresAt: instance.sslExpiresAt || '', lastCheckedAt: instance.lastCheckedAt || '', uptime24h: instance.uptimePercent24h === null ? '' : `${instance.uptimePercent24h}%`, emmQueue: instance.emmQueueStatus, sms: instance.smsStatus, hangfire: instance.hangfireStatus, licenseKey: instance.licenseKey || '', lastError: instance.lastError || '', raw: instance })), [instances, tenants]);
  const appLogRows = useMemo<AppLogGridRow[]>(() => appLogs.map((entry) => ({ id: entry.id, createdAt: formatDateTime(entry.createdAt), type: entry.type, severity: entry.severity, source: entry.source, userName: entry.userName || 'OxyGen CMS', message: entry.message, raw: entry })), [appLogs]);

  const cell = <T extends { raw: ModalEntity }>(edit: (raw: T['raw']) => void, remove?: (raw: T['raw']) => void) => ({ dataItem, tdProps }: GridCustomCellProps) => {
    const row = dataItem as T;
    return <td {...tdProps} className="k-command-cell"><Button className="btn-icon-info" onClick={() => edit(row.raw)} title="Edit" type="button" fillMode="flat"><Pencil /></Button>{remove && <Button className="btn-icon-danger" onClick={() => remove(row.raw)} title="Delete" type="button" fillMode="flat"><Trash2 /></Button>}</td>;
  };
  const GroupActionCell = cell<GroupGridRow>((raw) => openEditGroupModal(raw as Group), (raw) => deleteItem('group', (raw as Group).id, `group ${(raw as Group).name}`));
  const UserActionCell = cell<UserGridRow>((raw) => openEditUserModal(raw as UserProfile), (raw) => deleteItem('user', (raw as UserProfile).user.id, `user ${(raw as UserProfile).user.email}`));
  function RoleActionCell({ dataItem, tdProps }: GridCustomCellProps) {
    const row = dataItem as RoleGridRow;
    if (row.raw.isSystem) {
      return <td {...tdProps} className="k-command-cell"><Button className="btn-icon-info" onClick={() => setMessage(`${row.raw.name} is a protected global role and cannot be modified/deleted.`)} title="Protected system role" type="button" fillMode="flat"><ShieldCheck /></Button></td>;
    }
    return <td {...tdProps} className="k-command-cell"><Button className="btn-icon-info" onClick={() => openEditRoleModal(row.raw)} title="Edit" type="button" fillMode="flat"><Pencil /></Button><Button className="btn-icon-danger" onClick={() => deleteItem('role', row.raw.id, `role ${row.raw.name}`)} title="Delete" type="button" fillMode="flat"><Trash2 /></Button></td>;
  }
  const TenantActionCell = cell<TenantGridRow>((raw) => openEditTenantModal(raw as Tenant), (raw) => deleteItem('tenant', (raw as Tenant).id, `${tenantLabelLower} ${(raw as Tenant).name}`));
  function InstanceActionCell({ dataItem, tdProps }: GridCustomCellProps) {
    const row = dataItem as InstanceGridRow;
    return <td {...tdProps} className="k-command-cell">
      <Button className="btn-icon-info" onClick={() => openInstanceDashboard(row.raw)} title="Open dashboard" aria-label={`Open dashboard for ${row.raw.name}`} type="button" fillMode="flat"><LayoutDashboard /></Button>
      {isSystemAdmin && <Button className="btn-icon-info" onClick={() => openEditInstanceModal(row.raw)} title="Edit" aria-label={`Edit ${row.raw.name}`} type="button" fillMode="flat"><Pencil /></Button>}
      {isSystemAdmin && <Button className="btn-icon-info" onClick={() => testInstanceConnectivity(row.raw)} title="Test connectivity" aria-label={`Test connectivity for ${row.raw.name}`} type="button" fillMode="flat"><RotateCw /></Button>}
      <Button className="btn-icon-info" onClick={() => window.open(launchUrlForInstance(row.raw), '_blank', 'noopener,noreferrer')} title="Launch OxyGen" aria-label={`Launch ${row.raw.name} in OxyGen`} type="button" fillMode="flat"><ExternalLink /></Button>
      {isSystemAdmin && <Button className="btn-icon-danger" onClick={() => deleteItem('instance', row.raw.id, `instance ${row.raw.name}`)} title="Delete" aria-label={`Delete ${row.raw.name}`} type="button" fillMode="flat"><Trash2 /></Button>}
    </td>;
  }

  function MobileStandardActions({ onEdit, onDelete, protectedOnly = false }: { onEdit: () => void; onDelete?: () => void; protectedOnly?: boolean }) {
    if (protectedOnly) return <Button className="mobile-card-action" onClick={onEdit} title="Protected" aria-label="Protected role" type="button" fillMode="flat"><ShieldCheck /></Button>;
    return <>
      <Button className="mobile-card-action" onClick={onEdit} title="Edit" aria-label="Edit record" type="button" fillMode="flat"><Pencil /></Button>
      {onDelete && <Button className="mobile-card-action danger" onClick={onDelete} title="Delete" aria-label="Delete record" type="button" fillMode="flat"><Trash2 /></Button>}
    </>;
  }

  function mobileInstanceActions(row: InstanceGridRow) {
    return <>
      <Button className="mobile-card-action" onClick={() => openInstanceDashboard(row.raw)} title="Open dashboard" aria-label={`Open dashboard for ${row.raw.name}`} type="button" fillMode="flat"><LayoutDashboard /></Button>
      {isSystemAdmin && <Button className="mobile-card-action" onClick={() => openEditInstanceModal(row.raw)} title="Edit" aria-label={`Edit ${row.raw.name}`} type="button" fillMode="flat"><Pencil /></Button>}
      {isSystemAdmin && <Button className="mobile-card-action" onClick={() => testInstanceConnectivity(row.raw)} title="Test connectivity" aria-label={`Test connectivity for ${row.raw.name}`} type="button" fillMode="flat"><RotateCw /></Button>}
      <Button className="mobile-card-action" onClick={() => window.open(launchUrlForInstance(row.raw), '_blank', 'noopener,noreferrer')} title="Launch OxyGen" aria-label={`Launch ${row.raw.name} in OxyGen`} type="button" fillMode="flat"><ExternalLink /></Button>
      {isSystemAdmin && <Button className="mobile-card-action danger" onClick={() => deleteItem('instance', row.raw.id, `instance ${row.raw.name}`)} title="Delete" aria-label={`Delete ${row.raw.name}`} type="button" fillMode="flat"><Trash2 /></Button>}
    </>;
  }

  const dashboardTitle = 'CMS Dashboard';
  const dashboardTenantMatches = (tenantId: TenantId) => dashboardTenantFilter === 'all' || (dashboardTenantFilter === 'global' ? tenantId === null : tenantId === dashboardTenantFilter);
  const hasSslIssue = (instance: OxyGenInstance) => instance.protocol === 'https' && (instance.sslValid === false || instance.status === 'ssl-error');
  const hasConnectivityIssue = (instance: OxyGenInstance) => instance.status !== 'up' && instance.status !== 'unknown' && instance.status !== 'ssl-error';
  const hasLicenseFailure = (instance: OxyGenInstance) => instance.licenseStatus === 'expired' || instance.licenseStatus === 'error' || (!instance.licenseKey && instance.licenseStatus !== 'unknown' && instance.licenseStatus !== 'warning');
  const hasLicenseWarning = (instance: OxyGenInstance) => instance.licenseStatus === 'warning' || (!instance.licenseKey && instance.licenseStatus === 'unknown');
  const hasLicenseIssue = (instance: OxyGenInstance) => hasLicenseFailure(instance) || hasLicenseWarning(instance);
  const hasProcessingFailure = (instance: OxyGenInstance) => instance.processingStatus === 'error' || instance.emmQueueStatus === 'error' || instance.smsStatus === 'error' || instance.hangfireStatus === 'error';
  const hasProcessingWarning = (instance: OxyGenInstance) => instance.processingStatus === 'warning' || instance.emmQueueStatus === 'warning' || instance.smsStatus === 'warning' || instance.hangfireStatus === 'warning';
  const hasProcessingIssue = (instance: OxyGenInstance) => hasProcessingFailure(instance) || hasProcessingWarning(instance);
  const dashboardEnabledInstances = useMemo(() => (dashboard?.instances || []).filter((instance) => instance.isEnabled), [dashboard]);
  const dashboardTenantScopedInstances = useMemo(() => dashboardEnabledInstances.filter((instance) => dashboardTenantMatches(instance.tenantId)), [dashboardEnabledInstances, dashboardTenantFilter]);
  const dashboardFilteredInstances = useMemo(() => dashboardTenantScopedInstances.filter((instance) => dashboardIssueFilter === 'all' || instance.hasIssue), [dashboardTenantScopedInstances, dashboardIssueFilter]);
  const dashboardTenantOptions = useMemo(() => {
    const visibleTenantIds = new Set(dashboardEnabledInstances.map((instance) => instance.tenantId).filter((id): id is string => Boolean(id)));
    return tenants.filter((tenant) => visibleTenantIds.has(tenant.id));
  }, [dashboardEnabledInstances, tenants]);
  const dashboardScopedCounts = useMemo(() => {
    const visibleInstances = dashboardTenantScopedInstances;
    const totalInstances = visibleInstances.length;
    const httpsInstances = visibleInstances.filter((instance) => instance.protocol === 'https').length;
    const tenantFiltered = dashboardTenantFilter !== 'all';
    const selectedTenantId = dashboardTenantFilter === 'global' ? null : dashboardTenantFilter === 'all' ? undefined : dashboardTenantFilter;
    const tenantMatches = (tenantId: TenantId) => !tenantFiltered ? true : tenantId === selectedTenantId;
    const groupsCount = tenantFiltered && groups.length ? groups.filter((group) => tenantMatches(group.tenantId)).length : dashboard?.counts.groups ?? 0;
    const usersCount = tenantFiltered && users.length ? users.filter((entry) => tenantMatches(entry.user.tenantId)).length : dashboard?.counts.users ?? 0;
    const rolesCount = tenantFiltered && roles.length ? roles.filter((role) => tenantMatches(role.tenantId)).length : dashboard?.counts.roles ?? 0;
    return {
      totalInstances,
      healthyInstances: visibleInstances.filter((instance) => (instance.severity || 'unknown') === 'ok').length,
      issueInstances: visibleInstances.filter((instance) => instance.hasIssue).length,
      connectivityIssues: visibleInstances.filter(hasConnectivityIssue).length,
      sslIssues: visibleInstances.filter(hasSslIssue).length,
      httpsInstances,
      licenseIssues: visibleInstances.filter(hasLicenseIssue).length,
      licenseFailures: visibleInstances.filter(hasLicenseFailure).length,
      licenseWarnings: visibleInstances.filter(hasLicenseWarning).length,
      processingIssues: visibleInstances.filter(hasProcessingIssue).length,
      tenants: tenantFiltered ? 0 : dashboard?.counts.tenants ?? tenants.length,
      users: usersCount,
      groups: groupsCount,
      roles: rolesCount
    };
  }, [dashboard, dashboardTenantScopedInstances, dashboardTenantFilter, groups, users, roles, tenants.length]);
  const lastRefreshLabel = dashboardLastRefreshedAt ? new Date(dashboardLastRefreshedAt).toLocaleTimeString() : 'Not refreshed yet';
  const statusTone = (instance: DashboardInstance) => instance.severity === 'failure' ? 'issue' : instance.severity || (instance.status === 'up' && !instance.hasIssue ? 'ok' : instance.status === 'unknown' ? 'unknown' : 'issue');
  const statusLabel = (instance: DashboardInstance) => instance.status === 'up' ? 'UP' : instance.status === 'down' ? 'DOWN' : instance.status === 'auth-error' ? 'AUTH ERROR' : instance.status === 'ssl-error' ? 'SSL WARNING' : instance.status.toUpperCase();
  const responseLabel = (instance: DashboardInstance) => instance.status === 'down' ? 'NO RESPONSE' : instance.responseTimeMs === null ? '—' : `${instance.responseTimeMs} ms`;
  const responseTone = (instance: DashboardInstance) => instance.status === 'down' ? 'issue' : instance.responseTimeMs !== null ? 'ok' : instance.status === 'unknown' ? 'unknown' : statusTone(instance);
  const valueTone = (isGood: boolean, isUnknown = false, isWarning = false) => isWarning ? 'warning' : isUnknown ? 'unknown' : isGood ? 'ok' : 'issue';
  const formatDuration = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${value} ms`;
  const formatHealthStatus = (status: string) => status === 'auth-error' ? 'Auth error' : status === 'ssl-error' ? 'SSL warning' : status.replace(/-/g, ' ');
  const connectivityDetails = (entry: InstanceCheckHistoryEntry | null | undefined): ConnectivityDetailsJson => (entry?.detailsJson && typeof entry.detailsJson === 'object' ? entry.detailsJson as ConnectivityDetailsJson : {});
  const daysUntil = (value: string | null) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000) : null;

  async function openInstanceHealthModal(kind: InstanceHealthModalKind) {
    if (!selectedInstance || !token) return;
    setHealthModal(kind);
    setHealthDetails(null);
    setIsHealthDetailsLoading(true);
    clearStatus();
    try {
      const res = await api<{ healthDetails: InstanceHealthDetails }>(`/api/instances/${selectedInstance.id}/health-details`, { token });
      setHealthDetails(res.healthDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load instance health details.');
    } finally {
      setIsHealthDetailsLoading(false);
    }
  }

  function handleInstanceDetailTileKeyDown(event: KeyboardEvent<HTMLElement>, kind: InstanceHealthModalKind) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void openInstanceHealthModal(kind);
  }

  function renderTimingRow(label: string, step?: ConnectivityStepDetail, future = false) {
    return <li className={`response-step ${future ? 'future' : step?.ok === false ? 'issue' : step?.ok ? 'ok' : 'unknown'}`}><span>{label}</span><strong>{future ? 'Future' : step?.skipped ? 'Skipped' : formatDuration(step?.durationMs)}</strong><small>{future ? 'Not collected yet' : step?.message || (step?.httpStatusCode ? `HTTP ${step.httpStatusCode}` : step?.ok ? 'OK' : 'No detail')}</small></li>;
  }

  function renderInstanceHealthModal() {
    if (!healthModal || !selectedInstance) return null;
    const titleMap: Record<InstanceHealthModalKind, string> = {
      availability: 'Availability Details',
      ssl: 'SSL Details',
      license: 'License Details',
      response: 'Response Details',
      endpoint: 'Connection Details',
      monitoring: 'Health Status',
      workflow: 'Workflow & Components',
      record: 'Metadata'
    };
    const title = `${selectedInstance.name} ${titleMap[healthModal]}`;
    const details = healthDetails;
    const instance = details?.instance || selectedInstance;
    const latestConnectivity = details?.latestConnectivity ?? null;
    const stepDetails = connectivityDetails(latestConnectivity);
    const sslDays = daysUntil(instance.sslExpiresAt);
    const body = <>
      {isHealthDetailsLoading && <p className="panel-copy">Loading health details…</p>}
      {!isHealthDetailsLoading && healthModal === 'availability' && <div className="health-detail-panel"><p className="panel-copy small-copy">Recent persisted availability checks from oldest to newest.</p>{details?.availability.length ? <div className="availability-chart" aria-label="Availability over time">{[...details.availability].reverse().map((entry, index) => <span key={`${entry.startedAt}-${index}`} className={`availability-bar status-${entry.status}`} title={`${formatDateTime(entry.finishedAt || entry.startedAt)} — ${formatHealthStatus(entry.status)}${entry.durationMs !== null ? ` (${entry.durationMs} ms)` : ''}`} />)}</div> : <p className="panel-copy">No availability history has been collected yet.</p>}<dl className="detail-list"><dt>Current status</dt><dd>{formatHealthStatus(instance.status)}</dd><dt>Last checked</dt><dd>{formatDateTime(instance.lastCheckedAt)}</dd><dt>Last success</dt><dd>{formatDateTime(instance.lastSuccessAt)}</dd><dt>Last failure</dt><dd>{formatDateTime(instance.lastFailureAt)}</dd><dt>Last error</dt><dd>{formatNullable(instance.lastError)}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'ssl' && <div className="health-detail-panel"><dl className="detail-list"><dt>Protocol</dt><dd>{instance.protocol.toUpperCase()}</dd><dt>Certificate status</dt><dd>{instance.protocol !== 'https' ? 'Skipped for HTTP' : instance.sslValid === null ? 'Unknown' : instance.sslValid ? 'Valid' : 'Invalid'}</dd><dt>Expires</dt><dd>{formatDateTime(instance.sslExpiresAt)}</dd><dt>Days until expiration</dt><dd>{sslDays === null ? 'Unknown' : sslDays}</dd><dt>Last SSL probe</dt><dd>{formatDuration(stepDetails.ssl?.durationMs)}</dd><dt>SSL message</dt><dd>{stepDetails.ssl?.message || 'No SSL detail collected.'}</dd><dt>Error code</dt><dd>{formatNullable(stepDetails.ssl?.errorCode)}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'license' && <div className="health-detail-panel"><dl className="detail-list"><dt>Status</dt><dd>{instance.licenseStatus}</dd><dt>License key</dt><dd>{formatNullable(instance.licenseKey, 'No license key collected')}</dd><dt>Last license probe</dt><dd>{details?.licenseHistory[0] ? `${formatDateTime(details.licenseHistory[0].finishedAt || details.licenseHistory[0].startedAt)} (${formatDuration(details.licenseHistory[0].durationMs)})` : 'No license history collected.'}</dd></dl><ReadOnlyJsonEditor value={instance.licenseJson ?? { message: 'No license JSON collected yet.' }} /></div>}
      {!isHealthDetailsLoading && healthModal === 'response' && <div className="health-detail-panel"><p className="panel-copy small-copy">Timing from the last persisted check. Response remains the initial connection/TLS timing.</p><ol className="response-step-list">{renderTimingRow('Connect', instance.protocol === 'https' ? stepDetails.ssl : stepDetails.authentication)}{renderTimingRow('Auth', stepDetails.authentication)}{renderTimingRow('License', stepDetails.license)}{renderTimingRow('Settings', undefined, true)}{renderTimingRow('Triggers', undefined, true)}</ol><dl className="detail-list"><dt>Card response</dt><dd>{formatDuration(instance.responseTimeMs)}</dd><dt>Total check duration</dt><dd>{formatDuration(latestConnectivity?.durationMs)}</dd><dt>Last checked</dt><dd>{formatDateTime(instance.lastCheckedAt)}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'endpoint' && <div className="health-detail-panel"><dl className="detail-list"><dt>{tenantLabel}</dt><dd>{tenantName(instance.tenantId)}</dd><dt>Host</dt><dd>{instance.host}</dd><dt>Port</dt><dd>{formatNullable(instance.port)}</dd><dt>Base URL</dt><dd>{instance.baseUrl}</dd><dt>API Base URL</dt><dd>{instance.apiBaseUrl}</dd><dt>Launch URL</dt><dd>{instance.launchUrl}</dd><dt>Username</dt><dd>{instance.username}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'monitoring' && <div className="health-detail-panel"><dl className="detail-list"><dt>Enabled</dt><dd>{instance.isEnabled ? 'Yes' : 'No'}</dd><dt>Last success</dt><dd>{formatDateTime(instance.lastSuccessAt)}</dd><dt>Last failure</dt><dd>{formatDateTime(instance.lastFailureAt)}</dd><dt>Uptime 24h</dt><dd>{instance.uptimePercent24h === null ? 'Unknown' : `${instance.uptimePercent24h}%`}</dd><dt>Uptime 7d</dt><dd>{instance.uptimePercent7d === null ? 'Unknown' : `${instance.uptimePercent7d}%`}</dd><dt>Last error</dt><dd>{formatNullable(instance.lastError, 'None')}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'workflow' && <div className="health-detail-panel"><dl className="detail-list"><dt>Processing</dt><dd>{instance.processingStatus}</dd><dt>EMM Queue</dt><dd>{instance.emmQueueStatus}</dd><dt>SMS</dt><dd>{instance.smsStatus}</dd><dt>Hangfire</dt><dd>{instance.hangfireStatus}</dd><dt>Workflow summary</dt><dd>{instance.workflowSummaryJson ? 'Collected' : 'Not collected yet'}</dd><dt>Global settings</dt><dd>{instance.settingsJson ? 'Collected' : 'Not collected yet'}</dd></dl>{Boolean(instance.workflowSummaryJson) && <ReadOnlyJsonEditor value={instance.workflowSummaryJson} />}{Boolean(instance.settingsJson) && <ReadOnlyJsonEditor value={instance.settingsJson} />}</div>}
      {!isHealthDetailsLoading && healthModal === 'record' && <div className="health-detail-panel"><dl className="detail-list"><dt>Description</dt><dd>{formatNullable(instance.description, 'No description')}</dd><dt>Created</dt><dd>{formatDateTime(instance.createdAt)}</dd><dt>Updated</dt><dd>{formatDateTime(instance.updatedAt)}</dd><dt>Instance ID</dt><dd>{instance.id}</dd></dl></div>}
    </>;
    if (isMobileViewport) {
      return <section className="mobile-health-screen" aria-labelledby="mobile-health-title"><header className="mobile-health-screen-header"><button className="mobile-editor-back" type="button" onClick={() => setHealthModal(null)} aria-label="Back"><ChevronLeft /></button><div><p className="eyebrow small">Instance health</p><h2 id="mobile-health-title">{title}</h2></div></header><div className="mobile-health-screen-body">{body}</div></section>;
    }
    return <Dialog className="cms-dialog instance-health-dialog" title={title} onClose={() => setHealthModal(null)} width={healthModal === 'license' ? 920 : 760}>
      {body}
      <DialogActionsBar><Button className="compact-button instance-health-dialog-close" type="button" fillMode="flat" onClick={() => setHealthModal(null)}>Close</Button></DialogActionsBar>
    </Dialog>;
  }

  function renderDashboard() {
    if (!dashboard) {
      return <article className="panel tenant-dashboard-empty"><p className="panel-copy">Loading dashboard summary…</p></article>;
    }
    const metricCards = [
      { label: 'Instances', value: `${dashboardScopedCounts.healthyInstances} / ${dashboardScopedCounts.totalInstances}`, detail: 'No-issue instances / total instances', tone: dashboardScopedCounts.issueInstances ? 'issue' : 'ok' },
      { label: 'Issues', value: `${dashboardScopedCounts.issueInstances} / ${dashboardScopedCounts.totalInstances}`, detail: 'Instances with any issue / total instances', tone: dashboardScopedCounts.issueInstances ? 'issue' : 'ok' },
      { label: 'Connectivity', value: `${dashboardScopedCounts.connectivityIssues} / ${dashboardScopedCounts.totalInstances}`, detail: 'Connection failures / total instances', tone: dashboardScopedCounts.connectivityIssues ? 'issue' : 'ok' },
      { label: 'SSL', value: `${dashboardScopedCounts.sslIssues} / ${dashboardScopedCounts.httpsInstances}`, detail: 'SSL warnings / HTTPS instances', tone: dashboardScopedCounts.sslIssues ? 'warning' : 'ok' },
      { label: 'License', value: `${dashboardScopedCounts.licenseIssues} / ${dashboardScopedCounts.totalInstances}`, detail: 'Missing, invalid, or expired / total instances', tone: dashboardScopedCounts.licenseFailures ? 'issue' : dashboardScopedCounts.licenseWarnings ? 'warning' : 'ok' },
      { label: 'Processing Issues', value: `${dashboardScopedCounts.processingIssues} / ${dashboardScopedCounts.totalInstances}`, detail: 'Processing issue instances / total instances', tone: dashboardScopedCounts.processingIssues ? 'issue' : 'ok' }
    ];
    const adminCards = [
      ...(dashboardTenantFilter === 'all' ? [{ label: tenantLabelPlural, value: dashboardScopedCounts.tenants, detail: 'Configured tenants', tone: 'neutral' }] : []),
      { label: 'Users', value: dashboardScopedCounts.users, detail: 'Visible user accounts', tone: 'neutral' },
      { label: 'User Groups', value: dashboardScopedCounts.groups, detail: 'Visible access groups', tone: 'neutral' },
      { label: 'Roles', value: dashboardScopedCounts.roles, detail: 'Visible security roles', tone: 'neutral' }
    ];
    const poller = dashboard.poller;
    const pollerTone = !poller || poller.state === 'stopped' || poller.lastError ? 'issue' : poller.state === 'paused' ? 'warning' : 'ok';
    const pollerSummary = poller?.lastSummary ? `${poller.lastSummary.checked} checked · ${poller.lastSummary.skipped} skipped · ${poller.lastSummary.failed} failed` : 'No completed run yet';
    return <div className="tenant-dashboard">
      <section className="tenant-dashboard-hero compact">
        <div><p className="eyebrow small">Dashboard</p><h3>{dashboardTitle}</h3><small className="dashboard-refresh-stamp">Last refreshed: {lastRefreshLabel}</small></div>
        <div className="dashboard-refresh-actions"><label className="dashboard-inline-filter"><span>{tenantLabel}</span><select value={dashboardTenantFilter} onChange={(e) => setDashboardTenantFilter(e.target.value)}><option value="all">All {tenantLabelPlural}</option><option value="global">Global / unassigned</option>{dashboardTenantOptions.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenantOptionLabel(tenant)}</option>)}</select></label><button className="compact-button dashboard-refresh-button" type="button" onClick={() => void loadDashboard(token, 'manual')} disabled={isDashboardRefreshing}><RotateCw className={isDashboardRefreshing ? 'spin-icon' : ''} /><span>Refresh</span></button></div>
      </section>
      <section className="tenant-issue-grid dashboard-admin-kpis" aria-label="Dashboard security and tenant counts">{adminCards.map((card) => <article className={`tenant-issue-card ${card.tone}`} key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>)}</section>
      <section className={`panel service-status-card ${pollerTone}`} aria-label="Background polling service status"><div className="service-status-main"><div className="service-title-block"><p className="eyebrow small">Service</p><div className="service-title-row"><h3>Background Polling Runner</h3><span className="service-state service-title-state">(<span className={`service-dot ${pollerTone}`} /><strong>{poller ? poller.state.toUpperCase() : 'UNAVAILABLE'}</strong>)</span></div></div></div><dl className="service-status-grid"><div><dt>Last run</dt><dd>{formatDateTime(poller?.lastRunAt ?? null)}</dd></div><div><dt>Next run</dt><dd>{formatDateTime(poller?.nextRunAt ?? null)}</dd></div><div className="compact"><dt>In flight</dt><dd>{poller?.inFlight ?? 0}</dd></div><div className="summary-wide"><dt>Last summary</dt><dd>{pollerSummary}</dd></div>{poller?.lastError && <div className="wide"><dt>Last error</dt><dd>{poller.lastError}</dd></div>}</dl>{isSystemAdmin && <div className="service-actions"><Button className="compact-button" type="button" onClick={() => void handlePollerControl('run-now')} disabled={!poller}><RotateCw /> Run Now</Button><Button className="compact-button" type="button" onClick={() => void handlePollerControl(poller?.isPaused ? 'resume' : 'pause')} disabled={!poller}>{poller?.isPaused ? <Play /> : <Pause />}{poller?.isPaused ? 'Resume Poller' : 'Pause Poller'}</Button><Button className="compact-button" type="button" fillMode="flat" onClick={() => nav('settings-logs')}><ClipboardList /> View Logs</Button></div>}</section>
      <section className="tenant-metric-grid dashboard-primary-kpis" aria-label="Dashboard health KPIs">{metricCards.map((card) => <article className={`tenant-metric-card ${card.tone}`} key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>)}</section>
      <section className="tenant-instance-board" aria-label="Tenant instance cards">
        <div className="tenant-section-heading"><div><p className="eyebrow small">Instances</p><h3>Instance Board</h3></div><div className="dashboard-filter-bar"><label>Issues<select value={dashboardIssueFilter} onChange={(e) => setDashboardIssueFilter(e.target.value as DashboardIssueFilter)}><option value="all">All instances</option><option value="issues">Only instances with issues</option></select></label><Button className="compact-button" type="button" onClick={() => { nav('instances'); loadInstances(); }}><Server /> View Grid</Button></div></div>
        {dashboard.instances.length === 0 ? <article className="panel tenant-dashboard-empty"><p className="panel-copy">No instances are currently visible for this dashboard scope.</p></article> : dashboardFilteredInstances.length === 0 ? <article className="panel tenant-dashboard-empty"><p className="panel-copy">No instances match the current dashboard filters.</p></article> : <div className="tenant-instance-card-grid">{dashboardFilteredInstances.map((instance) => {
          const tone = statusTone(instance);
          return <article className={`tenant-instance-card status-${instance.status} ${tone}`} key={instance.id}>
            <header><div><span className="instance-status-dot" /><h4>{instance.name}</h4><p>{instance.host}</p></div><strong>{statusLabel(instance)}</strong></header>
            <div className="tenant-instance-stats"><span><b className={valueTone(instance.uptimePercent24h !== null && instance.uptimePercent24h >= 99, instance.uptimePercent24h === null)}>{instance.uptimePercent24h === null ? '—' : `${instance.uptimePercent24h}%`}</b><small>Uptime</small></span><span><b className={responseTone(instance)}>{responseLabel(instance)}</b><small>Response</small></span><span><b className={hasLicenseFailure(instance) ? 'issue' : hasLicenseWarning(instance) ? 'warning' : valueTone(instance.licenseStatus === 'valid', instance.licenseStatus === 'unknown')}>{instance.licenseStatus}</b><small>License</small></span></div>
            <div className="tenant-instance-foot"><span>{instance.primaryIssue || (instance.hasIssue ? instance.issues[0] : 'No active issues')}</span><div className="tenant-instance-actions" aria-label={`Actions for ${instance.name}`}><Button className="tenant-card-action" onClick={() => openInstanceDashboard(instance)} title="Dashboard" aria-label={`Open dashboard for ${instance.name}`} type="button" fillMode="flat"><LayoutDashboard /></Button><Button className="tenant-card-action" onClick={() => openEditInstanceModal(instance)} disabled={!isSystemAdmin} title="Edit" aria-label={`Edit ${instance.name}`} type="button" fillMode="flat"><Pencil /></Button><Button className="tenant-card-action" onClick={() => testInstanceConnectivity(instance)} disabled={!isSystemAdmin} title="Test" aria-label={`Test connectivity for ${instance.name}`} type="button" fillMode="flat"><RotateCw /></Button><Button className="tenant-card-action" onClick={() => window.open(launchUrlForInstance(instance), '_blank', 'noopener,noreferrer')} title="Open" aria-label={`Launch ${instance.name} in OxyGen`} type="button" fillMode="flat"><ExternalLink /></Button></div></div>
          </article>;
        })}</div>}
      </section>
    </div>;
  }

  function renderSettingsLogs() {
    return <div className="settings-logs-stack">
      <article className="panel settings-panel"><div className="panel-heading"><Settings /><div><p className="eyebrow small">Application settings</p><h3>Log Retention</h3></div></div><p className="panel-copy">Configure how long CMS keeps database-backed application logs. Retention cleanup will use this value as the log maintenance job is expanded.</p><form className="settings-form compact-settings-form" onSubmit={handleSaveLogRetention}><label>Retention days<input name="days" type="number" min={1} max={3650} defaultValue={logRetention.days} required /></label><button type="submit">Save Retention</button></form></article>
      <article className="panel logs-panel"><div className="tenant-section-heading"><div><p className="eyebrow small">Settings</p><h3>Application Logs</h3><p className="panel-copy small-copy">Inspect real-time Audit, Service, CRUD, Connection, Security, and UI activity. Background activity is written as OxyGen CMS.</p></div><Button className="compact-button" type="button" onClick={() => void loadAppLogs(token)} disabled={isLogsRefreshing}><RotateCw className={isLogsRefreshing ? 'spin-icon' : ''} /> Refresh</Button></div><div className="logs-filter-bar"><label>Type<select value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value as 'all' | AppLogType)}>{logTypes.map((type) => <option key={type} value={type}>{type === 'all' ? 'All types' : type}</option>)}</select></label><label>Severity<select value={logSeverityFilter} onChange={(e) => setLogSeverityFilter(e.target.value as 'all' | AppLogSeverity)}>{logSeverities.map((severity) => <option key={severity} value={severity}>{severity === 'all' ? 'All severities' : severity}</option>)}</select></label><label>User Name / Source<input value={logUserFilter} onChange={(e) => setLogUserFilter(e.target.value)} placeholder="OxyGen CMS or user email" /></label></div><ManagedGrid gridKey="application-logs" token={token!} rows={appLogRows} columns={appLogColumnDefs} /></article>
    </div>;
  }

  const sectionMeta = (() => {
    switch (activeSection) {
      case 'dashboard': return { eyebrow: dashboard?.scope === 'tenant' ? tenantLabel : 'Dashboard', heading: dashboardTitle || `Welcome, ${profile?.user.displayName || ''}` };
      case 'organizations': return { eyebrow: 'Organizations', heading: tenantLabelPlural };
      case 'instances': return { eyebrow: 'Organizations', heading: 'Instances' };
      case 'instance-dashboard': return { eyebrow: 'Instance Dashboard', heading: selectedInstance?.name || 'Instance Detail' };
      case 'users': return { eyebrow: 'Security', heading: 'Users' };
      case 'user-groups': return { eyebrow: 'Security', heading: 'User Groups' };
      case 'roles': return { eyebrow: 'Security', heading: 'Roles' };
      case 'settings-general': return { eyebrow: 'Settings', heading: 'General' };
      case 'settings-logs': return { eyebrow: 'Settings', heading: 'Logs' };
      case 'settings-advanced': return { eyebrow: 'Settings', heading: 'Advanced' };
    }
  })();

  const gridSection = activeSection === 'users' || activeSection === 'user-groups' || activeSection === 'roles' || activeSection === 'organizations' || activeSection === 'instances' || activeSection === 'settings-logs';

  function TenantSelect({ disabled = false }: { disabled?: boolean }) {
    return <label>{tenantLabel}<select value={selectedTenantId} disabled={disabled} onChange={(e) => setSelectedTenantId(e.target.value)}><option value="">Global</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenantOptionLabel(tenant)}</option>)}</select>{disabled && <small>{tenantLabel} assignment is locked after creation.</small>}</label>;
  }

  function handleInstanceProtocolChange(protocol: 'http' | 'https') {
    setInstanceProtocol(protocol);
    setInstancePort(protocol === 'http' ? '80' : '443');
  }

  const modalTitle = modal ? `${modal.data ? 'Edit' : 'Create'} ${modal.kind === 'user' ? 'User' : modal.kind === 'group' ? 'Group' : modal.kind === 'role' ? 'Role' : modal.kind === 'instance' ? 'Instance' : tenantLabel}` : '';
  function FormActions({ children }: { children: ReactNode }) {
    return isMobileViewport ? <div className="mobile-editor-actions">{children}</div> : <DialogActionsBar>{children}</DialogActionsBar>;
  }

  function renderModalForm() {
    if (!modal) return null;
    return <>
        {modal.kind === 'user' && <form className="modal-form" onSubmit={handleSaveUser}><label>Email<input name="email" type="email" placeholder="operator@example.com" defaultValue={(modal.data as UserProfile)?.user.email || ''} required /></label><label>Display name<input name="displayName" placeholder="Operator" defaultValue={(modal.data as UserProfile)?.user.displayName || ''} required /></label><label>Password<input name="password" type="password" minLength={12} placeholder={modal.data ? 'Leave blank to keep current password' : '12+ characters'} required={!modal.data} /></label><TenantSelect disabled={Boolean(modal.data)} /><label>Role<select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>{availableRoles.map((r) => <option key={r.id} value={r.name}>{r.name}{r.tenantId ? ` (${tenantName(r.tenantId)})` : ''}</option>)}</select></label><label>Group<select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}><option value="">None</option>{groups.map((g) => <option key={g.id} value={g.id}>{groupOptionLabel(g)}{g.tenantId ? ` (${tenantName(g.tenantId)})` : ''}</option>)}</select></label><label>Instance access<select name="instanceAccessMode" defaultValue={(modal.data as UserProfile)?.user.instanceAccessMode || 'inherit'}><option value="inherit">Inherited from assigned groups</option><option value="none">No instances</option><option value="all">All instances</option><option value="specific">Specific instances</option></select></label><label>Specific instances<InstanceAccessCheckboxes selected={(modal.data as UserProfile)?.user.instanceIds || []} /></label><FormActions><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'group' && <form className="modal-form" onSubmit={handleSaveGroup}><label>Name<input name="name" placeholder="Customer Group A" defaultValue={(modal.data as Group)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Optional" defaultValue={(modal.data as Group)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><label>Instance access<select name="instanceAccessMode" defaultValue={(modal.data as Group)?.instanceAccessMode || 'none'}><option value="none">No instances</option><option value="all">All instances</option><option value="specific">Specific instances</option></select></label><label>Specific instances<InstanceAccessCheckboxes selected={(modal.data as Group)?.instanceIds || []} /></label><FormActions><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'role' && <form className="modal-form" onSubmit={handleSaveRole}><label>Name<input name="name" placeholder="WorkflowReviewer" defaultValue={(modal.data as Role)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Optional" defaultValue={(modal.data as Role)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><FormActions><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'tenant' && <form className="modal-form" onSubmit={handleSaveTenant}><label>Name<input name="name" placeholder={`${tenantLabel} A`} defaultValue={(modal.data as Tenant)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Optional" defaultValue={(modal.data as Tenant)?.description || ''} /></label><FormActions><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'instance' && <form className="modal-form instance-form" onSubmit={handleSaveInstance}><TenantSelect disabled={Boolean(modal.data)} /><label>Name<input name="name" placeholder="Instance display name, e.g. Development" defaultValue={(modal.data as OxyGenInstance)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Optional notes about this deployment" defaultValue={(modal.data as OxyGenInstance)?.description || ''} /></label><fieldset className="form-section"><legend>Connection</legend><div className="form-row three"><label>Protocol<select name="protocol" value={instanceProtocol} onChange={(e) => handleInstanceProtocolChange(e.target.value as 'http' | 'https')}><option value="https">HTTPS</option><option value="http">HTTP</option></select></label><label>Host / URL<input name="host" placeholder="customer.example.com" defaultValue={(modal.data as OxyGenInstance)?.host || ''} required /></label><label>Port<input name="port" type="number" min={1} max={65535} value={instancePort} onChange={(e) => setInstancePort(e.target.value)} required /></label></div></fieldset><fieldset className="form-section"><legend>Authentication</legend><div className="form-row two"><label>Username<input name="username" placeholder="admin (default)" defaultValue={(modal.data as OxyGenInstance)?.username || ''} /></label><label>Password<input name="password" type="password" placeholder={modal.data ? 'Leave blank to keep current password' : 'Remote OxyGen password'} required={!modal.data} /></label></div></fieldset><fieldset className="form-section"><legend>Monitoring</legend><label className="checkbox-label inline-checkbox"><input name="isEnabled" type="checkbox" checked={instancePollingEnabled} onChange={(e) => setInstancePollingEnabled(e.target.checked)} /> Enabled for polling</label>{instancePollingEnabled && <div className="form-row one"><label>Polling interval seconds<input name="pollingIntervalSeconds" type="number" min={60} max={86400} defaultValue={(modal.data as OxyGenInstance)?.pollingIntervalSeconds || 300} required /></label></div>}</fieldset><FormActions><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button className="btn-dialog-test" type="button" fillMode="outline" onClick={(e) => testInstanceFormConnectivity((e.currentTarget as HTMLButtonElement).form)}><RotateCw aria-hidden="true" /> <span>Test Connection</span></Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
    </>;
  }

  return (
    <main className={`shell${profile ? ' app-shell' : ''}`}>
      <header className="brand-bar"><a className="brand-lockup" href="/" aria-label="OxyGen CMS home"><img className="brand-logo" src={oxygenLogo} alt="OxyGen" /><span className="brand-product">Central Management Server</span></a><div className="company-lockup"><span>Powered by</span><img src={o2Logo} alt="O2 Intelligent Automation Solutions" /></div></header>
      {!profile && (
        <>
          <section className="hero"><h1 className="hero-title"><span>Centralized management for</span><span>OxyGen BPM deployments.</span></h1><p className="summary">A lightweight management server for monitoring OxyGen health, licensing, global settings, and workflow status across managed customer environments.</p></section>
          <section className="cards">{capabilities.map(({ icon: Icon, label, detail }) => (<article className="card" key={label}><Icon /><h2>{label}</h2><p>{detail}</p></article>))}</section>
          {setupStatus === null && <p className="status">Checking setup status…</p>}
          {setupStatus?.nextStep === 'database' && (
            <section className="auth-grid single">
              <article className="panel setup-panel">
                <div className="panel-brand-mark-wrap"><img className="panel-brand-mark" src={oxygenFullLogo} alt="OxyGen" /></div>
                <div className="panel-heading"><Database /><div><p className="eyebrow small">Initial CMS setup</p><h2>Configure database</h2></div></div>
                <p className="panel-copy">Step through the database setup one decision at a time. Self-contained deployments use generated secrets from the deployment package; custom deployments collect the MySQL connection details here.</p>
                <div className="wizard-progress">
                  <button className={dbWizardStep === 'mode' ? 'active' : ''} type="button" onClick={() => setDbWizardStep('mode')}>1. Deployment</button>
                  <button className={dbWizardStep === 'connection' ? 'active' : ''} type="button" disabled={databaseMode === 'managed-mysql'} onClick={() => setDbWizardStep('connection')}>2. Connection</button>
                  <button className={dbWizardStep === 'credentials' ? 'active' : ''} type="button" disabled={databaseMode === 'managed-mysql'} onClick={() => setDbWizardStep('credentials')}>3. Credentials</button>
                  <button className={dbWizardStep === 'review' ? 'active' : ''} type="button" onClick={() => setDbWizardStep('review')}>4. Review</button>
                </div>
                {dbWizardStep === 'mode' && (
                  <div className="wizard-step">
                    <p className="panel-copy small-copy">Choose how CMS should reach MySQL. The self-contained option is enabled only when this deployment was started with managed MySQL secrets.</p>
                    {deploymentStatus?.managedMysql && deploymentStatus.mysql && <button className={`choice-card ${databaseMode === 'managed-mysql' ? 'selected' : ''}`} type="button" onClick={() => { setDatabaseMode('managed-mysql'); setDbHost(deploymentStatus.mysql!.host); setDbPort(deploymentStatus.mysql!.port); setDbName(deploymentStatus.mysql!.database); setLocalAppUser(deploymentStatus.mysql!.applicationUser); clearStatus(); }}><strong>Self-contained local MySQL</strong><span>Use the managed MySQL service included with this deployment. No password entry required.</span></button>}
                    <button className={`choice-card ${databaseMode === 'local-mysql' ? 'selected' : ''}`} type="button" onClick={() => { setDatabaseMode('local-mysql'); setDbHost('localhost'); clearStatus(); }}><strong>Create/configure database on local MySQL server</strong><span>Use a MySQL server already running on this host or mapped locally.</span></button>
                    <button className={`choice-card ${databaseMode === 'existing-mysql' ? 'selected' : ''}`} type="button" onClick={() => { setDatabaseMode('existing-mysql'); clearStatus(); }}><strong>Connect to existing MySQL server</strong><span>Use a remote or custom MySQL server and supply existing credentials.</span></button>
                    <button type="button" onClick={() => setDbWizardStep(databaseMode === 'managed-mysql' ? 'review' : 'connection')}>Continue</button>
                  </div>
                )}
                {dbWizardStep === 'connection' && (
                  <div className="wizard-step">
                    {databaseMode === 'local-mysql' ? <p className="panel-copy small-copy">Local mode keeps the host fixed to <strong>localhost</strong>. Set the MySQL listening port and CMS database name.</p> : <p className="panel-copy small-copy">Existing-server mode connects to a MySQL server you manage. Enter host, port, and target CMS database.</p>}
                    {databaseMode === 'existing-mysql' && <label>SQL server host<input value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="db.example.com" required /></label>}
                    <label>SQL server port<input type="number" value={dbPort} onChange={(e) => setDbPort(Number(e.target.value || 3306))} required /></label>
                    <label>Database name<input value={dbName} onChange={(e) => setDbName(e.target.value)} required /></label>
                    <div className="wizard-actions"><button type="button" className="secondary" onClick={() => setDbWizardStep('mode')}>Back</button><button type="button" onClick={() => setDbWizardStep('credentials')}>Continue</button></div>
                  </div>
                )}
                {dbWizardStep === 'credentials' && (
                  <div className="wizard-step">
                    {databaseMode === 'local-mysql' ? (
                      <>
                        <p className="panel-copy small-copy">Use an existing privileged MySQL user to create/update the CMS database and application user. Only the application DB password is generated in this workflow.</p>
                        <label>Privileged MySQL user<input value={localAdminUser} onChange={(e) => setLocalAdminUser(e.target.value)} required /></label>
                        <label>Privileged MySQL password<span className="password-input-wrap"><input type={showCreatePrivilegedDbPassword ? 'text' : 'password'} value={createPrivilegedDbPassword} onChange={(e) => setCreatePrivilegedDbPassword(e.target.value)} required /><button className="password-visibility-toggle" type="button" onClick={() => setShowCreatePrivilegedDbPassword((visible) => !visible)}>{showCreatePrivilegedDbPassword ? <EyeOff /> : <Eye />}</button></span><small>Enter the existing privileged user's password. CMS does not generate this credential.</small></label>
                        <label>Application DB user<input value={localAppUser} onChange={(e) => setLocalAppUser(e.target.value)} required /></label>
                        <label>Application DB password<div className="password-action-row"><span className="password-input-wrap"><input type={showCreateAppDbPassword ? 'text' : 'password'} minLength={12} value={createAppDbPassword} onChange={(e) => setCreateAppDbPassword(e.target.value)} required /><button className="password-visibility-toggle" type="button" onClick={() => setShowCreateAppDbPassword((visible) => !visible)}>{showCreateAppDbPassword ? <EyeOff /> : <Eye />}</button></span><button className="compact-button" type="button" onClick={() => { setCreateAppDbPassword(generateSecurePassword()); setShowCreateAppDbPassword(true); }}><RotateCw /> Generate Password</button></div></label>
                      </>
                    ) : (
                      <>
                        <p className="panel-copy small-copy">Supply existing server credentials. Passwords start blank and are not generated in this workflow.</p>
                        <label>Privileged MySQL user<input value={connectAdminUser} onChange={(e) => setConnectAdminUser(e.target.value)} placeholder="Privileged schema user" required /></label>
                        <label>Privileged MySQL password<span className="password-input-wrap"><input type={showConnectPrivilegedDbPassword ? 'text' : 'password'} value={connectPrivilegedDbPassword} onChange={(e) => setConnectPrivilegedDbPassword(e.target.value)} required /><button className="password-visibility-toggle" type="button" onClick={() => setShowConnectPrivilegedDbPassword((visible) => !visible)}>{showConnectPrivilegedDbPassword ? <EyeOff /> : <Eye />}</button></span></label>
                        <label>Application DB user<input value={connectAppUser} onChange={(e) => setConnectAppUser(e.target.value)} placeholder="Existing application user" required /></label>
                        <label>Application DB password<span className="password-input-wrap"><input type={showConnectAppDbPassword ? 'text' : 'password'} minLength={12} value={connectAppDbPassword} onChange={(e) => setConnectAppDbPassword(e.target.value)} required /><button className="password-visibility-toggle" type="button" onClick={() => setShowConnectAppDbPassword((visible) => !visible)}>{showConnectAppDbPassword ? <EyeOff /> : <Eye />}</button></span></label>
                      </>
                    )}
                    <div className="wizard-actions"><button type="button" className="secondary" onClick={() => setDbWizardStep('connection')}>Back</button><button type="button" onClick={() => setDbWizardStep('review')}>Continue</button></div>
                  </div>
                )}
                {dbWizardStep === 'review' && (
                  <div className="wizard-step">
                    <p className="panel-copy small-copy">Review the setup summary before CMS saves database settings and advances to schema version <strong>{setupStatus.database.targetSchemaVersion}</strong>.</p>
                    <div className="review-list"><span>Mode</span><strong>{databaseMode === 'managed-mysql' ? 'Self-contained local MySQL' : databaseMode === 'local-mysql' ? 'Local MySQL server' : 'Existing MySQL server'}</strong><span>Host</span><strong>{databaseMode === 'local-mysql' ? 'localhost' : dbHost}</strong><span>Port</span><strong>{dbPort}</strong><span>Database</span><strong>{dbName}</strong><span>Runtime user</span><strong>{databaseMode === 'existing-mysql' ? connectAppUser : localAppUser}</strong></div>
                    <div className="wizard-actions"><button type="button" className="secondary" onClick={() => setDbWizardStep(databaseMode === 'managed-mysql' ? 'mode' : 'credentials')}>Back</button><button type="button" onClick={() => handleDatabaseSetup()}>{databaseMode === 'managed-mysql' ? 'Provision self-contained database' : 'Test and save database settings'}</button></div>
                  </div>
                )}
              </article>
            </section>
          )}
          {setupStatus?.nextStep === 'schema' && (<section className="auth-grid single"><article className="panel setup-panel"><div className="panel-heading"><Database /><div><p className="eyebrow small">Initial CMS setup</p><h2>Update database schema</h2></div></div><p className="panel-copy">Database settings are saved. The wizard is ready to apply CMS schema version <strong>{setupStatus.database.targetSchemaVersion}</strong>. Pre-production CMS schemas use 0.xx version numbers.</p><button type="button" onClick={handleApplySchema}>Apply schema version {setupStatus.database.targetSchemaVersion}</button></article></section>)}
          {setupStatus?.nextStep === 'admin' && (<section className="auth-grid single"><article className="panel setup-panel"><div className="panel-brand-mark-wrap"><img className="panel-brand-mark" src={oxygenFullLogo} alt="OxyGen" /></div><div className="panel-heading"><ShieldCheck /><div><p className="eyebrow small">Initial CMS setup</p><h2>Create the first administrator</h2></div></div><p className="panel-copy">Database setup is complete. Create the first local administrator to finish setup.</p><form onSubmit={handleBootstrap}><label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label><label>Display name<input name="displayName" placeholder="System Admin" required /></label><label>Password<input name="password" type="password" minLength={12} placeholder="12+ characters" required /></label><button type="submit">Create administrator</button></form></article></section>)}
          {setupStatus?.nextStep === 'complete' && (<section className="auth-grid single"><article className="panel"><div className="panel-heading"><UserPlus /><div><p className="eyebrow small">Secure access</p><h2>Sign in</h2></div></div><form onSubmit={handleLogin}><label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label><label>Password<input name="password" type="password" required /></label><button type="submit">Sign in</button></form></article></section>)}
        </>
      )}

      {profile && !modal && !healthModal && <div className="mobile-app-bar"><button className="mobile-chrome-button" type="button" onClick={activeSection === 'instance-dashboard' ? closeInstanceDashboard : () => setIsMobileDrawerOpen(true)} aria-label={activeSection === 'instance-dashboard' ? 'Back' : 'Open navigation'}>{activeSection === 'instance-dashboard' ? <ChevronLeft /> : <Menu />}</button><a className="brand-lockup mobile-brand-lockup" href="/" aria-label="OxyGen CMS home"><img className="brand-logo" src={oxygenLogo} alt="OxyGen" /><span className="brand-product">Central Management Server</span></a><button className="mobile-chrome-button" type="button" onClick={() => setIsMobileDrawerOpen(true)} aria-label="Open navigation menu"><Menu /></button></div>}

      {profile && isMobileViewport && isMobileDrawerOpen && <button className="mobile-drawer-backdrop" type="button" aria-label="Close navigation" onClick={() => setIsMobileDrawerOpen(false)} />}

      {profile && (<div className={`admin-layout ${isDrawerExpanded ? 'drawer-expanded' : 'drawer-collapsed'} ${isMobileDrawerOpen ? 'mobile-drawer-open' : ''}`}><aside className={`admin-sidebar ${isDrawerExpanded ? 'expanded' : 'collapsed'} ${isMobileDrawerOpen ? 'mobile-open' : ''}`}><button className="mobile-drawer-close" type="button" onClick={() => setIsMobileDrawerOpen(false)} aria-label="Close navigation"><X /></button><button className="sidebar-toggle" type="button" onClick={() => setIsDrawerExpanded((v) => !v)} aria-label={isDrawerExpanded ? 'Collapse navigation' : 'Expand navigation'}>{isDrawerExpanded ? <ChevronLeft /> : <ChevronRight />}</button><div className="sidebar-user"><UserCircle /><div><span className="su-name">{profile.user.displayName}</span><span className="su-role">{profile.roles[0]}</span></div></div><nav className="sidebar-nav"><button className={`nav-link${activeSection === 'dashboard' ? ' active' : ''}`} onClick={() => nav('dashboard')}><LayoutDashboard /><span>Dashboard</span></button><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => handleSidebarParentClick('organizations')}><Server /><span>Organizations</span>{openAccordions.has('organizations') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('organizations') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'organizations' ? ' active' : ''}`} onClick={() => nav('organizations')}><span>{tenantLabelPlural}</span></button><button className={`nav-link child${activeSection === 'instances' ? ' active' : ''}`} onClick={() => { nav('instances'); loadInstances(); }}><span>Instances</span></button></div>)}</div><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => handleSidebarParentClick('security')}><ShieldCheck /><span>Security</span>{openAccordions.has('security') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('security') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'users' ? ' active' : ''}`} onClick={() => nav('users')}><span>Users</span></button><button className={`nav-link child${activeSection === 'user-groups' ? ' active' : ''}`} onClick={() => nav('user-groups')}><span>User Groups</span></button><button className={`nav-link child${activeSection === 'roles' ? ' active' : ''}`} onClick={() => nav('roles')}><span>Roles</span></button></div>)}</div><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => handleSidebarParentClick('settings')}><Settings /><span>Settings</span>{openAccordions.has('settings') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('settings') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'settings-general' ? ' active' : ''}`} onClick={() => nav('settings-general')}><span>General</span></button><button className={`nav-link child${activeSection === 'settings-logs' ? ' active' : ''}`} onClick={() => nav('settings-logs')}><span>Logs</span></button><button className={`nav-link child${activeSection === 'settings-advanced' ? ' active' : ''}`} onClick={() => nav('settings-advanced', false, 'Advanced Settings')}><span>Advanced</span></button></div>)}</div></nav><button className="sidebar-logout" onClick={handleLogout}><LogOut /><span>Sign out</span></button></aside>
        <section className={`admin-content ${gridSection ? 'grid-section' : ''}`}>{activeSection !== 'dashboard' && <div className="page-header"><p className="eyebrow small">{sectionMeta.eyebrow}</p><h2>{sectionMeta.heading}</h2></div>}
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'organizations' && isSystemAdmin && <ManagedGrid gridKey="tenants" token={token!} rows={tenantRows} columns={tenantColumnDefs} actionCell={TenantActionCell} mobileActions={(row) => <MobileStandardActions onEdit={() => openEditTenantModal(row.raw)} onDelete={() => deleteItem('tenant', row.raw.id, `${tenantLabelLower} ${row.raw.name}`)} />} toolbar={<Button className="btn-create" onClick={openCreateTenantModal} type="button" themeColor="primary"><Plus /> Create “{tenantLabel}”</Button>} />}
          {activeSection === 'instances' && <ManagedGrid gridKey="instances" token={token!} rows={instanceRows} columns={labeledInstanceColumnDefs} actionCell={InstanceActionCell} actionWidth={180} mobileActions={mobileInstanceActions} toolbar={isSystemAdmin ? <Button className="btn-create" onClick={openCreateInstanceModal} type="button" themeColor="primary"><Plus /> Enroll Instance</Button> : null} />}
          {activeSection === 'instance-dashboard' && selectedInstance && <div className="instance-detail-dashboard"><div className="instance-dashboard-actions"><Button className="compact-button" type="button" fillMode="flat" onClick={closeInstanceDashboard}><ChevronLeft /> Back to Instances</Button>{isSystemAdmin && <Button className="compact-button" type="button" onClick={() => openEditInstanceModal(selectedInstance)}><Pencil /> Edit</Button>}{isSystemAdmin && <Button className="compact-button" type="button" onClick={() => testInstanceConnectivity(selectedInstance)}><RotateCw /> Test Connectivity</Button>}<Button className="compact-button" type="button" onClick={() => window.open(launchUrlForInstance(selectedInstance), '_blank', 'noopener,noreferrer')}><ExternalLink /> Launch OxyGen</Button></div><div className="instance-health-strip"><button className={`instance-health-card clickable status-${selectedInstance.status}`} type="button" onClick={() => void openInstanceHealthModal('availability')}><span>Availability</span><strong>{selectedInstance.status}</strong><small>{formatDateTime(selectedInstance.lastCheckedAt)}</small></button><button className="instance-health-card clickable" type="button" onClick={() => void openInstanceHealthModal('ssl')}><span>SSL</span><strong>{selectedInstance.sslValid === null ? 'Unknown' : selectedInstance.sslValid ? 'Valid' : 'Invalid'}</strong><small>Expires {formatDateTime(selectedInstance.sslExpiresAt)}</small></button><button className="instance-health-card clickable" type="button" onClick={() => void openInstanceHealthModal('license')}><span>License</span><strong>{selectedInstance.licenseStatus}</strong><small>{formatNullable(selectedInstance.licenseKey, 'No license key collected')}</small></button><button className="instance-health-card clickable" type="button" onClick={() => void openInstanceHealthModal('response')}><span>Response</span><strong>{selectedInstance.responseTimeMs === null ? '—' : `${selectedInstance.responseTimeMs} ms`}</strong><small>Polling every {selectedInstance.pollingIntervalSeconds}s</small></button></div><div className="instance-detail-grid"><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('endpoint')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'endpoint')}><div className="panel-heading"><Server /><div><p className="eyebrow small">Endpoint</p><h3>Connection Details</h3></div></div><dl className="detail-list"><dt>{tenantLabel}</dt><dd>{tenantName(selectedInstance.tenantId)}</dd><dt>Host</dt><dd>{selectedInstance.host}</dd><dt>Port</dt><dd>{formatNullable(selectedInstance.port)}</dd><dt>Base URL</dt><dd>{selectedInstance.baseUrl}</dd><dt>API Base URL</dt><dd>{selectedInstance.apiBaseUrl}</dd><dt>Launch URL</dt><dd>{selectedInstance.launchUrl}</dd><dt>Username</dt><dd>{selectedInstance.username}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('monitoring')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'monitoring')}><div className="panel-heading"><Activity /><div><p className="eyebrow small">Monitoring</p><h3>Health Status</h3></div></div><dl className="detail-list"><dt>Enabled</dt><dd>{selectedInstance.isEnabled ? 'Yes' : 'No'}</dd><dt>Last Success</dt><dd>{formatDateTime(selectedInstance.lastSuccessAt)}</dd><dt>Last Failure</dt><dd>{formatDateTime(selectedInstance.lastFailureAt)}</dd><dt>Uptime 24h</dt><dd>{selectedInstance.uptimePercent24h === null ? 'Unknown' : `${selectedInstance.uptimePercent24h}%`}</dd><dt>Uptime 7d</dt><dd>{selectedInstance.uptimePercent7d === null ? 'Unknown' : `${selectedInstance.uptimePercent7d}%`}</dd><dt>Last Error</dt><dd>{formatNullable(selectedInstance.lastError, 'None')}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('workflow')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'workflow')}><div className="panel-heading"><Database /><div><p className="eyebrow small">OxyGen BPM</p><h3>Workflow & Components</h3></div></div><dl className="detail-list"><dt>Processing</dt><dd>{selectedInstance.processingStatus}</dd><dt>EMM Queue</dt><dd>{selectedInstance.emmQueueStatus}</dd><dt>SMS</dt><dd>{selectedInstance.smsStatus}</dd><dt>Hangfire</dt><dd>{selectedInstance.hangfireStatus}</dd><dt>Workflow Summary</dt><dd>{selectedInstance.workflowSummaryJson ? 'Collected' : 'Not collected yet'}</dd><dt>Global Settings</dt><dd>{selectedInstance.settingsJson ? 'Collected' : 'Not collected yet'}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('record')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'record')}><div className="panel-heading"><ShieldCheck /><div><p className="eyebrow small">Record</p><h3>Metadata</h3></div></div><dl className="detail-list"><dt>Description</dt><dd>{formatNullable(selectedInstance.description, 'No description')}</dd><dt>Created</dt><dd>{formatDateTime(selectedInstance.createdAt)}</dd><dt>Updated</dt><dd>{formatDateTime(selectedInstance.updatedAt)}</dd><dt>Instance ID</dt><dd>{selectedInstance.id}</dd></dl></article></div></div>}
          {activeSection === 'instance-dashboard' && !selectedInstance && <article className="panel"><p className="panel-copy">Select an instance from the grid to open its dashboard.</p><Button className="compact-button" type="button" onClick={() => setActiveSection('instances')}><ChevronLeft /> Back to Instances</Button></article>}
          {activeSection === 'user-groups' && isSystemAdmin && <ManagedGrid gridKey="user-groups" token={token!} rows={groupRows} columns={labeledGroupColumnDefs} actionCell={GroupActionCell} mobileActions={(row) => <MobileStandardActions onEdit={() => openEditGroupModal(row.raw)} onDelete={() => deleteItem('group', row.raw.id, `group ${row.raw.name}`)} />} toolbar={<Button className="btn-create" onClick={openCreateGroupModal} type="button" themeColor="primary"><Plus /> Create &quot;Group&quot;</Button>} />}
          {activeSection === 'users' && isSystemAdmin && <ManagedGrid gridKey="users" token={token!} rows={userRows} columns={labeledUserColumnDefs} actionCell={UserActionCell} mobileActions={(row) => <MobileStandardActions onEdit={() => openEditUserModal(row.raw)} onDelete={() => deleteItem('user', row.raw.user.id, `user ${row.raw.user.email}`)} />} toolbar={<Button className="btn-create" onClick={openCreateUserModal} type="button" themeColor="primary"><Plus /> Create &quot;User&quot;</Button>} />}
          {activeSection === 'roles' && isSystemAdmin && <ManagedGrid gridKey="roles" token={token!} rows={roleRows} columns={labeledRoleColumnDefs} actionCell={RoleActionCell} mobileActions={(row) => row.raw.isSystem ? <MobileStandardActions protectedOnly onEdit={() => setMessage(`${row.raw.name} is a protected global role and cannot be modified/deleted.`)} /> : <MobileStandardActions onEdit={() => openEditRoleModal(row.raw)} onDelete={() => deleteItem('role', row.raw.id, `role ${row.raw.name}`)} />} toolbar={<Button className="btn-create" onClick={openCreateRoleModal} type="button" themeColor="primary"><Plus /> Create &quot;Role&quot;</Button>} />}
          {activeSection === 'settings-general' && <article className="panel settings-panel"><div className="panel-heading"><Settings /><div><p className="eyebrow small">Application settings</p><h3>Labels</h3></div></div><p className="panel-copy">Customize display labels used by the application without changing the underlying data model.</p><form className="settings-form" onSubmit={handleSaveLabels}><label>Tenant<input name="tenant" defaultValue={tenantLabel} placeholder="Tenant" required /></label><small>Example: change this to Partner to display Partner labels throughout CMS.</small><button type="submit">Save Labels</button></form></article>}{activeSection === 'settings-logs' && renderSettingsLogs()}{activeSection === 'settings-advanced' && <article className="panel"><p className="panel-copy">Advanced settings: Not Implemented.</p></article>}
        </section></div>)}

      {profile && !modal && !healthModal && <nav className="mobile-bottom-bar" aria-label="Mobile actions">
        {activeSection === 'instance-dashboard' && selectedInstance ? <>
          {isSystemAdmin && <button type="button" onClick={() => openEditInstanceModal(selectedInstance)}><Pencil /><span>Edit</span></button>}
          {isSystemAdmin && <button type="button" onClick={() => testInstanceConnectivity(selectedInstance)}><RotateCw /><span>Test</span></button>}
          <button type="button" className="primary" onClick={() => window.open(launchUrlForInstance(selectedInstance), '_blank', 'noopener,noreferrer')}><ExternalLink /><span>Launch</span></button>
        </> : <>
          <button type="button" className={activeSection === 'dashboard' ? 'active' : ''} onClick={() => nav('dashboard')}><LayoutDashboard /><span>Home</span></button>
          <button type="button" className={activeSection === 'instances' ? 'active' : ''} onClick={() => { nav('instances'); loadInstances(); }}><Server /><span>Instances</span></button>
          {isSystemAdmin && <button type="button" className="primary" onClick={openCreateInstanceModal}><Plus /><span>Enroll</span></button>}
          {isSystemAdmin && <button type="button" className={activeSection === 'users' || activeSection === 'user-groups' || activeSection === 'roles' ? 'active' : ''} onClick={() => nav('users')}><ShieldCheck /><span>Security</span></button>}
          <button type="button" className={activeSection === 'settings-general' ? 'active' : ''} onClick={() => nav('settings-general')}><Settings /><span>Settings</span></button>
        </>}
      </nav>}


      {renderInstanceHealthModal()}

      {modal && isMobileViewport && <section className="mobile-editor-screen" aria-labelledby="mobile-editor-title">
        <header className="mobile-editor-screen-header"><button className="mobile-editor-back" type="button" onClick={() => setModal(null)} aria-label="Back"><ChevronLeft /></button><h2 id="mobile-editor-title">{modalTitle}</h2></header>
        <div className="mobile-editor-screen-body">{renderModalForm()}</div>
      </section>}

      {modal && !isMobileViewport && <Dialog className="cms-dialog" title={modalTitle} onClose={() => setModal(null)} width={modal?.kind === 'instance' ? 760 : 520}>
        {renderModalForm()}
      </Dialog>}
      {(message || error) && <p className={`status ${error ? 'failure error' : messageTone}`}>{error || message}</p>}
    </main>
  );
}
