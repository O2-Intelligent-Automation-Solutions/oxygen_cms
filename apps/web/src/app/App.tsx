import {
  Activity, Archive, ArchiveRestore, ChevronDown, ChevronLeft, ChevronRight, Database, Download, ExternalLink, Eye, EyeOff, LayoutDashboard,
  ClipboardList, LoaderCircle, LogOut, Menu, Pause, Pencil, Play, Plus, RotateCw, Server, Settings, ShieldCheck, Trash2, Upload, UserCircle, UserPlus, X
} from 'lucide-react';
import { type GridCustomCellProps } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { MultiSelect, type MultiSelectChangeEvent, type MultiSelectFilterChangeEvent } from '@progress/kendo-react-dropdowns';
import { Editor, EditorTools, type EditorChangeEvent } from '@progress/kendo-react-editor';
import { createJSONEditor, Mode, type Content } from 'vanilla-jsoneditor';
import { type MouseEvent, FormEvent, Fragment, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ManagedGrid, type ManagedGridColumn } from './ManagedGrid';
import o2Logo from '../brand/assets/o2-ias-logo-dark.png';
import oxygenLogo from '../brand/assets/oxygen-logo-inline-dark.png';
import oxygenFullLogo from '../brand/assets/oxygen-logo-full-dark.png';

const {
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
  ForeColor, BackColor, CleanFormatting,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, OrderedList, UnorderedList, NumberedList, BulletedList,
  Undo, Redo, FontSize, FontName, FormatBlock,
  Link, Unlink, InsertImage, ViewHtml, InsertTable, InsertFile,
  SelectAll, Print, Pdf,
  TableProperties, TableCellProperties,
  AddRowBefore, AddRowAfter, AddColumnBefore, AddColumnAfter,
  DeleteRow, DeleteColumn, DeleteTable, MergeCells, SplitCell
} = EditorTools;
const notesEditorTools = [
  [Bold, Italic, Underline, Strikethrough],
  [Subscript, Superscript],
  ForeColor,
  BackColor,
  [CleanFormatting],
  [AlignLeft, AlignCenter, AlignRight, AlignJustify],
  [Indent, Outdent],
  [OrderedList, UnorderedList],
  [NumberedList, BulletedList],
  FontSize,
  FontName,
  FormatBlock,
  [SelectAll],
  [Undo, Redo],
  [Link, Unlink, InsertImage, ViewHtml],
  [InsertTable, InsertFile],
  [Pdf, Print],
  [TableProperties, TableCellProperties],
  [AddRowBefore, AddRowAfter, AddColumnBefore, AddColumnAfter],
  [DeleteRow, DeleteColumn, DeleteTable],
  [MergeCells, SplitCell]
];

type TenantId = string | null;
type RoleName = string;
type GroupInstanceAccessMode = 'none' | 'all' | 'specific';
type UserInstanceAccessMode = 'inherit' | 'none' | 'all' | 'specific';
type PublicUser = { id: string; email: string; displayName: string; tenantId: TenantId; instanceAccessMode: UserInstanceAccessMode; instanceIds: string[]; isActive: boolean };
type PermissionKey = string;
type AccessInstanceOption = { id: string; text: string; tenant: string; host: string };
type AuthProfile = { user: PublicUser; roles: RoleName[]; permissions: PermissionKey[]; groups: Array<{ id: string; name: string; tenantId: TenantId; instanceAccessMode: GroupInstanceAccessMode; instanceIds: string[] }> };
type Group = { id: string; name: string; description: string | null; tenantId: TenantId; instanceAccessMode: GroupInstanceAccessMode; instanceIds: string[] };
type Role = { id: string; name: string; description: string | null; tenantId: TenantId; isSystem: boolean; permissionKeys: PermissionKey[] };
type Tenant = { id: string; name: string; description: string | null };
type UserProfile = AuthProfile;
type OxyGenInstance = { id: string; name: string; description: string | null; tenantId: TenantId; protocol: 'http' | 'https'; host: string; port: number | null; hostname: string; baseUrl: string; launchUrl: string; apiBaseUrl: string; username: string; pollingIntervalSeconds: number; isEnabled: boolean; checkLicense: boolean; archived: boolean; metadata: unknown | null; notes: string | null; status: string; sslValid: boolean | null; sslExpiresAt: string | null; lastCheckedAt: string | null; lastSuccessAt: string | null; lastFailureAt: string | null; uptimePercent24h: number | null; uptimePercent7d: number | null; responseTimeMs: number | null; processingStatus: string; emmQueueStatus: string; smsStatus: string; hangfireStatus: string; licenseKey: string | null; licenseStatus: string; licenseJson: unknown | null; settingsJson: unknown | null; workflowSummaryJson: unknown | null; lastError: string | null; createdAt: string; updatedAt: string };
type DashboardSeverity = 'ok' | 'warning' | 'failure' | 'unknown';
type InstanceHealthModalKind = 'availability' | 'ssl' | 'license' | 'response' | 'endpoint' | 'monitoring' | 'workflow' | 'settings' | 'metadata' | 'notes' | 'record';
type InstanceCheckHistoryEntry = { checkType: string; status: string; startedAt: string; finishedAt: string | null; durationMs: number | null; httpStatusCode: number | null; errorCode: string | null; errorMessage: string | null; detailsJson: unknown | null };
type InstanceHealthDetails = { instance: OxyGenInstance; availability: InstanceCheckHistoryEntry[]; latestConnectivity: InstanceCheckHistoryEntry | null; licenseHistory: InstanceCheckHistoryEntry[]; workflowHistory: InstanceCheckHistoryEntry[]; latestWorkflow: InstanceCheckHistoryEntry | null };
type WorkflowTriggerIssue = { workflowTriggerId?: string; workflowName?: string | null; triggerStatus?: string | null; statusInfo?: string | null; triggerDate?: string | null; workflowEventId?: string | null; workflowEventStatus?: string | null; workflowEventLastError?: string | null; serviceIdentifier?: string | null; serviceEventId?: string | null; serviceErrorMessage?: string | null; serviceStackTrace?: string | null; processingOutputs?: string | null; mappedIndexData?: unknown | null };
type WorkflowProbeSummary = { activeErrorCount?: number; activeErrors?: WorkflowTriggerIssue[]; recoveredErrorKeys?: string[]; step?: { message?: string; skipped?: boolean } };
type InstancePollerSummary = { checked: number; skipped: number; failed: number };
type InstancePollerStatus = { state: 'running' | 'paused' | 'stopped'; isRunning: boolean; isPaused: boolean; tickIntervalMs: number; inFlight: number; lastRunAt: string | null; nextRunAt: string | null; lastSummary: InstancePollerSummary | null; lastError: string | null };
type AppLogType = 'Audit' | 'Service' | 'CRUD' | 'Connection' | 'Security' | 'UI';
type AppLogSeverity = 'Critical' | 'Error' | 'Warning' | 'Logging' | 'Verbose';
type AppLogDetails = { apiCall?: string; method?: string; url?: string; responseCode?: number; statusCode?: number; entityGuid?: string | null; tenantId?: string | null; entityDescription?: string | null; entityName?: string | null; instanceName?: string | null; name?: string | null } & Record<string, unknown>;
type AppLogEntry = { id: string; type: AppLogType; severity: AppLogSeverity; source: string; userName: string | null; entityGuid: string | null; tenantId: TenantId; message: string; details: unknown | null; createdAt: string };
type AppLogGridRow = { id: string; createdAt: string; type: AppLogType; severity: AppLogSeverity; tenant: string; source: string; userName: string; entityGuid: string; entityDescription: string; message: string; apiCall: string; responseCode: string; raw: AppLogEntry };
type InstanceImportRowResult = { rowNumber: number; instanceGuid: string | null; name: string | null; action: 'create' | 'update' | 'skip' | 'error'; errors: string[]; warnings: string[] };
type InstanceImportResult = { dryRun: boolean; created: number; updated: number; failed: number; rows: InstanceImportRowResult[] };
type LogRetentionSettings = { days: number };
type SslCertificateWarningSettings = { daysBeforeExpiration: number };
type LicenseExpirationWarningSettings = { daysBeforeExpiration: number };
type QueueScheduleJobKey = 'database-maintenance:purge-logs' | 'database-maintenance:prune-check-history' | 'database-maintenance:analyze-tables' | 'database-maintenance:optimize-tables' | 'database-maintenance:backup-database' | 'system-maintenance:check-application-updates' | 'system-maintenance:prune-queue-history';
type QueueScheduleJobSettings = { key: QueueScheduleJobKey; queue: QueueStatusItem['name']; name: string; label: string; enabled: boolean; everySeconds: number };
type QueueScheduleSettings = { jobs: QueueScheduleJobSettings[] };
type ConnectivityStepDetail = { ok?: boolean; skipped?: boolean; message?: string; httpStatusCode?: number; errorCode?: string; valid?: boolean | null; expiresAt?: string | null; durationMs?: number; address?: string | null; family?: number; host?: string; port?: number };
type ConnectivityDetailsJson = { dns?: ConnectivityStepDetail; connect?: ConnectivityStepDetail; ssl?: ConnectivityStepDetail; authentication?: ConnectivityStepDetail; api?: ConnectivityStepDetail; license?: ConnectivityStepDetail };
type DashboardIssueDetail = { label: string; severity: Exclude<DashboardSeverity, 'ok' | 'unknown'> };
type DashboardInstance = OxyGenInstance & { issues: string[]; issueDetails?: DashboardIssueDetail[]; issueCount: number; hasIssue: boolean; severity?: DashboardSeverity; primaryIssue?: string | null };
type DashboardSummary = { scope: 'tenant' | 'global'; tenant: { id: string; name: string; description: string | null } | null; poller: InstancePollerStatus | null; counts: { tenants: number; groups: number; users: number; roles: number; tenantRoles: number; globalRoles: number; instances: number; totalInstances: number; instancesWithIssues: number; upInstances: number; downInstances: number; sslIssues: number; licenseIssues: number; disabledInstances: number; connectivityIssues: number; processingIssues: number; unknownInstances: number }; instances: DashboardInstance[] };
type BootstrapStatus = { requiresBootstrap: boolean };
type SetupNextStep = 'database' | 'schema' | 'admin' | 'complete';
type SetupStatus = { database: { configured: boolean; connected: boolean; schemaCurrent: boolean; defaultDatabaseName: string; targetSchemaVersion: string }; admin: { exists: boolean }; nextStep: SetupNextStep; requiresSetup: boolean };
type DatabaseSetupResponse = { ok: boolean; mode?: string; database: string; message?: string; nextStep?: SetupNextStep; targetSchemaVersion?: string; appliedVersions?: string[]; createdDatabase?: boolean; createdUser?: boolean };
type DeploymentStatus = { mode: 'self-contained' | 'custom'; managedMysql: boolean; mysql?: { host: string; port: number; database: string; applicationUser: string } };
type AppLabels = { tenant: string };
type DatabaseTablePerformance = { tableName: string; engine: string | null; rowEstimate: number; dataSizeBytes: number; indexSizeBytes: number; freeBytes: number; totalSizeBytes: number; updatedAt: string | null };
type DatabaseQueryDigestPerformance = { digestText: string; count: number; totalTimeSeconds: number; avgTimeSeconds: number; rowsExamined: number; rowsSent: number; errors: number; warnings: number; firstSeen: string | null; lastSeen: string | null };
type DatabaseQueryDigestStatus = { available: boolean; state: 'available' | 'empty' | 'unavailable'; reason: string | null };
type DatabaseSchemaPerformanceStatus = { currentVersion: string | null; targetVersion: string; current: boolean; upgradeAvailable: boolean };
type DatabasePerformanceSnapshot = { configured: boolean; connected: boolean; database: string | null; generatedAt: string; error: string | null; schema: DatabaseSchemaPerformanceStatus; queryDigestStatus: DatabaseQueryDigestStatus; summary: { tableCount: number; estimatedRows: number; dataSizeBytes: number; indexSizeBytes: number; freeBytes: number; totalSizeBytes: number }; server: { version: string | null; uptimeSeconds: number | null; maxConnections: number | null; threadsConnected: number | null; maxUsedConnections: number | null; slowQueries: number | null; longQueryTimeSeconds: number | null; questions: number | null; abortedConnects: number | null; bufferPoolReadHitPercent: number | null }; topTables: DatabaseTablePerformance[]; queryDigests: DatabaseQueryDigestPerformance[] };
type IssueCatalogAffectedInstance = { id: string; name: string; tenantId: TenantId; tenantName: string | null; status: string; lastCheckedAt: string | null; lastError: string | null; evidence: string };
type IssueCatalogType = { id: string; code: string; label: string; description: string | null; matchKind: string; matchValue: string | null; enabled: boolean; sortOrder: number; category: { id: string; code: string; name: string; sortOrder: number }; severity: { id: string; code: string; name: string; rank: number; sortOrder: number }; affectedCount: number; affectedInstances: IssueCatalogAffectedInstance[] };
type IssueCatalogSnapshot = { configured: boolean; connected: boolean; generatedAt: string; error: string | null; categories: Array<{ id: string; code: string; name: string; sortOrder: number }>; severities: Array<{ id: string; code: string; name: string; rank: number; sortOrder: number }>; issueTypes: IssueCatalogType[] };
type IssueCatalogGridRow = { id: string; category: string; severity: string; code: string; label: string; description: string; condition: string; affectedCount: number; raw: IssueCatalogType };
type SystemVersionSnapshot = { current: { version: string; commit: string | null; buildDate: string | null; repository: string; sourceUrl: string; updateChannel: string }; update: { checkedAt: string; source: 'github-release' | 'github-tag' | 'github-branch' | 'unavailable'; available: boolean; currentVersion: string; latestVersion: string | null; latestName: string | null; releaseUrl: string | null; publishedAt: string | null; error: string | null } };
type SystemUpdateStepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
type SystemUpdateStep = { code: 'dry-run' | 'backup' | 'checkout' | 'build' | 'restart' | 'schema'; label: string; description: string; state: SystemUpdateStepState; startedAt: string | null; finishedAt: string | null; message: string | null };
type SystemUpdateStatus = { generatedAt: string; runner: { enabled: boolean; state: 'idle' | 'running' | 'blocked' | 'unavailable'; inProgress: boolean; canRun: boolean; mode: 'host-script'; command: string; dryRunCommand: string; requiresConfirmation: boolean; confirmationVariable: string; currentRef: string | null; targetRef: string | null }; steps: SystemUpdateStep[]; lastRun: { id: string; mode: 'dry-run' | 'update'; targetRef: string; startedAt: string; finishedAt: string | null; state: 'running' | 'completed' | 'failed'; summary: string | null } | null; lastError: string | null };
type QueueStatusItem = { name: 'instance-checks' | 'database-maintenance' | 'system-maintenance'; description: string; waiting: number; active: number; delayed: number; failed: number; completed: number };
type SystemQueueStatus = { enabled: boolean; mode: 'disabled' | 'bullmq'; generatedAt: string; bullBoard?: { enabled: boolean; path: string | null }; redis: { configured: boolean; connected: boolean; host: string | null; port: number | null; error: string | null }; queues: QueueStatusItem[] };
type QueueJobSummary = { id: string | null; queue: QueueStatusItem['name']; name: string; state: 'scheduled' | 'waiting' | 'active' | 'delayed' | 'failed' | 'completed' | 'unknown'; attemptsMade: number; queueSequence: number; nextProcessAt: string | null; timestamp: string | null; processedOn: string | null; finishedOn: string | null; failedReason: string | null; everySeconds?: number; iterationCount?: number; resource?: { phase: 'scheduled' | 'live' | 'retained' | 'unknown'; ageSeconds: number | null; waitSeconds: number | null; durationMs: number | null; attemptCost: number }; result?: { task: string | null; tableCount: number | null; warningCount: number | null; artifactCount: number | null; summary: string | null }; data: { task?: string; source?: string; instanceId?: string; instanceName?: string; tenantId?: string | null; tenantName?: string | null; requestedBy?: string } };
type QueueJobGridRow = { id: string; sequence: number; job: string; tenant: string; instance: string; instanceGuid: string; queue: string; state: string; resource: string; age: string; wait: string; runtime: string; result: string; attempts: string; nextProcessAt: string; lastActivity: string; metadata: string; raw: QueueJobSummary };
type SystemQueueJobs = { enabled: boolean; mode: 'disabled' | 'bullmq'; generatedAt: string; jobs: QueueJobSummary[] };
type DatabaseDetailPanel = 'schema' | 'status' | 'storage' | 'tables' | 'connections' | 'queries' | 'cache';
type DatabaseMaintenanceAction = 'run-retention' | 'purge-logs' | 'compress' | 'defrag' | 'backup' | 'restore';
type ActivityTableMaintenanceResult = { deleted: number; tables?: Array<{ tableName: string; deleted: number }> };
type LogPurgeResult = ActivityTableMaintenanceResult;
type ActivityRetentionRunResult = ActivityTableMaintenanceResult & { retention: LogRetentionSettings };
type DatabaseMode = 'managed-mysql' | 'local-mysql' | 'existing-mysql';
type DbWizardStep = 'mode' | 'connection' | 'credentials' | 'review';
type NavSection = 'dashboard' | 'organizations' | 'instances' | 'instance-dashboard' | 'users' | 'user-groups' | 'roles' | 'settings-general' | 'settings-queue' | 'settings-update' | 'settings-logs' | 'settings-database' | 'settings-issues' | 'settings-advanced';
type ModalKind = 'user' | 'group' | 'role' | 'tenant' | 'instance';
type ModalEntity = UserProfile | Group | Role | Tenant | OxyGenInstance;
type ModalState = { kind: ModalKind; data?: ModalEntity } | null;
type RowActionMenuState = { kind: 'tenant' | 'instance'; id: string; top: number; left: number; placement: 'above' | 'below'; mobile: boolean } | null;
type DashboardIssueFilter = string;
type DashboardRefreshMode = 'quiet' | 'manual';
type StatusTone = 'success' | 'warning' | 'failure';
const AUTH_STORAGE_KEY = 'oxygen_cms.authToken';
type PermissionCatalogItem = { key: PermissionKey; label: string; description: string; group: string };
const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  { key: 'dashboard.view', label: 'View dashboard', description: 'Open the dashboard and view aggregate CMS health, issue, and instance summary data.', group: 'Dashboard' },
  { key: 'instances.view', label: 'View instances', description: 'View enrolled OxyGen instances, instance dashboards, connection status, and non-sensitive details.', group: 'Instances' },
  { key: 'instances.manage', label: 'Manage instances and health checks', description: 'Enroll, edit, archive, and run on-demand health checks for OxyGen instances within scope.', group: 'Instances' },
  { key: 'instances.importExport', label: 'Import/export instances', description: 'Import and export instance inventory CSV files for bulk administration.', group: 'Instances' },
  { key: 'users.manage', label: 'Manage users', description: 'Create, edit, deactivate, delete, and assign user access within the permitted scope.', group: 'Security' },
  { key: 'groups.manage', label: 'Manage groups', description: 'Create and maintain user groups, including their instance-access assignments.', group: 'Security' },
  { key: 'roles.manage', label: 'Manage roles', description: 'Create and maintain roles and permission assignments for users and groups.', group: 'Security' },
  { key: 'tenants.view', label: 'View tenants', description: 'View Tenant records and Tenant-scoped ownership information.', group: 'Tenants' },
  { key: 'tenants.manage', label: 'Manage tenants', description: 'Create and update Tenant records and global Tenant administration metadata.', group: 'Tenants' },
  { key: 'logs.view', label: 'View logs', description: 'View audit, service, CRUD, security, UI, and connection logs visible to the user scope.', group: 'Audit' },
  { key: 'logs.maintain', label: 'Purge/maintain logs', description: 'Run log retention and maintenance actions such as purging CMS activity logs.', group: 'Audit' },
  { key: 'settings.manage', label: 'Manage app settings', description: 'Update CMS application settings and administrative configuration.', group: 'Settings' },
  { key: 'settings.database.view', label: 'View database performance', description: 'View database schema, storage, query digest, and server-performance diagnostics.', group: 'Settings' },
  { key: 'settings.database.maintain', label: 'Maintain database/schema', description: 'Run database maintenance and schema-related administrative actions.', group: 'Settings' },
  { key: 'jobs.view', label: 'View queue jobs', description: 'View sanitized queue job, scheduler, and worker status details.', group: 'System' },
  { key: 'jobs.manage', label: 'Manage queue jobs', description: 'Run, pause, resume, and administer queue jobs and recurring schedulers.', group: 'System' },
  { key: 'system.poller.manage', label: 'Manage background poller', description: 'Start, pause, resume, and inspect the background instance polling service.', group: 'System' },
  { key: 'system.version.view', label: 'View CMS version/update status', description: 'View installed CMS version, source revision, and available update status.', group: 'System' },
  { key: 'issueTypes.view', label: 'View issue type catalog', description: 'View the system issue type catalog, severities, matching rules, and affected instance evidence.', group: 'System' },
  { key: 'gridPreferences.manage', label: 'Manage grid preferences', description: 'Save and maintain user grid column, filter, and display preferences.', group: 'UI' }
];
const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SystemAdmin: PERMISSION_CATALOG.map((permission) => permission.key),
  TenantAdmin: ['dashboard.view', 'instances.view', 'instances.manage', 'instances.importExport', 'users.manage', 'groups.manage', 'roles.manage', 'tenants.view', 'logs.view', 'system.version.view', 'issueTypes.view', 'gridPreferences.manage'],
  Operator: ['dashboard.view', 'instances.view', 'instances.manage', 'logs.view', 'system.version.view', 'issueTypes.view', 'gridPreferences.manage'],
  Viewer: ['dashboard.view', 'instances.view', 'system.version.view', 'issueTypes.view', 'gridPreferences.manage']
};


function cmsPathFor(section: NavSection, instanceId?: string) {
  if (section === 'dashboard') return '/Dashboard';
  if (section === 'organizations') return '/Tenants';
  if (section === 'instances') return '/Instances';
  if (section === 'instance-dashboard') return instanceId ? `/Entity/${instanceId}` : '/Instances';
  if (section === 'users') return '/Users';
  if (section === 'user-groups') return '/Groups';
  if (section === 'roles') return '/Roles';
  if (section === 'settings-queue') return '/Settings/Queue';
  if (section === 'settings-update') return '/Settings/Updates';
  if (section === 'settings-logs') return instanceId ? `/Logs/Entity/${instanceId}` : '/Logs';
  if (section === 'settings-database') return '/Settings/Database';
  if (section === 'settings-issues') return '/Settings/Issue-Types';
  if (section === 'settings-general') return '/Settings';
  return '/Settings/Advanced';
}

function sectionFromPath(pathname: string): { section: NavSection; entityId?: string } {
  const parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  const first = (parts[0] || '').toLowerCase();
  if (!first || first === 'dashboard') return { section: 'dashboard' };
  if (first === 'tenants' || first === 'organizations') return { section: 'organizations' };
  if (first === 'instances') return parts[1] ? { section: 'instance-dashboard', entityId: parts[1] } : { section: 'instances' };
  if (first === 'entity') return parts[1] ? { section: 'instance-dashboard', entityId: parts[1] } : { section: 'instances' };
  if (first === 'users') return { section: 'users' };
  if (first === 'groups' || first === 'user-groups') return { section: 'user-groups' };
  if (first === 'roles') return { section: 'roles' };
  if (first === 'logs') return parts[1]?.toLowerCase() === 'entity' && parts[2] ? { section: 'settings-logs', entityId: parts[2] } : { section: 'settings-logs' };
  if (first === 'settings') return parts[1]?.toLowerCase() === 'advanced' ? { section: 'settings-advanced' } : ['operations', 'system', 'queue', 'queues'].includes(parts[1]?.toLowerCase() || '') ? { section: 'settings-queue' } : ['update', 'updates'].includes(parts[1]?.toLowerCase() || '') ? { section: 'settings-update' } : parts[1]?.toLowerCase() === 'logs' ? { section: 'settings-logs' } : parts[1]?.toLowerCase() === 'database' ? { section: 'settings-database' } : ['issue-types', 'issues'].includes(parts[1]?.toLowerCase() || '') ? { section: 'settings-issues' } : { section: 'settings-general' };
  return { section: 'dashboard' };
}

function escapeHtmlValue(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function EditableJsonEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof createJSONEditor> | null>(null);
  const content: Content = { json: value ?? null };

  useEffect(() => {
    if (!containerRef.current) return;
    editorRef.current = createJSONEditor({
      target: containerRef.current,
      props: {
        content,
        readOnly: false,
        mode: Mode.tree,
        mainMenuBar: true,
        navigationBar: true,
        statusBar: true,
        onChange: (nextContent: Content) => {
          if ('json' in nextContent) onChange(nextContent.json);
        }
      }
    });
    return () => { void editorRef.current?.destroy(); editorRef.current = null; };
  }, []);

  useEffect(() => {
    editorRef.current?.update({ json: value ?? null });
  }, [value]);

  return <div className="license-json-editor editable-json-editor jse-theme-dark" ref={containerRef} />;
}

function detectNotesFormatValue(value: string | null | undefined) {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'empty';
  if (/^\{\\rtf/i.test(trimmed)) return 'rtf';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return 'html';
  if (/^#{1,6}\s|\*\*[^*]+\*\*|\[[^\]]+\]\([^\)]+\)|^\s*[-*+]\s+/m.test(trimmed)) return 'markdown';
  return 'text';
}

function markdownToEditorHtml(value: string) {
  const lines = value.split(/\r?\n/);
  return lines.map((line) => {
    if (!line.trim()) return '<p><br /></p>';
    const escaped = escapeHtmlValue(line)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^#{1,3}\s+/.test(line)) {
      const level = Math.min(3, line.match(/^#+/)?.[0].length || 1);
      return `<h${level}>${escaped.replace(/^#{1,3}\s+/, '')}</h${level}>`;
    }
    return `<p>${escaped}</p>`;
  }).join('');
}

function editorHtmlToMarkdown(value: string) {
  return value
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, '### $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gis, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gis, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gis, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function notesToEditorHtml(value: string | null | undefined) {
  const notes = value || '';
  const format = detectNotesFormatValue(notes);
  if (format === 'markdown') return markdownToEditorHtml(notes);
  if (format === 'html') return notes;
  if (format === 'empty') return '';
  return `<p>${escapeHtmlValue(notes).replace(/\r?\n/g, '<br />')}</p>`;
}

type RoleGridRow = { id: string; name: string; description: string; tenant: string; system: string; raw: Role };
type TenantGridRow = { id: string; name: string; description: string; raw: Tenant };
type UserGridRow = { id: string; displayName: string; email: string; role: string; groups: string; tenant: string; instanceAccess: string; raw: UserProfile };
type InstanceGridRow = { id: string; name: string; tenant: string; host: string; status: string; ssl: string; license: string; processing: string; enabled: string; checkLicense: string; archived: string; metadata: string; notes: string; description: string; protocol: string; port: string; hostname: string; baseUrl: string; apiBaseUrl: string; username: string; pollingInterval: string; sslExpiresAt: string; lastCheckedAt: string; uptime24h: string; emmQueue: string; sms: string; hangfire: string; licenseKey: string; lastError: string; raw: OxyGenInstance };
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
  { key: 'checkLicense', title: 'Check License', width: 150, defaultVisible: false },
  { key: 'archived', title: 'Archived', width: 120, defaultVisible: false },
  { key: 'metadata', title: 'Metadata', width: 160, defaultVisible: false },
  { key: 'notes', title: 'Notes', width: 180, defaultVisible: false },
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
  { key: 'tenant', title: 'Tenant', width: 160 },
  { key: 'type', title: 'Type', width: 130 },
  { key: 'severity', title: 'Severity', width: 130 },
  { key: 'userName', title: 'User Name', width: 190 },
  { key: 'entityGuid', title: 'Entity GUID', width: 360 },
  { key: 'entityDescription', title: 'Entity Description', width: 240 },
  { key: 'message', title: 'Message', width: 520 },
  { key: 'source', title: 'Source', width: 160, defaultVisible: false },
  { key: 'apiCall', title: 'API Call', width: 260, defaultVisible: false },
  { key: 'responseCode', title: 'API Response', width: 140, defaultVisible: false }
];
const issueCatalogColumnDefs: ManagedGridColumn<IssueCatalogGridRow>[] = [
  { key: 'category', title: 'Category', width: 150 },
  { key: 'severity', title: 'Severity', width: 140 },
  { key: 'code', title: 'Issue Code', width: 250 },
  { key: 'label', title: 'Condition', width: 280 },
  { key: 'affectedCount', title: 'Instances Affected', width: 170, filter: 'numeric' },
  { key: 'description', title: 'Description', width: 480 },
  { key: 'condition', title: 'Match Rule', width: 260, defaultVisible: false }
];
const queueJobColumnDefs: ManagedGridColumn<QueueJobGridRow>[] = [
  { key: 'sequence', title: 'Seq', width: 90, filter: 'numeric' },
  { key: 'job', title: 'Job', width: 220 },
  { key: 'tenant', title: 'Tenant', width: 170 },
  { key: 'instance', title: 'Instance', width: 220 },
  { key: 'queue', title: 'Queue', width: 170 },
  { key: 'state', title: 'State', width: 130 },
  { key: 'resource', title: 'Resource', width: 130 },
  { key: 'age', title: 'Age', width: 120 },
  { key: 'wait', title: 'Wait', width: 120 },
  { key: 'runtime', title: 'Runtime', width: 120 },
  { key: 'result', title: 'Result', width: 220 },
  { key: 'attempts', title: 'Schedule', width: 180 },
  { key: 'nextProcessAt', title: 'Next Run', width: 190 },
  { key: 'lastActivity', title: 'Last Activity', width: 190, defaultVisible: false },
  { key: 'metadata', title: 'Metadata', width: 240, defaultVisible: false },
  { key: 'instanceGuid', title: 'Instance GUID', width: 360, defaultVisible: false }
];

const logTypes: AppLogType[] = ['Audit', 'Service', 'CRUD', 'Connection', 'Security', 'UI'];
const logSeverities: AppLogSeverity[] = ['Critical', 'Error', 'Warning', 'Logging', 'Verbose'];

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
  const importRows = Array.isArray(body.rows) ? body.rows : [];
  const firstRowError = importRows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const candidate = row as { rowNumber?: unknown; errors?: unknown };
      const errors = Array.isArray(candidate.errors) ? candidate.errors.filter((error) => typeof error === 'string') : [];
      if (errors.length === 0) return null;
      const rowNumber = typeof candidate.rowNumber === 'number' ? `Row ${candidate.rowNumber}: ` : '';
      return `${rowNumber}${errors.slice(0, 2).join(' ')}`;
    })
    .find(Boolean);
  const base = firstRowError || String(body.error || body.message || `Request failed with status ${status}`);
  const details = body.details ? ` ${JSON.stringify(body.details)}` : '';
  return import.meta.env.DEV ? `API ${status}: ${base}${details}` : base;
}

function appLogDetails(details: unknown): AppLogDetails {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  return details as AppLogDetails;
}

function stringDetail(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : '';
}

function responseCodeDetail(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function toggleLogFilterValue<T extends string>(current: T[], value: T, checked: boolean) {
  if (checked) return current.includes(value) ? current : [...current, value];
  return current.filter((item) => item !== value);
}

function logFilterSummary(selected: string[], allLabel: string) {
  if (!selected.length) return allLabel;
  if (selected.length === 1) return selected[0];
  return `${selected.length} selected`;
}

function LogMultiSelectFilter<T extends string>({ label, allLabel, options, selected, onChange }: { label: string; allLabel: string; options: T[]; selected: T[]; onChange: (next: T[]) => void }) {
  return <div className="logs-filter-control"><span className="logs-filter-label">{label}</span><details className="logs-multiselect"><summary><span>{logFilterSummary(selected, allLabel)}</span><ChevronDown size={16} /></summary><div className="logs-multiselect-menu"><label className="checkbox-label inline-checkbox"><input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} /> {allLabel}</label>{options.map((option) => <label className="checkbox-label inline-checkbox" key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(e) => onChange(toggleLogFilterValue(selected, option, e.target.checked))} /> {option}</label>)}</div></details></div>;
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

async function apiBlob(path: string, options: RequestInit & { token?: string } = {}) {
  const headers = new Headers(options.headers);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(response.status, body as Record<string, unknown>));
  }
  return { blob: await response.blob(), headers: response.headers };
}

function displayRoleName(role?: string) {
  if (!role) return '';
  return role
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createClientId() {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') return randomUuid.call(globalThis.crypto);
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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
  const [instanceGridIssueFilter, setInstanceGridIssueFilter] = useState<DashboardIssueFilter>('all');
  const [isDashboardRefreshing, setIsDashboardRefreshing] = useState(false);
  const [dashboardLastRefreshedAt, setDashboardLastRefreshedAt] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [selectedInstanceDetail, setSelectedInstanceDetail] = useState<OxyGenInstance | null>(null);
  const [appLabels, setAppLabels] = useState<AppLabels>({ tenant: 'Tenant' });
  const [logRetention, setLogRetention] = useState<LogRetentionSettings>({ days: 90 });
  const [sslCertificateWarning, setSslCertificateWarning] = useState<SslCertificateWarningSettings>({ daysBeforeExpiration: 30 });
  const [licenseExpirationWarning, setLicenseExpirationWarning] = useState<LicenseExpirationWarningSettings>({ daysBeforeExpiration: 30 });
  const [queueSchedules, setQueueSchedules] = useState<QueueScheduleSettings>({ jobs: [] });
  const [queueScheduleEnabledDraft, setQueueScheduleEnabledDraft] = useState<Record<string, boolean>>({});
  const [queueActionKey, setQueueActionKey] = useState<string | null>(null);
  const [appLogs, setAppLogs] = useState<AppLogEntry[]>([]);
  const [databasePerformance, setDatabasePerformance] = useState<DatabasePerformanceSnapshot | null>(null);
  const [issueCatalog, setIssueCatalog] = useState<IssueCatalogSnapshot | null>(null);
  const [selectedIssueType, setSelectedIssueType] = useState<IssueCatalogType | null>(null);
  const [systemVersion, setSystemVersion] = useState<SystemVersionSnapshot | null>(null);
  const [systemUpdateStatus, setSystemUpdateStatus] = useState<SystemUpdateStatus | null>(null);
  const [systemQueueStatus, setSystemQueueStatus] = useState<SystemQueueStatus | null>(null);
  const [systemQueueJobs, setSystemQueueJobs] = useState<SystemQueueJobs | null>(null);
  const [queueJobQueueFilter, setQueueJobQueueFilter] = useState<string[]>([]);
  const [queueJobStateFilter, setQueueJobStateFilter] = useState<string[]>([]);
  const [queueJobTypeFilter, setQueueJobTypeFilter] = useState<string[]>([]);
  const [selectedQueueJob, setSelectedQueueJob] = useState<QueueJobSummary | null>(null);
  const [isSystemVersionRefreshing, setIsSystemVersionRefreshing] = useState(false);
  const [updateRunnerAction, setUpdateRunnerAction] = useState<'dry-run' | 'update' | null>(null);
  const [updateTargetRef, setUpdateTargetRef] = useState('');
  const [isAdminDataRefreshing, setIsAdminDataRefreshing] = useState(false);
  const [databaseDetailPanel, setDatabaseDetailPanel] = useState<DatabaseDetailPanel>('storage');
  const [databaseDetailModal, setDatabaseDetailModal] = useState<DatabaseDetailPanel | null>(null);
  const [showDashboardInstanceBoard, setShowDashboardInstanceBoard] = useState(false);
  const [databaseMaintenanceAction, setDatabaseMaintenanceAction] = useState<DatabaseMaintenanceAction | null>(null);
  const [logTypeFilter, setLogTypeFilter] = useState<AppLogType[]>([]);
  const [logSeverityFilter, setLogSeverityFilter] = useState<AppLogSeverity[]>(['Critical', 'Error', 'Warning', 'Logging']);
  const [logEntityGuidFilter, setLogEntityGuidFilter] = useState('');
  const [draftInstanceId, setDraftInstanceId] = useState('');
  const [isLogRefreshPaused, setIsLogRefreshPaused] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isLogsRefreshing, setIsLogsRefreshing] = useState(false);
  const [isDatabasePerformanceRefreshing, setIsDatabasePerformanceRefreshing] = useState(false);
  const [isIssueCatalogRefreshing, setIsIssueCatalogRefreshing] = useState(false);
  const [issueCategoryFilter, setIssueCategoryFilter] = useState<string[]>([]);
  const [issueSeverityFilter, setIssueSeverityFilter] = useState<string[]>([]);
  const [issueTypeFilter, setIssueTypeFilter] = useState<string[]>([]);
  const [isInstanceImporting, setIsInstanceImporting] = useState(false);
  const [isInstanceExporting, setIsInstanceExporting] = useState(false);
  const instanceImportFileRef = useRef<HTMLInputElement | null>(null);
  const hydratingInstanceDashboardIdsRef = useRef<Set<string>>(new Set());
  const hydratedInstanceDashboardIdsRef = useRef<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<StatusTone>('success');
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleName>('Operator');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedPermissionKeys, setSelectedPermissionKeys] = useState<PermissionKey[]>([]);
  const [permissionFilter, setPermissionFilter] = useState('');
  const [permissionPresetDraft, setPermissionPresetDraft] = useState('');
  const [selectedAccessInstanceIds, setSelectedAccessInstanceIds] = useState<string[]>([]);
  const [instanceAccessModeDraft, setInstanceAccessModeDraft] = useState<UserInstanceAccessMode | GroupInstanceAccessMode>('inherit');
  const [instanceAccessFilter, setInstanceAccessFilter] = useState('');
  const [instanceProtocol, setInstanceProtocol] = useState<'http' | 'https'>('https');
  const [instancePort, setInstancePort] = useState('443');
  const [instancePollingEnabled, setInstancePollingEnabled] = useState(true);
  const [instanceLicenseCheckEnabled, setInstanceLicenseCheckEnabled] = useState(true);
  const [showArchivedInstances, setShowArchivedInstances] = useState(false);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [healthModal, setHealthModal] = useState<InstanceHealthModalKind | null>(null);
  const [healthDetails, setHealthDetails] = useState<InstanceHealthDetails | null>(null);
  const [isHealthDetailsLoading, setIsHealthDetailsLoading] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<unknown | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingHealthDetail, setIsSavingHealthDetail] = useState(false);
  const [logsBackTarget, setLogsBackTarget] = useState<{ section: NavSection; label: string; entityId?: string } | null>(null);
  const [instanceDashboardBackTarget, setInstanceDashboardBackTarget] = useState<{ section: NavSection; label: string; entityId?: string } | null>(null);
  const [activeRowActionMenu, setActiveRowActionMenu] = useState<RowActionMenuState>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const hasPermission = (permission: PermissionKey) => profile?.permissions.includes(permission) ?? false;
  const canViewTenants = hasPermission('tenants.view') || hasPermission('tenants.manage');
  const canManageTenants = hasPermission('tenants.manage');
  const actorTenantId = profile?.user.tenantId ?? null;
  const canSelectGlobalTenantScope = canManageTenants;
  const canSelectAnyTenantScope = canManageTenants;
  const canViewInstances = hasPermission('instances.view') || hasPermission('instances.manage');
  const canManageInstances = hasPermission('instances.manage');
  const canImportExportInstances = hasPermission('instances.importExport');
  const canManageUsers = hasPermission('users.manage');
  const canManageGroups = hasPermission('groups.manage');
  const canManageRoles = hasPermission('roles.manage');
  const canManageSecurity = canManageUsers || canManageGroups || canManageRoles;
  const canViewLogs = hasPermission('logs.view') || hasPermission('logs.maintain');
  const canMaintainLogs = hasPermission('logs.maintain');
  const canManageSettings = hasPermission('settings.manage');
  const canViewDatabase = hasPermission('settings.database.view') || hasPermission('settings.database.maintain');
  const canMaintainDatabase = hasPermission('settings.database.maintain');
  const canManagePoller = hasPermission('system.poller.manage');
  const canViewJobs = hasPermission('jobs.view') || canManagePoller;
  const canManageJobs = hasPermission('jobs.manage') || canManagePoller;
  const canViewVersion = hasPermission('system.version.view');
  const canViewIssueTypes = hasPermission('issueTypes.view');
  const canUseSettings = canManageSettings || canViewLogs || canViewDatabase || canViewIssueTypes || canViewVersion || canViewJobs;
  const tenantLabel = appLabels.tenant || 'Tenant';
  const tenantLabelPlural = `${tenantLabel}s`;
  const tenantLabelLower = tenantLabel.toLowerCase();
  const tenantName = (tenantId: TenantId) => tenantId ? tenants.find((tenant) => tenant.id === tenantId)?.name || `Unknown ${tenantLabelLower}` : 'Global';
  const actorTenantName = tenantName(actorTenantId);
  const tenantOptionLabel = (tenant: Tenant) => tenant.description ? `${tenant.name} — ${tenant.description}` : tenant.name;
  const groupOptionLabel = (group: Group) => group.description ? `${group.name} — ${group.description}` : group.name;
  const availableRoles = roles.length ? roles : [{ id: 'operator', name: 'Operator', description: null, tenantId: null, isSystem: false, permissionKeys: DEFAULT_ROLE_PERMISSIONS.Operator }];
  const instanceName = (instanceId: string) => instances.find((instance) => instance.id === instanceId)?.name || instanceId;
  const accessLabel = (mode: string, instanceIds: string[]) => mode === 'all' ? 'All instances' : mode === 'none' ? 'No instances' : mode === 'inherit' ? 'Inherited from groups' : `${instanceIds.length} specific instance${instanceIds.length === 1 ? '' : 's'}`;
  const launchUrlForInstance = (instance: OxyGenInstance) => `${instance.protocol}://${instance.host}:${instance.port ?? (instance.protocol === 'http' ? 80 : 443)}/optws/oxygen.aspx`;
  const formatDateTime = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not checked';
  const daysUntilDate = (value: string | null) => value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86400000) : null;
  const tlsConnectionPattern = /\bTLS connection failed\b|secure TLS connection|TLS handshake|ECONNRESET|ERR_CONNECTION_CLOSED|unexpected eof/i;
  const isTlsConnectionError = (instance: Pick<OxyGenInstance, 'status' | 'lastError'>) => instance.status === 'down' && tlsConnectionPattern.test(instance.lastError || '');
  const sslDisplayStatus = (instance: OxyGenInstance) => {
    if (instance.protocol !== 'https') return 'hidden' as const;
    if (isTlsConnectionError(instance)) return 'not-evaluated' as const;
    const expiresAt = instance.sslExpiresAt ? new Date(instance.sslExpiresAt).getTime() : null;
    if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt < Date.now()) return 'expired' as const;
    if (instance.sslValid === false || instance.status === 'ssl-error') return 'invalid' as const;
    if (instance.sslValid === null) return 'unknown' as const;
    if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt - Date.now() <= Math.max(0, sslCertificateWarning.daysBeforeExpiration) * 86400000) return 'expiring-soon' as const;
    return 'valid' as const;
  };
  const sslStatusLabel = (instance: OxyGenInstance) => {
    const status = sslDisplayStatus(instance);
    if (status === 'hidden') return 'Hidden';
    if (status === 'not-evaluated') return 'Not Evaluated';
    if (status === 'expired') return 'Expired';
    if (status === 'expiring-soon') return 'Expiring Soon';
    if (status === 'invalid') return 'Invalid';
    if (status === 'valid') return 'Valid';
    return 'Unknown';
  };
  const sslStatusHasIssue = (instance: OxyGenInstance) => ['expired', 'expiring-soon', 'invalid'].includes(sslDisplayStatus(instance));
  const objectRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const firstRecordValue = (record: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) if (key in record) return record[key];
    return null;
  };
  const licenseExpirationDate = (instance: OxyGenInstance) => {
    const raw = firstRecordValue(objectRecord(instance.licenseJson), ['ExpiryDate', 'ExpirationDate', 'ExpiresAt', 'ExpiresOn', 'ValidUntil', 'validUntil', 'expiryDate']);
    if (raw === null || raw === undefined || raw === '') return null;
    const date = raw instanceof Date ? raw : typeof raw === 'number' ? new Date(raw > 10000000000 ? raw : raw * 1000) : typeof raw === 'string' ? new Date(raw) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  };
  const licensePayloadBoolean = (instance: OxyGenInstance, keys: string[]) => {
    const raw = firstRecordValue(objectRecord(instance.licenseJson), keys);
    return typeof raw === 'boolean' ? raw : null;
  };
  const daysUntilLicenseExpiration = (instance: OxyGenInstance) => {
    const expiresAt = licenseExpirationDate(instance);
    return expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000) : null;
  };
  const licenseDisplayStatus = (instance: OxyGenInstance) => {
    if (!instance.checkLicense) return 'hidden' as const;
    if (instance.status !== 'up') return 'unavailable' as const;
    const expiresAt = licenseExpirationDate(instance);
    const isExpired = licensePayloadBoolean(instance, ['IsExpired', 'isExpired']) === true;
    const evaluatedPayload = ['IsValid', 'isValid', 'IsExpired', 'isExpired', 'ExpiryDate', 'ExpirationDate', 'ExpiresAt', 'ExpiresOn', 'ValidUntil', 'validUntil', 'expiryDate', 'Features', 'features'].some((key) => key in objectRecord(instance.licenseJson));
    if (!evaluatedPayload && instance.licenseStatus === 'error') return 'unavailable' as const;
    if (!instance.licenseKey && instance.licenseStatus === 'unknown') return 'unavailable' as const;
    if (!instance.licenseKey && evaluatedPayload && instance.licenseStatus !== 'warning') return 'missing' as const;
    if (instance.licenseStatus === 'expired' || isExpired || (expiresAt && expiresAt.getTime() < Date.now())) return 'expired' as const;
    if (instance.licenseStatus === 'error') return 'invalid' as const;
    if (!instance.licenseKey && instance.licenseStatus !== 'warning') return 'unavailable' as const;
    if (instance.licenseStatus === 'warning') return evaluatedPayload ? 'warning' as const : 'unavailable' as const;
    if (instance.licenseStatus === 'unknown') return 'unknown' as const;
    const isValid = instance.licenseStatus === 'valid' || licensePayloadBoolean(instance, ['IsValid', 'isValid']) === true;
    if (isValid && expiresAt && expiresAt.getTime() - Date.now() <= Math.max(0, licenseExpirationWarning.daysBeforeExpiration) * 86400000) return 'expiring-soon' as const;
    return isValid ? 'valid' as const : 'unknown' as const;
  };
  const licenseStatusLabel = (instance: OxyGenInstance) => {
    const status = licenseDisplayStatus(instance);
    if (status === 'hidden') return 'Hidden';
    if (status === 'unavailable') return 'Unavailable';
    if (status === 'expired') return 'Expired';
    if (status === 'expiring-soon') return 'Expiring Soon';
    if (status === 'missing') return 'Missing';
    if (status === 'invalid') return 'Invalid';
    if (status === 'warning') return 'Warning';
    if (status === 'valid') return 'Valid';
    return 'Unknown';
  };

  const formatNullable = (value: string | number | null | undefined, fallback = 'Unknown') => value === null || value === undefined || value === '' ? fallback : String(value);
  const LoadingOverlay = ({ label = 'Loading…' }: { label?: string }) => <div className="cms-loading-overlay" role="status" aria-live="polite"><LoaderCircle className="cms-loading-spinner" /><span>{label}</span></div>;
  const formatBytes = (value: number | null | undefined) => {
    const bytes = Number(value ?? 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };
  const formatNumber = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat().format(value) : 'Unknown';
  const formatPercent = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : 'Unknown';
  const formatSeconds = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(value % 1 === 0 ? 0 : 1)}s` : 'configured threshold';
  const bufferPoolHealth = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return { label: 'Unknown', detail: 'Cache hit rate unavailable', tone: 'neutral' as const };
    if (value >= 99) return { label: 'Excellent', detail: `${formatPercent(100 - value)} reads went to disk`, tone: 'ok' as const };
    if (value >= 98) return { label: 'Good', detail: `${formatPercent(100 - value)} reads went to disk`, tone: 'ok' as const };
    if (value >= 95) return { label: 'Watch', detail: `${formatPercent(100 - value)} reads went to disk`, tone: 'warning' as const };
    return { label: 'Poor', detail: `${formatPercent(100 - value)} reads went to disk`, tone: 'issue' as const };
  };
  const formatDurationLong = (seconds: number | null | undefined) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'Unknown';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };
  const selectedInstance = selectedInstanceDetail || instances.find((instance) => instance.id === selectedInstanceId) || null;
  const accessInstanceOptions = instances.map((instance) => ({
    id: instance.id,
    text: `${instance.name} — ${tenantName(instance.tenantId)}`,
    tenant: tenantName(instance.tenantId),
    host: instance.host
  }));
  const selectedAccessInstances = accessInstanceOptions.filter((instance) => selectedAccessInstanceIds.includes(instance.id));
  const filteredAccessInstances = accessInstanceOptions.filter((instance) => {
    const query = instanceAccessFilter.trim().toLowerCase();
    if (!query) return true;
    return [instance.text, instance.tenant, instance.host].some((value) => value.toLowerCase().includes(query));
  });
  function setAccessInstances(nextIds: string[]) {
    setSelectedAccessInstanceIds(Array.from(new Set(nextIds)));
  }
  function handleAccessInstanceChange(event: MultiSelectChangeEvent) {
    const nextValue = event.value as AccessInstanceOption[];
    setAccessInstances(nextValue.map((instance) => instance.id));
  }
  function handleAccessInstanceFilterChange(event: MultiSelectFilterChangeEvent) {
    setInstanceAccessFilter(event.filter.value);
  }
  function InstanceAccessSelector() {
    if (instanceAccessModeDraft !== 'specific') {
      return <div className="access-summary-card"><strong>{accessLabel(instanceAccessModeDraft, selectedAccessInstanceIds)}</strong><span>Switch Instance access to “Specific instances” to choose individual deployments.</span></div>;
    }
    return <section className="access-selector multiselect-access-selector" aria-label="Specific instances">
      <div className="access-selector-header"><div><strong>{selectedAccessInstanceIds.length} selected</strong><span>{instances.length} available instances</span></div><div className="access-selector-actions"><button type="button" onClick={() => setAccessInstances(instances.map((instance) => instance.id))}>Select all</button><button type="button" onClick={() => setAccessInstances([])}>Clear</button></div></div>
      <MultiSelect
        ariaLabel="Specific instances"
        adaptive={isMobileViewport}
        adaptiveTitle="Specific instances"
        className="dark-kendo-multiselect instance-pill-selector"
        data={filteredAccessInstances}
        dataItemKey="id"
        filterable={true}
        filter={instanceAccessFilter}
        onChange={handleAccessInstanceChange}
        onFilterChange={handleAccessInstanceFilterChange}
        placeholder="Search and select instances…"
        rounded="large"
        size="small"
        tags={selectedAccessInstances.length > 0 ? [{ text: `${selectedAccessInstances.length} instance${selectedAccessInstances.length === 1 ? '' : 's'} selected`, data: selectedAccessInstances }] : []}
        textField="text"
        value={selectedAccessInstances}
      />
      <div className="selected-pill-summary" aria-label="Selected instances">{selectedAccessInstances.length === 0 ? <span className="empty-state">No specific instances selected.</span> : selectedAccessInstances.slice(0, 24).map((instance) => <button key={instance.id} type="button" className="selected-chip" onClick={() => setAccessInstances(selectedAccessInstanceIds.filter((id) => id !== instance.id))}>{instance.text}<X size={13} /></button>)}{selectedAccessInstances.length > 24 && <span className="selected-chip muted">+{selectedAccessInstances.length - 24} more</span>}</div>
    </section>;
  }


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
    const query = window.matchMedia('(max-width: 1100px)');
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

  useEffect(() => {
    if (!activeRowActionMenu) return undefined;
    const close = () => setActiveRowActionMenu(null);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [activeRowActionMenu]);

  async function loadInstances(t = token, includeArchived = showArchivedInstances) {
    if (!t) return;
    const res = await api<{ instances: OxyGenInstance[] }>(`/api/instances${includeArchived ? '?includeArchived=true' : ''}`, { token: t });
    setInstances(res.instances);
    setSelectedInstanceDetail((current) => {
      if (!current) return current;
      const refreshed = res.instances.find((instance) => instance.id === current.id);
      return refreshed ? { ...current, ...refreshed, licenseJson: refreshed.licenseJson ?? current.licenseJson, settingsJson: refreshed.settingsJson ?? current.settingsJson, workflowSummaryJson: refreshed.workflowSummaryJson ?? current.workflowSummaryJson } : current;
    });
  }

  async function loadDashboard(t = token, mode: DashboardRefreshMode = 'quiet') {
    if (!t) return;
    if (mode === 'manual') clearStatus();
    setIsDashboardRefreshing(true);
    try {
      const res = await api<{ dashboard: DashboardSummary }>('/api/dashboard', { token: t });
      setDashboard(res.dashboard);
      setDashboardLastRefreshedAt(new Date().toISOString());
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

  function applyQueueSchedules(settings: QueueScheduleSettings) {
    setQueueSchedules(settings);
    setQueueScheduleEnabledDraft(Object.fromEntries(settings.jobs.map((job) => [job.key, job.enabled])));
  }

  function queueScheduleDescription(job: QueueScheduleJobSettings) {
    if (job.key === 'database-maintenance:purge-logs') return 'Removes CMS activity logs older than the configured retention window.';
    if (job.key === 'database-maintenance:prune-check-history') return 'Prunes old instance health-check history using the same retention window.';
    if (job.key === 'database-maintenance:analyze-tables') return 'Refreshes MySQL table statistics for allowlisted CMS maintenance tables.';
    if (job.key === 'database-maintenance:optimize-tables') return 'Runs guarded OPTIMIZE on allowlisted InnoDB tables only when reusable/free space is reported.';
    if (job.key === 'database-maintenance:backup-database') return 'Creates a guarded CMS backup artifact when backup jobs are explicitly enabled on the worker.';
    if (job.key === 'system-maintenance:check-application-updates') return 'Refreshes GitHub release/update metadata shown in Operations.';
    if (job.key === 'system-maintenance:prune-queue-history') return 'Cleans retained BullMQ completed/failed job history to keep Redis tidy.';
    return 'Recurring CMS maintenance job.';
  }

  function queueScheduleDays(job: QueueScheduleJobSettings) {
    return Math.max(1, Math.ceil(job.everySeconds / 86400)).toString();
  }

  async function loadLogRetention(t = token) {
    if (!t) return;
    const res = await api<{ retention: LogRetentionSettings }>('/api/app-settings/log-retention', { token: t });
    setLogRetention(res.retention ?? { days: 90 });
  }

  async function loadSslCertificateWarning(t = token) {
    if (!t) return;
    const res = await api<{ sslCertificateWarning: SslCertificateWarningSettings }>('/api/app-settings/ssl-certificate-warning', { token: t });
    setSslCertificateWarning(res.sslCertificateWarning ?? { daysBeforeExpiration: 30 });
  }

  async function loadLicenseExpirationWarning(t = token) {
    if (!t) return;
    const res = await api<{ licenseExpirationWarning: LicenseExpirationWarningSettings }>('/api/app-settings/license-expiration-warning', { token: t });
    setLicenseExpirationWarning(res.licenseExpirationWarning ?? { daysBeforeExpiration: 30 });
  }

  async function loadQueueSchedules(t = token) {
    if (!t) return;
    const res = await api<{ queueSchedules: QueueScheduleSettings }>('/api/app-settings/queue-schedules', { token: t });
    applyQueueSchedules(res.queueSchedules ?? { jobs: [] });
  }

  async function loadQueueJobs(t = token) {
    if (!t || !canViewJobs) return;
    const [queueJobsRes] = await Promise.all([
      api<{ queueJobs: SystemQueueJobs }>('/api/system/queue-jobs?limit=1000', { token: t }),
      loadQueueSchedules(t).catch(() => undefined)
    ]);
    setSystemQueueJobs(queueJobsRes.queueJobs);
  }

  async function loadQueueStatus(t = token, mode: DashboardRefreshMode = 'quiet') {
    if (!t || !canViewJobs) return;
    if (mode === 'manual') clearStatus();
    setIsSystemVersionRefreshing(true);
    try {
      const [queueRes, queueJobsRes] = await Promise.all([
        api<{ queues: SystemQueueStatus }>('/api/system/queues', { token: t }),
        api<{ queueJobs: SystemQueueJobs }>('/api/system/queue-jobs?limit=1000', { token: t })
      ]);
      setSystemQueueStatus(queueRes.queues);
      setSystemQueueJobs(queueJobsRes.queueJobs);
      await loadQueueSchedules(t).catch(() => undefined);
      if (mode === 'manual') showStatus(`Queue status refreshed. Queue mode: ${queueRes.queues.mode}.`);
    } catch (err) {
      if (mode === 'manual') setError(err instanceof Error ? err.message : 'Queue status refresh failed.');
      else throw err;
    } finally {
      setIsSystemVersionRefreshing(false);
    }
  }

  async function loadAppLogs(t = token, overrides: { type?: AppLogType[]; severity?: AppLogSeverity[]; entityGuid?: string; tenantId?: string } = {}) {
    if (!t) return;
    setIsLogsRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: '250' });
      const typeFilter = overrides.type ?? logTypeFilter;
      const severityFilter = overrides.severity ?? logSeverityFilter;
      const entityFilter = overrides.entityGuid ?? logEntityGuidFilter;
      const tenantFilter = overrides.tenantId;
      typeFilter.forEach((type) => params.append('type', type));
      severityFilter.forEach((severity) => params.append('severity', severity));
      if (tenantFilter) params.set('tenantId', tenantFilter);
      if (entityFilter.trim()) params.set('entityGuid', entityFilter.trim());
      const res = await api<{ logs: AppLogEntry[] }>(`/api/logs?${params.toString()}`, { token: t });
      setAppLogs(res.logs);
    } finally {
      setIsLogsRefreshing(false);
    }
  }

  async function loadDatabasePerformance(t = token, mode: DashboardRefreshMode = 'quiet') {
    if (!t) return;
    if (mode === 'manual') clearStatus();
    setIsDatabasePerformanceRefreshing(true);
    try {
      const res = await api<{ databasePerformance: DatabasePerformanceSnapshot }>('/api/system/database-performance', { token: t });
      setDatabasePerformance(res.databasePerformance);
      if (mode === 'manual') showStatus('Database performance refreshed.');
    } catch (err) {
      if (mode === 'manual') setError(err instanceof Error ? err.message : 'Database performance refresh failed.');
      else throw err;
    } finally {
      setIsDatabasePerformanceRefreshing(false);
    }
  }

  async function loadIssueCatalog(t = token, mode: DashboardRefreshMode = 'quiet') {
    if (!t) return;
    if (mode === 'manual') clearStatus();
    setIsIssueCatalogRefreshing(true);
    try {
      const res = await api<{ issueCatalog: IssueCatalogSnapshot }>('/api/system/issue-types', { token: t });
      setIssueCatalog(res.issueCatalog);
      if (mode === 'manual') showStatus(`Issue catalog refreshed: ${formatNumber(res.issueCatalog.issueTypes.length)} issue type${res.issueCatalog.issueTypes.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Issue catalog refresh failed.');
    } finally {
      setIsIssueCatalogRefreshing(false);
    }
  }

  async function loadSystemVersion(t = token, mode: DashboardRefreshMode = 'quiet') {
    if (!t) return;
    if (mode === 'manual') clearStatus();
    setIsSystemVersionRefreshing(true);
    try {
      const [versionRes, statusRes] = await Promise.all([
        api<{ version: SystemVersionSnapshot }>('/api/system/version', { token: t }),
        api<{ updateStatus: SystemUpdateStatus }>('/api/system/update-status', { token: t })
      ]);
      setSystemVersion(versionRes.version);
      setSystemUpdateStatus(statusRes.updateStatus);
      if (!updateTargetRef && statusRes.updateStatus.runner.targetRef) setUpdateTargetRef(statusRes.updateStatus.runner.targetRef);
      if (mode === 'manual') {
        showStatus(versionRes.version.update.error ? 'Version/update readiness refreshed; update source is currently unavailable.' : 'Version/update readiness refreshed.', versionRes.version.update.error ? 'warning' : 'success');
      }
    } catch (err) {
      if (mode === 'manual') setError(err instanceof Error ? err.message : 'Version refresh failed.');
      else throw err;
    } finally {
      setIsSystemVersionRefreshing(false);
    }
  }

  async function runUpdateRunner(mode: 'dry-run' | 'update') {
    if (!token || updateRunnerAction) return;
    const status = systemUpdateStatus;
    const targetRef = updateTargetRef.trim() || status?.runner.targetRef || systemVersion?.update.latestVersion || 'main';
    if (mode === 'update' && !window.confirm(`Run confirmed OxyGen CMS update to ${targetRef}? This will execute the guarded host update command when the runner is enabled.`)) return;
    clearStatus();
    setUpdateRunnerAction(mode);
    try {
      const endpoint = mode === 'dry-run' ? '/api/system/update-runner/dry-run' : '/api/system/update-runner/update';
      const res = await api<{ updateStatus: SystemUpdateStatus }>(endpoint, {
        method: 'POST',
        token,
        body: JSON.stringify(mode === 'dry-run' ? { targetRef } : { targetRef, confirmed: true })
      });
      setSystemUpdateStatus(res.updateStatus);
      showStatus(mode === 'dry-run' ? `Update dry run started for ${targetRef}.` : `Confirmed update started for ${targetRef}.`, 'warning');
      window.setTimeout(() => void loadSystemVersion(token).catch(() => undefined), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'dry-run' ? 'Update dry run failed.' : 'Confirmed update failed.');
    } finally {
      setUpdateRunnerAction(null);
    }
  }

  function activityTableSummary(tables?: Array<{ tableName: string; deleted: number }>) {
    return tables?.length ? ` Affected tables: ${tables.map((table) => `${table.tableName} (${formatNumber(table.deleted)})`).join(', ')}.` : '';
  }

  async function handleRunRetention() {
    if (!token) return;
    clearStatus();
    try {
      const res = await api<ActivityRetentionRunResult>('/api/logs/retention/run', { method: 'POST', token });
      showStatus(`Retention pruned ${formatNumber(res.deleted)} expired activity row${res.deleted === 1 ? '' : 's'} older than ${formatNumber(res.retention.days)} day${res.retention.days === 1 ? '' : 's'}.${activityTableSummary(res.tables)}`);
      await Promise.all([
        loadDatabasePerformance(token).catch(() => undefined),
        loadAppLogs(token).catch(() => undefined)
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run activity retention.');
    }
  }

  async function handleClearLogs() {
    if (!token || isClearingLogs || !canMaintainLogs) return;
    if (!window.confirm('Purge CMS activity tables? This truncates application_logs and oxygen_instance_check_history and cannot be undone.')) return;
    clearStatus();
    setIsClearingLogs(true);
    try {
      const res = await api<LogPurgeResult>('/api/logs', { method: 'DELETE', token });
      setAppLogs([]);
      showStatus(`Cleared ${formatNumber(res.deleted)} activity row${res.deleted === 1 ? '' : 's'} from application logs and check history.${activityTableSummary(res.tables)} Tables were truncated so MySQL can release/reuse the space immediately.`);
      await loadDatabasePerformance(token).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear logs.');
    } finally {
      setIsClearingLogs(false);
    }
  }

  async function handleDatabaseMaintenance(action: DatabaseMaintenanceAction) {
    setDatabaseMaintenanceAction(action);
    if (action === 'run-retention') {
      await handleRunRetention();
      setDatabaseMaintenanceAction(null);
      return;
    }
    if (action === 'purge-logs') {
      await handleClearLogs();
      setDatabaseMaintenanceAction(null);
      return;
    }
    const labels: Record<DatabaseMaintenanceAction, string> = {
      'run-retention': 'Run Retention',
      'purge-logs': 'Purge Logs',
      compress: 'Compress Tables',
      defrag: 'Defrag Tables',
      backup: 'Backup Database',
      restore: 'Restore Database'
    };
    showStatus(`${labels[action]} needs a dedicated maintenance job endpoint before it can run safely.`, 'warning');
    setDatabaseMaintenanceAction(null);
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
      const res = await api<{ retention: LogRetentionSettings }>('/api/app-settings/log-retention', { method: 'PUT', token, body: JSON.stringify({ days: Number(f.get('days')) }) });
      const nextRetention = res.retention ?? { days: 90 };
      setLogRetention(nextRetention);
      setMessage(`Activity retention updated to ${nextRetention.days} day${nextRetention.days === 1 ? '' : 's'}.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Log retention update failed.'); }
  }

  async function handleSaveSslCertificateWarning(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const f = new FormData(e.currentTarget);
    try {
      const res = await api<{ sslCertificateWarning: SslCertificateWarningSettings }>('/api/app-settings/ssl-certificate-warning', { method: 'PUT', token, body: JSON.stringify({ daysBeforeExpiration: Number(f.get('daysBeforeExpiration')) }) });
      const nextSettings = res.sslCertificateWarning ?? { daysBeforeExpiration: 30 };
      setSslCertificateWarning(nextSettings);
      setMessage(`SSL certificates will show Expiring Soon ${nextSettings.daysBeforeExpiration} day${nextSettings.daysBeforeExpiration === 1 ? '' : 's'} before expiration.`);
      await loadDashboard(token).catch(() => undefined);
    } catch (err) { setError(err instanceof Error ? err.message : 'SSL certificate warning settings update failed.'); }
  }

  async function handleSaveLicenseExpirationWarning(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const f = new FormData(e.currentTarget);
    try {
      const res = await api<{ licenseExpirationWarning: LicenseExpirationWarningSettings }>('/api/app-settings/license-expiration-warning', { method: 'PUT', token, body: JSON.stringify({ daysBeforeExpiration: Number(f.get('daysBeforeExpiration')) }) });
      const nextSettings = res.licenseExpirationWarning ?? { daysBeforeExpiration: 30 };
      setLicenseExpirationWarning(nextSettings);
      setMessage(`Licenses will show Expiring Soon ${nextSettings.daysBeforeExpiration} day${nextSettings.daysBeforeExpiration === 1 ? '' : 's'} before expiration.`);
      await loadDashboard(token).catch(() => undefined);
    } catch (err) { setError(err instanceof Error ? err.message : 'License expiration warning settings update failed.'); }
  }

  async function handleQueueJobAction(key: QueueScheduleJobKey | string, action: 'pause' | 'resume' | 'run-now') {
    if (!token) return;
    clearStatus();
    setQueueActionKey(`${key}:${action}`);
    try {
      const encodedKey = encodeURIComponent(key);
      if (action === 'run-now') {
        await api<{ queued: true; key: QueueScheduleJobKey; jobId: string | null }>(`/api/system/queue-jobs/${encodedKey}/run-now`, { method: 'POST', token });
        showStatus(`${queueSchedules.jobs.find((job) => job.key === key)?.label ?? key} moved to the front of the queue as a one-off run.`);
      } else {
        const res = await api<{ queueSchedules: QueueScheduleSettings }>(`/api/system/queue-jobs/${encodedKey}/${action}`, { method: 'POST', token });
        applyQueueSchedules(res.queueSchedules);
        showStatus(`${queueSchedules.jobs.find((job) => job.key === key)?.label ?? key} ${action === 'pause' ? 'paused' : 'resumed'}.`, action === 'pause' ? 'warning' : 'success');
      }
      await loadSystemVersion(token).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} queue job.`);
    } finally {
      setQueueActionKey(null);
    }
  }

  async function saveQueueScheduleJobs(jobs: Array<{ key: QueueScheduleJobKey; enabled: boolean; everySeconds: number }>, successMessage: string) {
    if (!token) return;
    clearStatus();
    try {
      const res = await api<{ queueSchedules: QueueScheduleSettings }>('/api/app-settings/queue-schedules', { method: 'PUT', token, body: JSON.stringify({ jobs }) });
      applyQueueSchedules(res.queueSchedules);
      showStatus(successMessage);
      await loadSystemVersion(token).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Queue schedule update failed.');
    }
  }

  async function handleSaveQueueSchedule(job: QueueScheduleJobSettings, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const jobs = queueSchedules.jobs.map((entry) => entry.key === job.key ? {
      key: entry.key,
      enabled: f.get('enabled') === 'on',
      everySeconds: Math.max(86_400, Math.round(Number(f.get('everyDays') ?? queueScheduleDays(entry)) * 86400))
    } : { key: entry.key, enabled: entry.enabled, everySeconds: entry.everySeconds });
    await saveQueueScheduleJobs(jobs, `${job.label} schedule updated.`);
  }

  async function handleToggleQueueSchedule(job: QueueScheduleJobSettings, enabled: boolean) {
    setQueueScheduleEnabledDraft((current) => ({ ...current, [job.key]: enabled }));
    const jobs = queueSchedules.jobs.map((entry) => entry.key === job.key ? {
      key: entry.key,
      enabled,
      everySeconds: entry.everySeconds
    } : { key: entry.key, enabled: entry.enabled, everySeconds: entry.everySeconds });
    await saveQueueScheduleJobs(jobs, `${job.label} ${enabled ? 'enabled' : 'disabled'}.`);
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
    setIsAdminDataRefreshing(true);
    try {
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
      await loadInstances(t).catch(() => undefined);
      await loadDashboard(t);
      if (!selectedGroupId && gr.groups[0]) setSelectedGroupId(gr.groups[0].id);
      if (!selectedRole && rr.roles[0]) setSelectedRole(rr.roles[0].name);
    } finally {
      setIsAdminDataRefreshing(false);
    }
  }

  async function restoreSession(t: string) {
    try {
      const restored = await api<AuthProfile>('/api/auth/me', { token: t });
      setProfile(restored);
      await loadAppLabels(t);
      await loadLogRetention(t).catch(() => undefined);
      await loadSslCertificateWarning(t).catch(() => undefined);
      await loadLicenseExpirationWarning(t).catch(() => undefined);
      await loadQueueSchedules(t).catch(() => undefined);
      if (restored.permissions.includes('system.version.view')) await loadSystemVersion(t).catch(() => undefined);
      if (restored.permissions.some((permission) => ['users.manage', 'groups.manage', 'roles.manage', 'tenants.view', 'tenants.manage'].includes(permission))) await refreshAdminData(t);
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
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void loadDashboard(token).catch((err) => setError(err instanceof Error ? err.message : 'Dashboard refresh failed.'));
    };
    refresh();
    const refreshTimer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token, profile, activeSection]);

  useEffect(() => {
    if (!token || !profile || activeSection !== 'settings-logs' || !canViewLogs) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void loadAppLogs(token).catch((err) => setError(err instanceof Error ? err.message : 'Logs refresh failed.'));
    };
    void loadLogRetention(token).catch((err) => setError(err instanceof Error ? err.message : 'Log retention load failed.'));
    refresh();
    if (isLogRefreshPaused) return undefined;
    const refreshTimer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token, profile, activeSection, logTypeFilter, logSeverityFilter, logEntityGuidFilter, isLogRefreshPaused, canViewLogs]);

  useEffect(() => {
    if (!token || !profile || activeSection !== 'settings-database' || !canViewDatabase) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void loadDatabasePerformance(token).catch((err) => setError(err instanceof Error ? err.message : 'Database performance refresh failed.'));
      void loadQueueJobs(token).catch((err) => setError(err instanceof Error ? err.message : 'Database queue jobs refresh failed.'));
    };
    refresh();
    const refreshTimer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token, profile, activeSection, canViewDatabase, canManagePoller]);

  useEffect(() => {
    if (!token || !profile || activeSection !== 'settings-issues' || !canViewIssueTypes) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void loadIssueCatalog(token).catch((err) => setError(err instanceof Error ? err.message : 'Issue catalog refresh failed.'));
    };
    refresh();
    const refreshTimer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token, profile, activeSection, canViewIssueTypes]);

  useEffect(() => {
    if (!token || !profile || activeSection !== 'settings-queue' || !canViewJobs) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void loadQueueStatus(token).catch((err) => setError(err instanceof Error ? err.message : 'Queue status refresh failed.'));
    };
    refresh();
    const refreshTimer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token, profile, activeSection, canViewJobs]);

  useEffect(() => {
    if (!token || !profile || activeSection !== 'settings-update' || !canViewVersion) return undefined;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      void loadSystemVersion(token).catch((err) => setError(err instanceof Error ? err.message : 'Update status refresh failed.'));
    };
    refresh();
    const refreshTimer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token, profile, activeSection, canViewVersion]);

  useEffect(() => {
    document.body.classList.toggle('cms-notes-editor-active', healthModal === 'notes');
    return () => document.body.classList.remove('cms-notes-editor-active');
  }, [healthModal]);

  async function hydrateInstanceDashboard(instanceId: string, force = false) {
    if (!token || !instanceId) return;
    if (!force && hydratedInstanceDashboardIdsRef.current.has(instanceId)) return;
    if (hydratingInstanceDashboardIdsRef.current.has(instanceId)) return;
    hydratingInstanceDashboardIdsRef.current.add(instanceId);
    try {
      const [detailRes, detailHealthRes] = await Promise.all([
        api<{ instance: OxyGenInstance }>(`/api/instances/${instanceId}`, { token }),
        api<{ healthDetails: InstanceHealthDetails }>(`/api/instances/${instanceId}/health-details`, { token })
      ]);
      const hydrated = detailHealthRes.healthDetails.instance || detailRes.instance;
      setHealthDetails(detailHealthRes.healthDetails);
      setSelectedInstanceDetail(hydrated);
      setInstances((current) => current.map((entry) => entry.id === hydrated.id ? hydrated : entry));
      hydratedInstanceDashboardIdsRef.current.add(instanceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load instance dashboard.');
    } finally {
      hydratingInstanceDashboardIdsRef.current.delete(instanceId);
    }
  }

  useEffect(() => {
    if (!profile) return undefined;
    function applyCurrentRoute(replace = false) {
      const route = sectionFromPath(window.location.pathname);
      setActiveSection(route.section);
      if (route.section === 'settings-logs') {
        setLogEntityGuidFilter(route.entityId || '');
        if (route.entityId) {
          setLogTypeFilter(['Connection', 'Service', 'CRUD']);
          setLogSeverityFilter(['Critical', 'Error', 'Warning', 'Logging', 'Verbose']);
        }
      }
      if (route.section === 'instance-dashboard') {
        const routeInstanceId = route.entityId || '';
        setSelectedInstanceId(routeInstanceId);
        const matched = routeInstanceId ? instances.find((instance) => instance.id === routeInstanceId) : null;
        setSelectedInstanceDetail((current) => current?.id === routeInstanceId && current.licenseJson ? current : matched || current);
        if (routeInstanceId && token) void hydrateInstanceDashboard(routeInstanceId);
      }
      setRoute(route.section, route.entityId, replace);
    }
    applyCurrentRoute(true);
    const onPopState = () => applyCurrentRoute(true);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [profile, instances]);

  function clearStatus() { setError(''); setMessage(''); setMessageTone('success'); }
  function showStatus(text: string, tone: StatusTone = 'success') { setError(''); setMessage(text); setMessageTone(tone); }
  function showNotImplemented(label: string) { showStatus(`${label}: Not Implemented`, 'warning'); }
  function setRoute(section: NavSection, instanceId?: string, replace = false) {
    const nextPath = cmsPathFor(section, instanceId);
    if (window.location.pathname !== nextPath) {
      const method = replace ? 'replaceState' : 'pushState';
      window.history[method]({}, '', nextPath);
    }
  }

  function nav(section: NavSection, implemented = true, label?: string) {
    setActiveSection(section);
    if (section === 'settings-logs') setLogsBackTarget(null);
    if (section !== 'instance-dashboard') setInstanceDashboardBackTarget(null);
    setRoute(section);
    if (section === 'instances') setInstanceGridIssueFilter('all');
    setIsMobileDrawerOpen(false);
    if (!implemented) showNotImplemented(label || section);
  }

  function openTenantDashboard(tenantId: string) {
    setDashboardTenantFilter(tenantId);
    setDashboardIssueFilter('all');
    setShowDashboardInstanceBoard(false);
    nav('dashboard');
  }

  function openDashboardGrid(filter: DashboardIssueFilter = 'all') {
    setDashboardIssueFilter(filter);
    setInstanceGridIssueFilter(filter);
    setActiveSection('instances');
    setRoute('instances');
    setIsMobileDrawerOpen(false);
    void loadInstances(token);
  }

  function openIssueAffectedInstance(affected: IssueCatalogAffectedInstance) {
    const instance = instances.find((item) => item.id === affected.id) || null;
    setSelectedIssueType(null);
    setInstanceDashboardBackTarget({ section: 'settings-issues', label: 'Issue Types' });
    setSelectedInstanceId(affected.id);
    setSelectedInstanceDetail(instance);
    setRoute('instance-dashboard', affected.id);
    setActiveSection('instance-dashboard');
    setIsMobileDrawerOpen(false);
  }

  function revealDashboardInstances(filter: DashboardIssueFilter = dashboardIssueFilter) {
    setDashboardIssueFilter(filter);
    setShowDashboardInstanceBoard(true);
  }

  function closeInstanceDashboard() {
    const target: { section: NavSection; label?: string; entityId?: string } = instanceDashboardBackTarget || { section: 'instances' };
    setRoute(target.section, target.entityId);
    setActiveSection(target.section);
    setInstanceDashboardBackTarget(null);
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
      await Promise.all([
        loadSetupStatus(),
        loadDatabasePerformance(token).catch(() => undefined)
      ]);
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
      setProfile({ user: login.user, roles: login.roles, permissions: login.permissions, groups: login.groups });
      setMessage(`Signed in as ${login.user.displayName}.`);
      await loadAppLabels(login.token);
      await loadLogRetention(login.token).catch(() => undefined);
      await loadSslCertificateWarning(login.token).catch(() => undefined);
      await loadLicenseExpirationWarning(login.token).catch(() => undefined);
      if (login.permissions.includes('system.version.view')) await loadSystemVersion(login.token).catch(() => undefined);
      if (login.permissions.some((permission) => ['users.manage', 'groups.manage', 'roles.manage', 'tenants.view', 'tenants.manage'].includes(permission))) await refreshAdminData(login.token);
      else await loadDashboard(login.token);
    } catch (err) { setError(err instanceof Error ? err.message : 'Login failed.'); }
  }

  const tenantPayload = () => canSelectAnyTenantScope ? selectedTenantId || null : actorTenantId;

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
    const payload = { name: f.get('name'), description: f.get('description') || null, tenantId: editing ? editing.tenantId : tenantPayload(), permissionKeys: selectedPermissionKeys };
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
    const payload = { name: f.get('name'), description: f.get('description') || null, tenantId: editing ? editing.tenantId : tenantPayload(), instanceAccessMode: instanceAccessModeDraft, instanceIds: selectedAccessInstanceIds };
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
    const payload: Record<string, unknown> = { email: f.get('email'), displayName: f.get('displayName'), roleNames: [selectedRole], groupIds: selectedGroupId ? [selectedGroupId] : [], tenantId: editing ? editing.user.tenantId : tenantPayload(), instanceAccessMode: instanceAccessModeDraft, instanceIds: selectedAccessInstanceIds };
    if (!editing || password) payload.password = password;
    try {
      if (editing) { await api<UserProfile>(`/api/users/${editing.user.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated user ${f.get('email')}.`); }
      else { await api<UserProfile>('/api/users', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created user ${f.get('email')}.`); }
      el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'User update failed.' : 'User creation failed.'); }
  }

  function parseInstanceMetadataInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as unknown;
  }

  function instanceMutationPayload(instance: OxyGenInstance, overrides: Record<string, unknown> = {}) {
    return { name: instance.name, description: instance.description, tenantId: instance.tenantId, protocol: instance.protocol, host: instance.host, port: instance.port, username: instance.username, pollingIntervalSeconds: instance.pollingIntervalSeconds, isEnabled: instance.isEnabled, checkLicense: instance.checkLicense, archived: instance.archived, metadata: instance.metadata, notes: instance.notes, ...overrides };
  }

  async function handleSaveInstance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget; const f = new FormData(el);
    const editing = modal?.kind === 'instance' ? modal.data as OxyGenInstance | undefined : undefined;
    const password = String(f.get('password') || '');
    const portValue = f.get('port');
    const username = String(f.get('username') || '').trim() || 'admin';
    const payload: Record<string, unknown> = { id: editing ? editing.id : draftInstanceId || createClientId(), name: f.get('name'), description: f.get('description') || null, tenantId: editing ? editing.tenantId : tenantPayload(), protocol: f.get('protocol') || 'https', host: f.get('host'), port: portValue ? Number(portValue) : null, username, pollingIntervalSeconds: Number(f.get('pollingIntervalSeconds') || 300), isEnabled: f.get('isEnabled') === 'on', checkLicense: f.get('checkLicense') === 'on', archived: f.get('archived') === 'on', metadata: editing?.metadata ?? null, notes: editing?.notes ?? null };
    if (!editing || password) payload.password = password;
    try {
      if (editing) { const res = await api<{ instance: OxyGenInstance }>(`/api/instances/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated instance ${res.instance.name}.`); }
      else { const res = await api<{ instance: OxyGenInstance }>('/api/instances', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created instance ${res.instance.name}.`); }
      el.reset(); setDraftInstanceId(''); setModal(null); await loadInstances(); await loadDashboard(token).catch(() => undefined);
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'Instance update failed.' : 'Instance creation failed.'); }
  }

  async function setInstanceArchived(instance: OxyGenInstance, archived: boolean) {
    clearStatus();
    try {
      const res = await api<{ instance: OxyGenInstance }>(`/api/instances/${instance.id}`, { method: 'PATCH', token, body: JSON.stringify(instanceMutationPayload(instance, { archived })) });
      showStatus(`${archived ? 'Archived' : 'Unarchived'} instance ${res.instance.name}.`, archived ? 'warning' : 'success');
      await loadInstances();
      await loadDashboard(token).catch(() => undefined);
      if (selectedInstanceId === instance.id) setSelectedInstanceDetail(res.instance);
    } catch (err) { setError(err instanceof Error ? err.message : archived ? 'Archive failed.' : 'Unarchive failed.'); setMessageTone('failure'); }
  }

  async function handleExportInstances() {
    clearStatus();
    setIsInstanceExporting(true);
    try {
      const { blob, headers } = await apiBlob('/api/instances/export.csv', { token });
      const disposition = headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'oxygen-instances.csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage('Exported instances CSV. Password values are intentionally blank.');
      setMessageTone('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Instance export failed.');
    } finally {
      setIsInstanceExporting(false);
    }
  }

  async function handleImportInstancesFile(file: File | null) {
    if (!file) return;
    clearStatus();
    setIsInstanceImporting(true);
    try {
      const csv = await file.text();
      const result = await api<InstanceImportResult>('/api/instances/import', { method: 'POST', token, body: JSON.stringify({ csv }) });
      setMessage(`Imported instances from ${file.name}: ${result.created} created, ${result.updated} updated, ${result.failed} failed.`);
      setMessageTone(result.failed ? 'warning' : 'success');
      await loadInstances();
      await loadDashboard(token).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Instance import failed.');
      setMessageTone('failure');
    } finally {
      setIsInstanceImporting(false);
      if (instanceImportFileRef.current) instanceImportFileRef.current.value = '';
    }
  }

  function toggleArchiveMode() {
    const next = !showArchivedInstances;
    setShowArchivedInstances(next);
    void loadInstances(token, next);
  }

  function renderInstanceToolbar() {
    return <>
      {canManageInstances && <Button className="btn-create instance-toolbar-button" onClick={openCreateInstanceModal} type="button" themeColor="primary"><Plus /> Enroll Instance</Button>}
      <Button className="compact-button instance-toolbar-button" type="button" onClick={toggleArchiveMode}>{showArchivedInstances ? <ArchiveRestore /> : <Archive />} {showArchivedInstances ? 'Exit Archive' : 'Archive'}</Button>
      {canImportExportInstances && <>
        <Button className="compact-button instance-toolbar-button" type="button" onClick={() => void handleExportInstances()} disabled={isInstanceExporting}><Download /> {isInstanceExporting ? 'Exporting…' : 'Export CSV'}</Button>
        <Button className="compact-button instance-toolbar-button" type="button" onClick={() => instanceImportFileRef.current?.click()} disabled={isInstanceImporting}><Upload /> {isInstanceImporting ? 'Importing…' : 'Import CSV'}</Button>
        <input ref={instanceImportFileRef} className="visually-hidden-file" type="file" accept=".csv,text/csv" onChange={(event) => void handleImportInstancesFile(event.target.files?.[0] ?? null)} />
      </>}
    </>;
  }

  async function testInstanceConnectivity(instance: OxyGenInstance) {
    clearStatus();
    try {
      const res = await api<{ ok: boolean; status: string; message: string; responseTimeMs?: number | null }>(`/api/instances/${instance.id}/test-connectivity`, { method: 'POST', token });
      const tone: StatusTone = res.ok ? 'success' : res.status === 'ssl-error' ? 'warning' : 'failure';
      showStatus(`${instance.name}: ${res.message} (${res.status}${typeof res.responseTimeMs === 'number' ? `, ${res.responseTimeMs} ms response` : ''})`, tone);
      const refreshed = await api<{ instance: OxyGenInstance }>(`/api/instances/${instance.id}`, { token });
      setInstances((current) => current.map((entry) => entry.id === refreshed.instance.id ? refreshed.instance : entry));
      if (selectedInstanceId === instance.id) {
        setSelectedInstanceDetail(refreshed.instance);
        const details = await api<{ healthDetails: InstanceHealthDetails }>(`/api/instances/${instance.id}/health-details`, { token });
        setHealthDetails(details.healthDetails);
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Connectivity test failed.'); setMessageTone('failure'); }
  }

  async function openInstanceDashboard(instance: OxyGenInstance) {
    clearStatus();
    if (activeSection === 'dashboard') setInstanceDashboardBackTarget({ section: 'dashboard', label: 'Dashboard' });
    else if (activeSection !== 'instance-dashboard') setInstanceDashboardBackTarget({ section: activeSection, label: activeSection === 'settings-logs' ? 'Logs' : activeSection === 'settings-issues' ? 'Issue Types' : activeSection === 'instances' ? 'Instances' : 'Previous view' });
    setSelectedInstanceId(instance.id);
    setSelectedInstanceDetail(instance);
    setRoute('instance-dashboard', instance.id);
    setActiveSection('instance-dashboard');
    await hydrateInstanceDashboard(instance.id, true);
  }



  function openInstanceLogs(instance: OxyGenInstance) {
    if (!canViewLogs) return;
    setLogsBackTarget({ section: 'instance-dashboard', label: `Instance Dashboard - ${instance.name}`, entityId: instance.id });
    setRoute('settings-logs', instance.id);
    setLogEntityGuidFilter(instance.id);
    setLogTypeFilter(['Connection', 'Service', 'CRUD']);
    setLogSeverityFilter(['Critical', 'Error', 'Warning', 'Logging', 'Verbose']);
    setActiveSection('settings-logs');
    void loadAppLogs(token, { entityGuid: instance.id, type: ['Connection', 'Service', 'CRUD'], severity: ['Critical', 'Error', 'Warning', 'Logging', 'Verbose'] });
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
          instanceId: editing?.id ?? (draftInstanceId || createClientId()),
          name: String(f.get('name') || editing?.name || 'Unsaved instance'),
          tenantId: editing?.tenantId ?? tenantPayload(),
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

  function openCreateUserModal() { setSelectedRole(availableRoles.find((r) => !r.isSystem)?.name || availableRoles[0]?.name || 'Viewer'); setSelectedGroupId(''); setSelectedTenantId(canSelectAnyTenantScope ? '' : actorTenantId || ''); setInstanceAccessModeDraft('inherit'); setSelectedAccessInstanceIds([]); setInstanceAccessFilter(''); setModal({ kind: 'user' }); }
  function openEditUserModal(user: UserProfile) { setSelectedRole(user.roles[0] || 'Viewer'); setSelectedGroupId(user.groups[0]?.id || ''); setSelectedTenantId(user.user.tenantId || ''); setInstanceAccessModeDraft(user.user.instanceAccessMode); setSelectedAccessInstanceIds(user.user.instanceIds); setInstanceAccessFilter(''); setModal({ kind: 'user', data: user }); }
  function openCreateGroupModal() { setSelectedTenantId(canSelectAnyTenantScope ? '' : actorTenantId || ''); setInstanceAccessModeDraft('none'); setSelectedAccessInstanceIds([]); setInstanceAccessFilter(''); setModal({ kind: 'group' }); }
  function openEditGroupModal(group: Group) { setSelectedTenantId(group.tenantId || ''); setInstanceAccessModeDraft(group.instanceAccessMode); setSelectedAccessInstanceIds(group.instanceIds); setInstanceAccessFilter(''); setModal({ kind: 'group', data: group }); }
  function openCreateRoleModal() { setSelectedTenantId(canSelectAnyTenantScope ? '' : actorTenantId || ''); setSelectedPermissionKeys(DEFAULT_ROLE_PERMISSIONS.Viewer); setPermissionFilter(''); setPermissionPresetDraft('Viewer'); setModal({ kind: 'role' }); }
  function openEditRoleModal(role: Role) { setSelectedTenantId(role.tenantId || ''); setSelectedPermissionKeys(role.permissionKeys?.length ? role.permissionKeys : DEFAULT_ROLE_PERMISSIONS[role.name] || []); setPermissionFilter(''); setPermissionPresetDraft(''); setModal({ kind: 'role', data: role }); }
  function toggleSelectedPermission(permissionKey: PermissionKey, checked: boolean) {
    setSelectedPermissionKeys((current) => checked ? Array.from(new Set([...current, permissionKey])).sort() : current.filter((key) => key !== permissionKey));
  }
  function setPermissionGroup(group: string, checked: boolean) {
    const groupKeys = PERMISSION_CATALOG.filter((permission) => permission.group === group).map((permission) => permission.key);
    setSelectedPermissionKeys((current) => checked ? Array.from(new Set([...current, ...groupKeys])).sort() : current.filter((key) => !groupKeys.includes(key)));
  }
  function applyRolePreset(roleName: string) {
    setSelectedPermissionKeys(DEFAULT_ROLE_PERMISSIONS[roleName] || []);
  }
  function applyRolePresetDraft() {
    if (permissionPresetDraft === '__clear') {
      setSelectedPermissionKeys([]);
      return;
    }
    if (permissionPresetDraft) applyRolePreset(permissionPresetDraft);
  }
  function openCreateTenantModal() { setModal({ kind: 'tenant' }); }
  function openEditTenantModal(tenant: Tenant) { setModal({ kind: 'tenant', data: tenant }); }
  function openCreateInstanceModal() { setSelectedTenantId(canSelectAnyTenantScope ? '' : actorTenantId || ''); setDraftInstanceId(createClientId()); setInstanceProtocol('https'); setInstancePort('443'); setInstancePollingEnabled(true); setInstanceLicenseCheckEnabled(true); setModal({ kind: 'instance' }); }
  function openEditInstanceModal(instance: OxyGenInstance) { setDraftInstanceId(''); setSelectedTenantId(instance.tenantId || ''); setInstanceProtocol(instance.protocol); setInstancePort(String(instance.port ?? (instance.protocol === 'http' ? 80 : 443))); setInstancePollingEnabled(instance.isEnabled); setInstanceLicenseCheckEnabled(instance.checkLicense); setModal({ kind: 'instance', data: instance }); }

  function handleLogout() { setToken(''); setProfile(null); setDashboard(null); setGroups([]); setUsers([]); setRoles([]); setTenants([]); setInstances([]); setSelectedInstanceId(''); setSelectedInstanceDetail(null); setDashboardLastRefreshedAt(null); setActiveSection('dashboard'); setRoute('dashboard', undefined, true); setIsMobileDrawerOpen(false); setMessage('Signed out.'); }
  function toggleAccordion(key: string) { setOpenAccordions((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  function handleSidebarParentClick(key: 'organizations' | 'security' | 'settings') {
    if (!isDrawerExpanded && !isMobileViewport) {
      if (key === 'organizations') { if (canViewInstances) { nav('instances'); void loadInstances(); } else if (canViewTenants) nav('organizations'); return; }
      if (key === 'security') { nav(canManageUsers ? 'users' : canManageGroups ? 'user-groups' : 'roles'); return; }
      nav(canManageSettings ? 'settings-general' : canViewJobs ? 'settings-queue' : canViewVersion ? 'settings-update' : canViewLogs ? 'settings-logs' : canViewDatabase ? 'settings-database' : canViewIssueTypes ? 'settings-issues' : 'dashboard');
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
  const instanceRows = useMemo<InstanceGridRow[]>(() => instances.filter((instance) => !showArchivedInstances || instance.archived).map((instance) => ({ id: instance.id, name: instance.name, tenant: tenantName(instance.tenantId), host: instance.host, status: instance.status, ssl: sslStatusLabel(instance), license: licenseStatusLabel(instance), processing: instance.processingStatus, enabled: instance.isEnabled ? 'Yes' : 'No', checkLicense: instance.checkLicense ? 'Yes' : 'No', archived: instance.archived ? 'Yes' : 'No', metadata: instance.metadata ? 'Yes' : 'No', notes: instance.notes ? 'Yes' : 'No', description: instance.description || '', protocol: instance.protocol.toUpperCase(), port: String(instance.port ?? ''), hostname: instance.hostname, baseUrl: instance.baseUrl, apiBaseUrl: instance.apiBaseUrl, username: instance.username, pollingInterval: `${instance.pollingIntervalSeconds}s`, sslExpiresAt: instance.sslExpiresAt || '', lastCheckedAt: instance.lastCheckedAt || '', uptime24h: instance.uptimePercent24h === null ? '' : `${instance.uptimePercent24h}%`, emmQueue: instance.emmQueueStatus, sms: instance.smsStatus, hangfire: instance.hangfireStatus, licenseKey: instance.licenseKey || '', lastError: instance.lastError || '', raw: instance })), [instances, tenants, showArchivedInstances]);
  const appLogEntityDescriptions = useMemo(() => {
    const descriptions = new Map<string, string>();
    instances.forEach((instance) => descriptions.set(instance.id, instance.name));
    tenants.forEach((tenant) => descriptions.set(tenant.id, tenant.name));
    users.forEach((entry) => descriptions.set(entry.user.id, entry.user.displayName || entry.user.email));
    groups.forEach((group) => descriptions.set(group.id, group.name));
    roles.forEach((role) => descriptions.set(role.id, role.name));
    return descriptions;
  }, [groups, instances, roles, tenants, users]);
  const appLogRows = useMemo<AppLogGridRow[]>(() => appLogs.map((entry) => {
    const details = appLogDetails(entry.details);
    const apiCall = stringDetail(details.apiCall) || [stringDetail(details.method), stringDetail(details.url)].filter(Boolean).join(' ');
    const responseCode = responseCodeDetail(details.responseCode) || responseCodeDetail(details.statusCode);
    const entityGuid = entry.entityGuid || stringDetail(details.entityGuid);
    return {
      id: entry.id,
      createdAt: formatDateTime(entry.createdAt),
      type: entry.type,
      severity: entry.severity,
      tenant: tenantName(entry.tenantId ?? (stringDetail(details.tenantId) || null)),
      source: entry.source,
      userName: entry.userName === 'anonymous' ? 'Anonymous' : entry.userName || 'OxyGen CMS',
      entityGuid: entityGuid || '—',
      entityDescription: stringDetail(details.entityDescription) || stringDetail(details.entityName) || stringDetail(details.instanceName) || stringDetail(details.name) || (entityGuid ? appLogEntityDescriptions.get(entityGuid) : '') || '—',
      message: entry.message,
      apiCall: apiCall || '—',
      responseCode: responseCode || '—',
      raw: entry
    };
  }), [appLogEntityDescriptions, appLogs, tenants]);
  const issueCatalogRows = useMemo<IssueCatalogGridRow[]>(() => (issueCatalog?.issueTypes ?? []).map((issueType) => ({
    id: issueType.id,
    category: issueType.category.name,
    severity: issueType.severity.name,
    code: issueType.code,
    label: issueType.label,
    description: issueType.description || '',
    condition: issueType.matchValue ? `${issueType.matchKind}: ${issueType.matchValue}` : issueType.matchKind,
    affectedCount: issueType.affectedCount,
    raw: issueType
  })), [issueCatalog]);
  const issueCategoryOptions = useMemo(() => [...new Set(issueCatalogRows.map((row) => row.category))].sort(), [issueCatalogRows]);
  const issueSeverityOptions = useMemo(() => [...new Set(issueCatalogRows.map((row) => row.severity))].sort(), [issueCatalogRows]);
  const issueTypeOptions = useMemo(() => [...issueCatalogRows].sort((left, right) => left.label.localeCompare(right.label)).map((row) => row.label), [issueCatalogRows]);
  const visibleIssueCatalogRows = useMemo(() => issueCatalogRows.filter((row) =>
    (issueCategoryFilter.length === 0 || issueCategoryFilter.includes(row.category)) &&
    (issueSeverityFilter.length === 0 || issueSeverityFilter.includes(row.severity)) &&
    (issueTypeFilter.length === 0 || issueTypeFilter.includes(row.label))
  ), [issueCatalogRows, issueCategoryFilter, issueSeverityFilter, issueTypeFilter]);
  const queueJobRows = useMemo<QueueJobGridRow[]>(() => (systemQueueJobs?.jobs ?? []).map((job, index) => ({
    id: `${String(job.queueSequence).padStart(4, '0')}-${job.queue}-${job.id ?? job.timestamp ?? index}`,
    sequence: job.queueSequence,
    job: job.name,
    tenant: job.data.tenantName ?? (job.data.tenantId ? tenantName(job.data.tenantId) : 'Global'),
    instance: queueJobInstanceLabel(job),
    instanceGuid: job.data.instanceId ?? '',
    queue: job.queue,
    state: job.state,
    resource: queueJobResourceLabel(job),
    age: formatQueueDuration(job.resource?.ageSeconds),
    wait: formatQueueDuration(job.resource?.waitSeconds),
    runtime: formatQueueRuntime(job.resource?.durationMs),
    result: job.result?.summary ?? '—',
    attempts: queueJobAttemptLabel(job),
    nextProcessAt: job.nextProcessAt ? formatDateTime(job.nextProcessAt) : '—',
    lastActivity: formatDateTime(job.finishedOn ?? job.processedOn ?? job.timestamp),
    metadata: queueJobDetail(job),
    raw: job
  })).sort((left, right) => left.sequence - right.sequence), [systemQueueJobs, tenants]);
  const queueJobQueueOptions = useMemo(() => Array.from(new Set(queueJobRows.map((row) => row.raw.queue))).sort(), [queueJobRows]);
  const queueJobStateOptions = useMemo(() => Array.from(new Set(queueJobRows.map((row) => row.raw.state))).sort(), [queueJobRows]);
  const queueJobTypeOptions = useMemo(() => Array.from(new Set(queueJobRows.map((row) => row.raw.name))).sort(), [queueJobRows]);
  const filteredQueueJobRows = useMemo(() => queueJobRows.filter((row) =>
    (queueJobQueueFilter.length === 0 || queueJobQueueFilter.includes(row.raw.queue)) &&
    (queueJobStateFilter.length === 0 || queueJobStateFilter.includes(row.raw.state)) &&
    (queueJobTypeFilter.length === 0 || queueJobTypeFilter.includes(row.raw.name))
  ), [queueJobRows, queueJobQueueFilter, queueJobStateFilter, queueJobTypeFilter]);
  const databaseMaintenanceJobRows = useMemo(() => filteredQueueJobRows.filter((row) => row.raw.queue === 'database-maintenance'), [filteredQueueJobRows]);


  const cell = <T extends { raw: ModalEntity }>(edit: (raw: T['raw']) => void, remove?: (raw: T['raw']) => void) => ({ dataItem, tdProps }: GridCustomCellProps) => {
    const row = dataItem as T;
    return <td {...tdProps} className="k-command-cell"><Button className="btn-icon-info" onClick={() => edit(row.raw)} title="Edit" type="button" fillMode="flat"><Pencil /></Button>{remove && <Button className="btn-icon-danger" onClick={() => remove(row.raw)} title="Delete" type="button" fillMode="flat"><Trash2 /></Button>}</td>;
  };
  const GroupActionCell = cell<GroupGridRow>((raw) => openEditGroupModal(raw as Group), (raw) => deleteItem('group', (raw as Group).id, `group ${(raw as Group).name}`));
  const UserActionCell = cell<UserGridRow>((raw) => openEditUserModal(raw as UserProfile), (raw) => deleteItem('user', (raw as UserProfile).user.id, `user ${(raw as UserProfile).user.email}`));
  function queueActionKeyForRow(row: QueueJobGridRow): QueueScheduleJobKey | string | null {
    if (row.raw.queue === 'instance-checks' && row.raw.data.instanceId) return `instance-check:${row.raw.data.instanceId}`;
    const key = `${row.raw.queue}:${row.raw.name}`;
    return queueSchedules.jobs.some((job) => job.key === key) ? key as QueueScheduleJobKey : null;
  }
  function queueScheduleEnabled(key: QueueScheduleJobKey | string) {
    if (key.startsWith('instance-check:')) return !instances.find((instance) => instance.id === key.slice('instance-check:'.length))?.isEnabled ? false : true;
    return queueSchedules.jobs.find((job) => job.key === key)?.enabled ?? true;
  }
  function QueueJobActionCell({ dataItem, tdProps }: GridCustomCellProps) {
    const row = dataItem as QueueJobGridRow;
    const key = queueActionKeyForRow(row);
    if (!key) return <td {...tdProps} className="k-command-cell queue-actions-cell"><Button className="btn-icon-info" type="button" fillMode="flat" title="View details" onClick={() => setSelectedQueueJob(row.raw)}><Eye /></Button></td>;
    const enabled = queueScheduleEnabled(key);
    const busy = queueActionKey?.startsWith(`${key}:`);
    return <td {...tdProps} className="k-command-cell queue-actions-cell">
      <Button className="btn-icon-info" type="button" fillMode="flat" title="View details" onClick={() => setSelectedQueueJob(row.raw)}><Eye /></Button>
      {canManageJobs && <Button className="btn-icon-info" type="button" fillMode="flat" title="Run now" disabled={busy} onClick={() => void handleQueueJobAction(key, 'run-now')}><RotateCw /></Button>}
      {canManageJobs && <Button className={enabled ? 'btn-icon-warning' : 'btn-icon-info'} type="button" fillMode="flat" title={enabled ? 'Pause recurring job' : 'Resume recurring job'} disabled={busy || row.raw.state === 'active'} onClick={() => void handleQueueJobAction(key, enabled ? 'pause' : 'resume')}>{enabled ? <Pause /> : <Play />}</Button>}
    </td>;
  }
  function RoleActionCell({ dataItem, tdProps }: GridCustomCellProps) {
    const row = dataItem as RoleGridRow;
    if (row.raw.isSystem) {
      return <td {...tdProps} className="k-command-cell"><Button className="btn-icon-info" onClick={() => setMessage(`${row.raw.name} is a protected global role and cannot be modified/deleted.`)} title="Protected system role" type="button" fillMode="flat"><ShieldCheck /></Button></td>;
    }
    return <td {...tdProps} className="k-command-cell"><Button className="btn-icon-info" onClick={() => openEditRoleModal(row.raw)} title="Edit" type="button" fillMode="flat"><Pencil /></Button><Button className="btn-icon-danger" onClick={() => deleteItem('role', row.raw.id, `role ${row.raw.name}`)} title="Delete" type="button" fillMode="flat"><Trash2 /></Button></td>;
  }
  function openRowActionMenu(event: MouseEvent<HTMLButtonElement>, kind: 'tenant' | 'instance', id: string, mobile = false) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const panelWidth = kind === 'instance' ? 230 : 190;
    const left = Math.min(Math.max(12, rect.right - panelWidth), Math.max(12, window.innerWidth - panelWidth - 12));
    const placement = window.innerHeight - rect.bottom < 230 && rect.top > 230 ? 'above' : 'below';
    const top = placement === 'above' ? rect.top - 8 : rect.bottom + 8;
    setActiveRowActionMenu((current) => current?.kind === kind && current.id === id ? null : { kind, id, top, left, placement, mobile });
  }

  function closeRowActionMenu() {
    setActiveRowActionMenu(null);
  }

  function TenantActionMenu({ tenant, mobile = false }: { tenant: Tenant; mobile?: boolean }) {
    const buttonClass = mobile ? 'mobile-card-action instance-action-menu-trigger' : 'btn-icon-info instance-action-menu-trigger';
    const active = activeRowActionMenu?.kind === 'tenant' && activeRowActionMenu.id === tenant.id;
    return <button className={`${buttonClass}${active ? ' active' : ''}`} title="Actions" aria-label={`Actions for ${tenant.name}`} type="button" onClick={(event) => openRowActionMenu(event, 'tenant', tenant.id, mobile)}><Menu /></button>;
  }

  function TenantActionCell({ dataItem, tdProps }: GridCustomCellProps) {
    const row = dataItem as TenantGridRow;
    return <td {...tdProps} className="k-command-cell"><TenantActionMenu tenant={row.raw} /></td>;
  }

  function InstanceActionMenu({ instance, mobile = false }: { instance: OxyGenInstance; mobile?: boolean }) {
    const buttonClass = mobile ? 'mobile-card-action instance-action-menu-trigger' : 'btn-icon-info instance-action-menu-trigger';
    const active = activeRowActionMenu?.kind === 'instance' && activeRowActionMenu.id === instance.id;
    return <button className={`${buttonClass}${active ? ' active' : ''}`} title="Actions" aria-label={`Actions for ${instance.name}`} type="button" onClick={(event) => openRowActionMenu(event, 'instance', instance.id, mobile)}><Menu /></button>;
  }

  function renderRowActionMenu() {
    if (!activeRowActionMenu) return null;
    const style = { top: activeRowActionMenu.top, left: activeRowActionMenu.left, transform: activeRowActionMenu.placement === 'above' ? 'translateY(-100%)' : undefined };
    if (activeRowActionMenu.kind === 'tenant') {
      const tenant = tenants.find((item) => item.id === activeRowActionMenu.id);
      if (!tenant) return null;
      return <div className={`instance-action-menu-panel row-action-menu-portal${activeRowActionMenu.mobile ? ' mobile' : ''}`} style={style} role="menu" onClick={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); openTenantDashboard(tenant.id); }}><LayoutDashboard /> Dashboard</button>
        {canManageTenants && <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); openEditTenantModal(tenant); }}><Pencil /> Edit</button>}
        {canManageTenants && <button className="danger" type="button" role="menuitem" onClick={() => { closeRowActionMenu(); void deleteItem('tenant', tenant.id, `${tenantLabelLower} ${tenant.name}`); }}><Trash2 /> Delete</button>}
      </div>;
    }
    const instance = instances.find((item) => item.id === activeRowActionMenu.id) || selectedInstanceDetail;
    if (!instance || instance.id !== activeRowActionMenu.id) return null;
    return <div className={`instance-action-menu-panel row-action-menu-portal${activeRowActionMenu.mobile ? ' mobile' : ''}`} style={style} role="menu" onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); openInstanceDashboard(instance); }}><LayoutDashboard /> Open Dashboard</button>
      {canManageInstances && <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); openEditInstanceModal(instance); }}><Pencil /> Edit</button>}
      {canManageInstances && <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); void testInstanceConnectivity(instance); }}><RotateCw /> Run Health Check</button>}
      {canViewLogs && <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); openInstanceLogs(instance); }}><ClipboardList /> View Logs</button>}
      <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); window.open(launchUrlForInstance(instance), '_blank', 'noopener,noreferrer'); }}><ExternalLink /> Launch OxyGen</button>
      {canManageInstances && <button type="button" role="menuitem" onClick={() => { closeRowActionMenu(); void setInstanceArchived(instance, !instance.archived); }}>{instance.archived ? <ArchiveRestore /> : <Archive />} {instance.archived ? 'Unarchive' : 'Archive'}</button>}
      {canManageInstances && <button className="danger" type="button" role="menuitem" onClick={() => { closeRowActionMenu(); void deleteItem('instance', instance.id, `instance ${instance.name}`); }}><Trash2 /> Delete</button>}
    </div>;
  }

  function InstanceActionCell({ dataItem, tdProps }: GridCustomCellProps) {
    const row = dataItem as InstanceGridRow;
    return <td {...tdProps} className="k-command-cell"><InstanceActionMenu instance={row.raw} /></td>;
  }

  function IssueCatalogActionCell({ dataItem, tdProps }: GridCustomCellProps) {
    const row = dataItem as IssueCatalogGridRow;
    return <td {...tdProps} className="k-command-cell"><Button className="compact-button" type="button" fillMode="flat" onClick={() => setSelectedIssueType(row.raw)}><ClipboardList /> View</Button></td>;
  }

  function MobileStandardActions({ onEdit, onDelete, protectedOnly = false }: { onEdit: () => void; onDelete?: () => void; protectedOnly?: boolean }) {
    if (protectedOnly) return <Button className="mobile-card-action" onClick={onEdit} title="Protected" aria-label="Protected role" type="button" fillMode="flat"><ShieldCheck /></Button>;
    return <>
      <Button className="mobile-card-action" onClick={onEdit} title="Edit" aria-label="Edit record" type="button" fillMode="flat"><Pencil /></Button>
      {onDelete && <Button className="mobile-card-action danger" onClick={onDelete} title="Delete" aria-label="Delete record" type="button" fillMode="flat"><Trash2 /></Button>}
    </>;
  }

  function mobileInstanceActions(row: InstanceGridRow) {
    return <InstanceActionMenu instance={row.raw} mobile />;
  }


  const dashboardTitle = 'CMS Dashboard';
  const effectiveDashboardTenantFilter = canSelectAnyTenantScope ? dashboardTenantFilter : actorTenantId || 'global';
  const dashboardTenantMatches = (tenantId: TenantId) => effectiveDashboardTenantFilter === 'all' || (effectiveDashboardTenantFilter === 'global' ? tenantId === null : tenantId === effectiveDashboardTenantFilter);
  const hasSslIssue = (instance: OxyGenInstance) => sslStatusHasIssue(instance);
  const hasConnectivityIssue = (instance: OxyGenInstance) => instance.status !== 'up' && instance.status !== 'unknown' && instance.status !== 'ssl-error';
  const hasLicenseIssue = (instance: DashboardInstance | OxyGenInstance) => Boolean((instance as DashboardInstance).issueDetails?.some((issue) => issue.label.toLowerCase().startsWith('license ')));
  const hasLicenseFailure = (instance: DashboardInstance | OxyGenInstance) => Boolean((instance as DashboardInstance).issueDetails?.some((issue) => issue.label.toLowerCase().startsWith('license ') && issue.severity === 'failure'));
  const hasLicenseWarning = (instance: DashboardInstance | OxyGenInstance) => Boolean((instance as DashboardInstance).issueDetails?.some((issue) => issue.label.toLowerCase().startsWith('license ') && issue.severity === 'warning'));
  const hasProcessingFailure = (instance: OxyGenInstance) => instance.processingStatus === 'error' || instance.emmQueueStatus === 'error' || instance.smsStatus === 'error' || instance.hangfireStatus === 'error';
  const hasProcessingWarning = (instance: OxyGenInstance) => instance.processingStatus === 'warning' || instance.emmQueueStatus === 'warning' || instance.smsStatus === 'warning' || instance.hangfireStatus === 'warning';
  const hasProcessingIssue = (instance: OxyGenInstance) => hasProcessingFailure(instance) || hasProcessingWarning(instance);
  const issueDisplayLabel = (label: string) => /^connection timed out:\s*.+/i.test(label.trim()) ? 'Connecting time out' : label;
  const normalizedIssueKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'issue';
  const issueFilterValue = (label: string) => `issue:${normalizedIssueKey(issueDisplayLabel(label))}`;
  const dashboardIssueMatches = (instance: DashboardInstance, filter: DashboardIssueFilter) => {
    if (filter === 'all') return true;
    if (filter === 'issues') return instance.hasIssue;
    if (filter === 'connectivity') return hasConnectivityIssue(instance);
    if (filter === 'ssl') return hasSslIssue(instance);
    if (filter === 'license') return hasLicenseIssue(instance);
    if (filter === 'processing') return hasProcessingIssue(instance);
    if (filter.startsWith('issue:')) return (instance.issueDetails || []).some((issue) => issueFilterValue(issue.label) === filter);
    return true;
  };
  const dashboardEnabledInstances = useMemo(() => (dashboard?.instances || []).filter((instance) => instance.isEnabled), [dashboard]);
  const dashboardTenantScopedInstances = useMemo(() => dashboardEnabledInstances.filter((instance) => dashboardTenantMatches(instance.tenantId)), [dashboardEnabledInstances, effectiveDashboardTenantFilter]);
  const dashboardFilteredInstances = useMemo(() => dashboardTenantScopedInstances.filter((instance) => dashboardIssueMatches(instance, dashboardIssueFilter)), [dashboardTenantScopedInstances, dashboardIssueFilter]);
  const instanceGridDashboardIds = useMemo(() => {
    if (instanceGridIssueFilter === 'all') return null;
    return new Set(dashboardTenantScopedInstances.filter((instance) => dashboardIssueMatches(instance, instanceGridIssueFilter)).map((instance) => instance.id));
  }, [dashboardTenantScopedInstances, instanceGridIssueFilter]);
  const visibleInstanceRows = useMemo(() => instanceGridDashboardIds ? instanceRows.filter((row) => instanceGridDashboardIds.has(row.id)) : instanceRows, [instanceRows, instanceGridDashboardIds]);
  const dashboardIssueOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [
      { value: 'all', label: 'All instances' },
      { value: 'issues', label: 'Only instances with issues' },
      { value: 'connectivity', label: 'Connectivity issues' },
      { value: 'ssl', label: 'SSL warnings' },
      { value: 'license', label: 'License issues' },
      { value: 'processing', label: 'Processing issues' }
    ];
    for (const instance of dashboardTenantScopedInstances) {
      for (const issue of instance.issueDetails || []) {
        const value = issueFilterValue(issue.label);
        if (seen.has(value)) continue;
        seen.add(value);
        options.push({ value, label: issueDisplayLabel(issue.label) });
      }
    }
    return options;
  }, [dashboardTenantScopedInstances]);
  const dashboardTenantOptions = canSelectAnyTenantScope ? tenants : actorTenantId ? tenants.filter((tenant) => tenant.id === actorTenantId) : [];
  const scopedDashboardTenantValue = effectiveDashboardTenantFilter;
  const dashboardScopedCounts = useMemo(() => {
    const visibleInstances = dashboardTenantScopedInstances;
    const totalInstances = visibleInstances.length;
    const httpsInstances = visibleInstances.filter((instance) => instance.protocol === 'https').length;
    const tenantFiltered = effectiveDashboardTenantFilter !== 'all';
    const selectedTenantId = effectiveDashboardTenantFilter === 'global' ? null : effectiveDashboardTenantFilter === 'all' ? undefined : effectiveDashboardTenantFilter;
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
  }, [dashboard, dashboardTenantScopedInstances, effectiveDashboardTenantFilter, groups, users, roles, tenants.length]);
  const lastRefreshLabel = dashboardLastRefreshedAt ? new Date(dashboardLastRefreshedAt).toLocaleTimeString() : 'Not refreshed yet';
  const statusTone = (instance: DashboardInstance) => instance.severity === 'failure' ? 'issue' : instance.severity || (instance.status === 'up' && !instance.hasIssue ? 'ok' : instance.status === 'unknown' ? 'unknown' : 'issue');
  const isTlsConnectionStepFailure = (instance: Pick<OxyGenInstance, 'status' | 'lastError'>, step?: ConnectivityStepDetail) => isTlsConnectionError(instance) || Boolean(step && step.ok === false && step.expiresAt === null && tlsConnectionPattern.test(`${step.message || ''} ${step.errorCode || ''}`));
  const statusLabel = (instance: DashboardInstance) => instance.status === 'up' ? 'UP' : isTlsConnectionError(instance) ? 'TLS / CONNECTION ERROR' : instance.status === 'down' ? 'NO CONNECTION' : instance.status === 'auth-error' ? 'AUTH ERROR' : instance.status === 'ssl-error' ? 'SSL WARNING' : instance.status.toUpperCase();
  const availabilityLabel = (instance: OxyGenInstance) => isTlsConnectionError(instance) ? 'TLS / CONNECTION ERROR' : instance.status === 'down' ? 'NO CONNECTION' : formatHealthStatus(instance.status).toUpperCase();
  const sslCardLabel = (instance: OxyGenInstance, step?: ConnectivityStepDetail) => instance.protocol !== 'https' ? 'Hidden' : isTlsConnectionStepFailure(instance, step) ? 'NOT EVALUATED' : sslStatusLabel(instance).toUpperCase();
  const sslCardDetail = (instance: OxyGenInstance, step?: ConnectivityStepDetail) => instance.protocol !== 'https' ? 'Skipped for HTTP.' : isTlsConnectionStepFailure(instance, step) ? 'TLS connection failed before a certificate could be evaluated.' : step?.skipped ? step.message || 'Skipped.' : instance.sslExpiresAt ? `${sslStatusLabel(instance)} · Expires ${formatDateTime(instance.sslExpiresAt)}` : step?.ok === false ? step.message || 'Certificate validation failed.' : 'No SSL detail collected.';
  const licenseCardLabel = (instance: OxyGenInstance) => licenseStatusLabel(instance).toUpperCase();
  const licenseCardDetail = (instance: OxyGenInstance, step?: ConnectivityStepDetail) => !instance.checkLicense ? 'License check disabled.' : step?.skipped ? step.message || 'Skipped.' : step?.ok === false ? step.message || 'License probe failed.' : licenseExpirationDate(instance) ? `${licenseStatusLabel(instance)} · Expires ${formatDateTime(licenseExpirationDate(instance)!.toISOString())}` : formatNullable(instance.licenseKey, 'No license key collected');
  const licenseCardStatusClass = (instance: OxyGenInstance, step?: ConnectivityStepDetail) => step?.skipped ? 'unknown' : licenseDisplayStatus(instance) === 'valid' ? 'up' : ['warning', 'expiring-soon', 'unavailable'].includes(licenseDisplayStatus(instance)) ? 'ssl-error' : ['missing', 'invalid', 'expired'].includes(licenseDisplayStatus(instance)) || step?.ok === false ? 'down' : 'unknown';
  const resolvedIpLabel = (details?: ConnectivityDetailsJson) => details?.dns?.ok ? (details.dns.address || 'Unknown') : details?.dns ? 'Resolution Failed' : 'Unknown';
  const watchedSettings = [
    { section: 'Global Settings', group: 'BUS_Auto_Purge', groupTitle: 'BUS: Auto Purge', variable: 'BUS_Auto_Purge_Enabled', fallbackLabel: 'Enabled' },
    { section: 'Global Settings', group: 'BUS_Auto_Purge', groupTitle: 'BUS: Auto Purge', variable: 'BUS_Auto_Purge', fallbackLabel: 'Retention Period (Days)' },
    { section: 'Global Settings', group: 'ClientDomain', groupTitle: 'OxyGen Base URL', variable: 'ClientDomain', fallbackLabel: 'OxyGen Base URL' },
    { section: 'Licensing Settings', group: 'OxyGen_Version', groupTitle: 'OxyGen Version', variable: 'OxyGen_Version', fallbackLabel: 'Database Version Number' }
  ];
  const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase();
  const settingGroups = (settingsJson: unknown): Record<string, unknown>[] => {
    if (Array.isArray(settingsJson)) return settingsJson.filter(isRecord);
    if (!isRecord(settingsJson)) return [];
    if ('SettingName' in settingsJson || 'SettingsName' in settingsJson || 'Variables' in settingsJson) return [settingsJson];
    for (const key of ['Settings', 'settings', 'Groups', 'groups', 'Data', 'data']) {
      const value = settingsJson[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
    const keyedGroups: Record<string, unknown>[] = [];
    for (const [key, value] of Object.entries(settingsJson)) {
      if (isRecord(value)) keyedGroups.push({ SettingsName: key, ...value });
    }
    return keyedGroups;
  };
  const variableList = (group: Record<string, unknown>): Record<string, unknown>[] => {
    const variables = group.Variables ?? group.variables;
    if (Array.isArray(variables)) return variables.filter(isRecord);
    if (isRecord(variables)) return Object.entries(variables).map(([key, value]) => isRecord(value) ? { VariableName: key, ...value } : { VariableName: key, Value: value });
    return [];
  };
  const controlList = (group: Record<string, unknown>): Record<string, unknown>[] => {
    const controls = group.Controls ?? group.controls;
    return Array.isArray(controls) ? controls.filter(isRecord) : [];
  };
  const settingControl = (group: Record<string, unknown>, variableName: string) => controlList(group).find((entry) => normalizeKey(entry.VariableName ?? entry.variableName) === normalizeKey(variableName));
  const settingLabel = (group: Record<string, unknown>, variable: Record<string, unknown>, variableName: string, fallback: string) => {
    const control = settingControl(group, variableName);
    const properties = isRecord(control?.Properties) ? control.Properties : isRecord(control?.properties) ? control.properties : null;
    return formatNullable((properties?.Label ?? properties?.label ?? variable.Label ?? variable.label) as string | undefined, fallback);
  };
  const typedGroupValue = (group: Record<string, unknown>, dataSourceOrType: unknown) => {
    const key = normalizeKey(dataSourceOrType);
    if (key === 'booleanvalue' || key === 'boolean') return group.BooleanValue ?? group.booleanValue;
    if (key === 'integervalue' || key === 'integer' || key === 'int32' || key === 'number') return group.IntegerValue ?? group.integerValue;
    if (key === 'decimalvalue' || key === 'decimal') return group.DecimalValue ?? group.decimalValue;
    if (key === 'datetimevalue' || key === 'datetime' || key === 'date') return group.DateTimeValue ?? group.dateTimeValue;
    if (key === 'stringvalue' || key === 'string' || key === 'text') return group.StringValue ?? group.stringValue;
    return undefined;
  };
  const settingRawValue = (group: Record<string, unknown>, variable: Record<string, unknown> | null, variableName: string) => {
    if (variable && variable.Value !== undefined) return variable.Value;
    if (variable && variable.value !== undefined) return variable.value;
    const control = settingControl(group, variableName);
    const valueFromDataSource = typedGroupValue(group, control?.DataSource ?? control?.dataSource);
    if (valueFromDataSource !== undefined && valueFromDataSource !== null) return valueFromDataSource;
    const valueFromType = typedGroupValue(group, variable?.Type ?? variable?.type);
    if (valueFromType !== undefined && valueFromType !== null) return valueFromType;
    return undefined;
  };
  const formatSettingValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return 'Unknown';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const extractedSettings = (settingsJson: unknown) => watchedSettings.map((target) => {
    const group = settingGroups(settingsJson).find((entry) => normalizeKey(entry.SettingName ?? entry.settingName ?? entry.SettingsName ?? entry.settingsName ?? entry.Name ?? entry.name) === normalizeKey(target.group));
    const variable = group ? variableList(group).find((entry) => normalizeKey(entry.VariableName ?? entry.variableName ?? entry.Name ?? entry.name) === normalizeKey(target.variable)) ?? null : null;
    return {
      section: target.section,
      groupKey: target.group,
      groupTitle: target.groupTitle,
      groupDescription: formatNullable((group?.Description ?? group?.description) as string | undefined, ''),
      variableName: target.variable,
      label: target.fallbackLabel,
      description: formatNullable((variable?.Description ?? variable?.description) as string | undefined, ''),
      type: formatNullable((variable?.Type ?? variable?.type) as string | undefined, 'Unknown'),
      value: formatSettingValue(group ? settingRawValue(group, variable, target.variable) : undefined)
    };
  });
  const collectedSettingsCount = (settingsJson: unknown) => {
    const groups = settingGroups(settingsJson);
    const variableCount = groups.reduce((count, group) => count + variableList(group).length, 0);
    return variableCount || groups.length;
  };
  const queueSettingTargets = {
    processing: { group: 'BUS_Trigger_Processing', variable: 'BUS_Trigger_Processing_Enabled' },
    email: { group: 'EMM_Delayed_Processing', variable: 'EMM_Processing_Enabled' },
    sms: { group: 'SMS_Delayed_Processing', variable: 'SMS_Processing_Enabled' },
    schedulingLastCheckIn: { group: 'Hangfire_CheckIn', variable: 'Hangfire_Last_Check_In' }
  };
  const settingValueByKey = (settingsJson: unknown, groupKey: string, variableKey: string) => {
    const group = settingGroups(settingsJson).find((entry) => normalizeKey(entry.SettingName ?? entry.settingName ?? entry.SettingsName ?? entry.settingsName ?? entry.Name ?? entry.name) === normalizeKey(groupKey));
    const variable = group ? variableList(group).find((entry) => normalizeKey(entry.VariableName ?? entry.variableName ?? entry.Name ?? entry.name) === normalizeKey(variableKey)) ?? null : null;
    return group ? settingRawValue(group, variable, variableKey) : undefined;
  };
  const settingBooleanByKey = (settingsJson: unknown, groupKey: string, variableKey: string): boolean | null => {
    const value = settingValueByKey(settingsJson, groupKey, variableKey);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', '1', 'enabled', 'on'].includes(normalized)) return true;
      if (['false', 'no', '0', 'disabled', 'paused', 'off'].includes(normalized)) return false;
    }
    return null;
  };
  const queueEnabledLabel = (enabled: boolean | null) => enabled === null ? 'Unknown' : enabled ? 'Enabled' : 'Paused';
  const queueEnabledTone = (enabled: boolean | null) => enabled === null ? 'unknown' : enabled ? 'enabled' : 'paused';
  const queueStatusMessage = (value: string | null | undefined) => formatNullable(value, 'Unknown');
  const queueRows = (instance: OxyGenInstance) => {
    const settings = instance.settingsJson;
    const schedulingLast = formatSettingValue(settingValueByKey(settings, queueSettingTargets.schedulingLastCheckIn.group, queueSettingTargets.schedulingLastCheckIn.variable));
    return [
      { label: 'Processing Queue', message: queueStatusMessage(instance.processingStatus), enabled: settingBooleanByKey(settings, queueSettingTargets.processing.group, queueSettingTargets.processing.variable) },
      { label: 'Email Queue', message: queueStatusMessage(instance.emmQueueStatus), enabled: settingBooleanByKey(settings, queueSettingTargets.email.group, queueSettingTargets.email.variable) },
      { label: 'SMS Queue', message: queueStatusMessage(instance.smsStatus), enabled: settingBooleanByKey(settings, queueSettingTargets.sms.group, queueSettingTargets.sms.variable) },
      { label: 'Scheduling Queue', message: queueStatusMessage(instance.hangfireStatus), enabled: null, detail: schedulingLast === 'Unknown' ? null : `Last check-in ${schedulingLast}` }
    ];
  };
  const renderQueueStatusList = (instance: OxyGenInstance) => <>
    {queueRows(instance).map((queue) => <Fragment key={queue.label}>
      <dt className="workflow-queue-name">{queue.label}</dt>
      <dd className="workflow-queue-value"><span className={`queue-state-dot ${queueEnabledTone(queue.enabled)}`} title={queueEnabledLabel(queue.enabled)} /><span className="queue-status-message">{queue.message}</span>{queue.enabled !== null && <span className={`queue-state-label ${queueEnabledTone(queue.enabled)}`}>{queueEnabledLabel(queue.enabled)}</span>}{queue.detail && <small>{queue.detail}</small>}</dd>
    </Fragment>)}
  </>;
  const workflowSummary = (value: unknown): WorkflowProbeSummary | null => value && typeof value === 'object' ? value as WorkflowProbeSummary : null;
  const workflowIssueTitle = (issue: WorkflowTriggerIssue) => issue.workflowName || issue.workflowTriggerId || issue.workflowEventId || issue.serviceEventId || 'Workflow trigger error';
  const renderWorkflowIssueList = (summary: WorkflowProbeSummary | null, latestWorkflow?: InstanceCheckHistoryEntry | null) => {
    const activeErrors = summary?.activeErrors ?? [];
    const recovered = summary?.recoveredErrorKeys ?? [];
    return <section className="workflow-trigger-summary" aria-label="Workflow trigger errors">
      <div className={`workflow-trigger-count ${activeErrors.length ? 'issue' : summary?.step?.skipped ? 'unknown' : 'ok'}`}><strong>{summary?.step?.skipped ? 'Not collected' : `${summary?.activeErrorCount ?? activeErrors.length} active trigger error${(summary?.activeErrorCount ?? activeErrors.length) === 1 ? '' : 's'}`}</strong><span>{summary?.step?.message ?? (activeErrors.length ? 'Workflow trigger errors require review.' : 'No active workflow trigger errors detected.')}</span></div>
      {latestWorkflow && <p className="panel-copy small-copy">Latest workflow check: {formatDateTime(latestWorkflow.startedAt)} · {latestWorkflow.status}</p>}
      {activeErrors.length > 0 && <div className="workflow-trigger-list">{activeErrors.map((issue, index) => <article className="workflow-trigger-card" key={`${issue.workflowTriggerId || 'trigger'}-${issue.workflowEventId || index}-${issue.serviceEventId || 'service'}`}>
        <header><strong>{workflowIssueTitle(issue)}</strong><span>{issue.triggerStatus || issue.workflowEventStatus || 'Error'}</span></header>
        <dl className="detail-list workflow-trigger-detail-list"><dt>Trigger ID</dt><dd>{formatNullable(issue.workflowTriggerId)}</dd><dt>Workflow Event ID</dt><dd>{formatNullable(issue.workflowEventId)}</dd><dt>Service Event ID</dt><dd>{formatNullable(issue.serviceEventId)}</dd><dt>Last Error</dt><dd>{formatNullable(issue.workflowEventLastError || issue.serviceErrorMessage)}</dd>{issue.serviceIdentifier && <><dt>Service</dt><dd>{issue.serviceIdentifier}</dd></>}{issue.serviceStackTrace && <><dt>Stack Trace</dt><dd><pre>{issue.serviceStackTrace}</pre></dd></>}{issue.processingOutputs && <><dt>Processing Outputs</dt><dd><pre>{issue.processingOutputs}</pre></dd></>}</dl>
        {issue.mappedIndexData !== null && issue.mappedIndexData !== undefined && <ReadOnlyJsonEditor value={issue.mappedIndexData} />}
      </article>)}</div>}
      {recovered.length > 0 && <p className="panel-copy small-copy">Recovered trigger errors: {recovered.join(', ')}</p>}
    </section>;
  };
  const settingsEntryValue = (settingsJson: unknown, variableName: string) => extractedSettings(settingsJson).find((entry) => entry.variableName === variableName)?.value ?? 'Unknown';
  const booleanPill = (value: boolean | null, trueTone: 'green' | 'red' | 'grey', falseTone: 'green' | 'red' | 'grey', labels: { trueLabel?: string; falseLabel?: string } = {}) => {
    const label = value === null ? 'Unknown' : value ? labels.trueLabel ?? 'Yes' : labels.falseLabel ?? 'No';
    const tone = value === null ? 'unknown' : value ? trueTone : falseTone;
    return <span className={`boolean-pill ${tone}`}>{label}</span>;
  };
  const formatRetentionDays = (value: string) => value === 'Unknown' ? value : /\bdays?\b/i.test(value) ? value : `${value} Days`;
  const renderSettingsTree = (settingsJson: unknown, compact = false) => {
    const autoPurgeEnabled = settingBooleanByKey(settingsJson, 'BUS_Auto_Purge', 'BUS_Auto_Purge_Enabled');
    const retentionDays = formatRetentionDays(settingsEntryValue(settingsJson, 'BUS_Auto_Purge'));
    const baseUrl = settingsEntryValue(settingsJson, 'ClientDomain');
    const oxygenVersion = settingsEntryValue(settingsJson, 'OxyGen_Version');
    return <div className={`settings-summary ${compact ? 'compact' : ''}`}>
      <div className="settings-summary-row settings-summary-row-auto-purge">
        <span className="settings-summary-label">Auto Purge Enabled:</span>
        <span className="settings-summary-value">{booleanPill(autoPurgeEnabled, 'green', 'red', { trueLabel: 'Enabled', falseLabel: 'Disabled' })}</span>
        <span className="settings-summary-label secondary">Retention:</span>
        <span className="settings-summary-value">{retentionDays}</span>
      </div>
      <div className="settings-summary-row">
        <span className="settings-summary-label">OxyGen Base URL:</span>
        <span className="settings-summary-value wide">{baseUrl}</span>
      </div>
      <div className="settings-summary-row">
        <span className="settings-summary-label">OxyGen Version:</span>
        <span className="settings-summary-value wide">{oxygenVersion}</span>
      </div>
    </div>;
  };
  const responseLabel = (instance: DashboardInstance) => instance.status === 'down' && instance.responseTimeMs === null ? 'NO RESPONSE' : instance.responseTimeMs === null ? '—' : `${instance.responseTimeMs} ms`;
  const responseTone = (instance: DashboardInstance) => instance.status === 'down' ? 'issue' : instance.responseTimeMs !== null ? 'ok' : instance.status === 'unknown' ? 'unknown' : statusTone(instance);
  const valueTone = (isGood: boolean, isUnknown = false, isWarning = false) => isWarning ? 'warning' : isUnknown ? 'unknown' : isGood ? 'ok' : 'issue';
  const formatDuration = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${value} ms`;
  const formatHealthStatus = (status: string) => status === 'auth-error' ? 'Auth error' : status === 'ssl-error' ? 'SSL warning' : status.replace(/-/g, ' ');
  const connectivityDetails = (entry: InstanceCheckHistoryEntry | null | undefined): ConnectivityDetailsJson => (entry?.detailsJson && typeof entry.detailsJson === 'object' ? entry.detailsJson as ConnectivityDetailsJson : {});
  const daysUntil = daysUntilDate;

  async function openInstanceHealthModal(kind: InstanceHealthModalKind, targetInstance = selectedInstance) {
    if (!targetInstance || !token) return;
    setSelectedInstanceId(targetInstance.id);
    setSelectedInstanceDetail(targetInstance);
    setHealthModal(kind);
    setHealthDetails(null);
    if (kind === 'metadata') setMetadataDraft(targetInstance.metadata ?? null);
    if (kind === 'notes') setNotesDraft(notesToEditorHtml(targetInstance.notes));
    setIsHealthDetailsLoading(true);
    clearStatus();
    try {
      const res = await api<{ healthDetails: InstanceHealthDetails }>(`/api/instances/${targetInstance.id}/health-details`, { token });
      setHealthDetails(res.healthDetails);
      setSelectedInstanceDetail(res.healthDetails.instance);
      setInstances((current) => current.map((entry) => entry.id === res.healthDetails.instance.id ? res.healthDetails.instance : entry));
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

  function metricCardFilter(label: string): DashboardIssueFilter {
    if (label === 'Issues') return 'issues';
    if (label === 'Connectivity') return 'connectivity';
    if (label === 'SSL') return 'ssl';
    if (label === 'License') return 'license';
    if (label === 'Processing Issues') return 'processing';
    return 'all';
  }

  function instanceStatusModalKind(instance: DashboardInstance): InstanceHealthModalKind {
    if (instance.status === 'ssl-error') return 'ssl';
    return 'availability';
  }

  function openDashboardInstanceLogs(instance: DashboardInstance) {
    if (!canViewLogs) return;
    setSelectedInstanceId(instance.id);
    setSelectedInstanceDetail(instance);
    openInstanceLogs(instance);
  }

  function openDashboardInstanceHealth(instance: DashboardInstance, kind: InstanceHealthModalKind) {
    void openInstanceHealthModal(kind, instance);
  }

  function renderTimingRow(label: string, step?: ConnectivityStepDetail, future = false) {
    const tone = future || step?.skipped ? 'future' : step?.ok === false ? 'issue' : step?.ok ? 'ok' : 'unknown';
    return <li className={`response-step ${tone}`}><span>{label}</span><strong>{future ? 'Future' : step?.skipped ? 'Skipped' : formatDuration(step?.durationMs)}</strong><small>{future ? 'Not collected yet' : step?.message || (step?.httpStatusCode ? `HTTP ${step.httpStatusCode}` : step?.ok ? 'OK' : 'No detail')}</small></li>;
  }

  function detectNotesFormat(value: string | null | undefined) {
    const trimmed = (value || '').trim();
    if (!trimmed) return 'empty';
    if (/^\{\\rtf/i.test(trimmed)) return 'rtf';
    if (/<!doctype html|<html[\s>]|<body[\s>]|<\/?(?:p|div|h[1-6]|ul|ol|li|table|br|strong|em|span|a)[\s>]/i.test(trimmed)) return 'html';
    if (/^#{1,6}\s|\n#{1,6}\s|\*\*[^*]+\*\*|^[-*]\s|```|\[[^\]]+\]\([^\)]+\)/m.test(trimmed)) return 'markdown';
    return 'text';
  }

  function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderNotesContent(notes: string | null | undefined) {
    const format = detectNotesFormat(notes);
    const value = notes || '';
    if (format === 'empty') return <p className="panel-copy">No notes have been added.</p>;
    if (format === 'html') return <iframe className="instance-notes-frame" title="Instance notes HTML preview" sandbox="" srcDoc={value} />;
    if (format === 'markdown') return <pre className="instance-notes-block markdown-notes">{value}</pre>;
    if (format === 'rtf') return <pre className="instance-notes-block rtf-notes">{value}</pre>;
    return <pre className="instance-notes-block text-notes">{value}</pre>;
  }

  async function saveInstanceMetadata() {
    if (!selectedInstance || !token) return;
    clearStatus();
    setIsSavingHealthDetail(true);
    try {
      const res = await api<{ instance: OxyGenInstance }>(`/api/instances/${selectedInstance.id}`, { method: 'PATCH', token, body: JSON.stringify(instanceMutationPayload(selectedInstance, { metadata: metadataDraft })) });
      setSelectedInstanceDetail(res.instance);
      setInstances((prev) => prev.map((instance) => instance.id === res.instance.id ? res.instance : instance));
      setHealthDetails((prev) => prev ? { ...prev, instance: res.instance } : prev);
      showStatus(`Saved metadata for ${res.instance.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Metadata save failed.');
    } finally {
      setIsSavingHealthDetail(false);
    }
  }

  async function saveInstanceNotes() {
    if (!selectedInstance || !token) return;
    clearStatus();
    const originalFormat = detectNotesFormat(selectedInstance.notes);
    const notesValue = originalFormat === 'markdown' ? editorHtmlToMarkdown(notesDraft) : notesDraft;
    setIsSavingHealthDetail(true);
    try {
      const res = await api<{ instance: OxyGenInstance }>(`/api/instances/${selectedInstance.id}`, { method: 'PATCH', token, body: JSON.stringify(instanceMutationPayload(selectedInstance, { notes: notesValue || null })) });
      setSelectedInstanceDetail(res.instance);
      setInstances((prev) => prev.map((instance) => instance.id === res.instance.id ? res.instance : instance));
      setHealthDetails((prev) => prev ? { ...prev, instance: res.instance } : prev);
      setNotesDraft(notesToEditorHtml(res.instance.notes));
      showStatus(`Saved notes for ${res.instance.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notes save failed.');
    } finally {
      setIsSavingHealthDetail(false);
    }
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
      settings: 'Settings',
      metadata: 'Custom Metadata',
      notes: 'Notes',
      record: 'Record Details'
    };
    const title = `${selectedInstance.name} ${titleMap[healthModal]}`;
    const details = healthDetails;
    const instance = details?.instance || selectedInstance;
    const latestConnectivity = details?.latestConnectivity ?? null;
    const stepDetails = connectivityDetails(latestConnectivity);
    const sslDays = daysUntil(instance.sslExpiresAt);
    const triggersStep: ConnectivityStepDetail = stepDetails.api?.skipped ? { ...stepDetails.api, message: (stepDetails.api.message || 'Triggers probe skipped.').replace('Settings', 'Triggers') } : { ok: false, skipped: true, message: 'Triggers probe not collected yet.' };
    const body = <>
      {isHealthDetailsLoading && <p className="panel-copy">Loading health details…</p>}
      {!isHealthDetailsLoading && healthModal === 'availability' && <div className="health-detail-panel"><p className="panel-copy small-copy">Recent persisted availability checks from oldest to newest.</p>{details?.availability.length ? <div className="availability-chart" aria-label="Availability over time">{[...details.availability].reverse().map((entry, index) => <span key={`${entry.startedAt}-${index}`} className={`availability-bar status-${entry.status}`} title={`${formatDateTime(entry.finishedAt || entry.startedAt)} — ${formatHealthStatus(entry.status)}${entry.durationMs !== null ? ` (${entry.durationMs} ms)` : ''}`} />)}</div> : <p className="panel-copy">No availability history has been collected yet.</p>}<dl className="detail-list"><dt>Current status</dt><dd>{formatHealthStatus(instance.status)}</dd><dt>Last checked</dt><dd>{formatDateTime(instance.lastCheckedAt)}</dd><dt>Last success</dt><dd>{formatDateTime(instance.lastSuccessAt)}</dd><dt>Last failure</dt><dd>{formatDateTime(instance.lastFailureAt)}</dd><dt>Last error</dt><dd>{formatNullable(instance.lastError)}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'ssl' && <div className="health-detail-panel"><p className="panel-copy small-copy">{isTlsConnectionStepFailure(instance, stepDetails.ssl) ? 'TLS / Connection Error: CMS could open the socket, but the remote host closed the TLS handshake before a certificate could be evaluated. This is a blocking connection failure, not an ignorable SSL warning.' : 'SSL warnings are certificate-validation problems after TLS can be established. They may be bypassable depending on policy, but should still be reviewed.'}</p><dl className="detail-list"><dt>Protocol</dt><dd>{instance.protocol.toUpperCase()}</dd><dt>Certificate status</dt><dd>{instance.protocol !== 'https' ? 'Skipped for HTTP' : isTlsConnectionStepFailure(instance, stepDetails.ssl) ? 'Not evaluated - TLS connection failed' : sslStatusLabel(instance)}</dd><dt>Expires</dt><dd>{isTlsConnectionStepFailure(instance, stepDetails.ssl) ? 'Unknown - no certificate received' : formatDateTime(instance.sslExpiresAt)}</dd><dt>Days until expiration</dt><dd>{isTlsConnectionStepFailure(instance, stepDetails.ssl) ? 'Unknown - no certificate received' : sslDays === null ? 'Unknown' : sslDays}</dd><dt>Last SSL/TLS probe</dt><dd>{formatDuration(stepDetails.ssl?.durationMs)}</dd><dt>SSL / TLS message</dt><dd>{stepDetails.ssl?.message || 'No SSL/TLS detail collected.'}</dd><dt>Error code</dt><dd>{formatNullable(stepDetails.ssl?.errorCode)}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'license' && <div className="health-detail-panel"><dl className="detail-list"><dt>Status</dt><dd>{licenseStatusLabel(instance)}</dd><dt>Raw status</dt><dd>{instance.licenseStatus}</dd><dt>Expires</dt><dd>{licenseExpirationDate(instance) ? formatDateTime(licenseExpirationDate(instance)!.toISOString()) : 'Unknown'}</dd><dt>Days until expiration</dt><dd>{daysUntilLicenseExpiration(instance) === null ? 'Unknown' : daysUntilLicenseExpiration(instance)}</dd><dt>License key</dt><dd>{formatNullable(instance.licenseKey, 'No license key collected')}</dd><dt>Last license probe</dt><dd>{details?.licenseHistory[0] ? `${formatDateTime(details.licenseHistory[0].finishedAt || details.licenseHistory[0].startedAt)} (${formatDuration(details.licenseHistory[0].durationMs)})` : 'No license history collected.'}</dd></dl><ReadOnlyJsonEditor value={instance.licenseJson ?? { message: 'No license JSON collected yet.' }} /></div>}
      {!isHealthDetailsLoading && healthModal === 'response' && <div className="health-detail-panel"><p className="panel-copy small-copy">Timing from the last persisted check. Response is Resolve + Connect + SSL + Auth for collected, non-skipped phases.</p><ol className="response-step-list">{renderTimingRow('Resolve', stepDetails.dns)}{renderTimingRow('Connect', stepDetails.connect)}{instance.protocol === 'https' && renderTimingRow('SSL', stepDetails.ssl)}{renderTimingRow('Auth', stepDetails.authentication)}{instance.checkLicense && renderTimingRow('License', stepDetails.license)}{renderTimingRow('Settings', stepDetails.api)}{renderTimingRow('Triggers', triggersStep)}</ol><dl className="detail-list"><dt>Card response</dt><dd>{formatDuration(instance.responseTimeMs)}</dd><dt>Total check duration</dt><dd>{formatDuration(latestConnectivity?.durationMs)}</dd><dt>Last checked</dt><dd>{formatDateTime(instance.lastCheckedAt)}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'endpoint' && <div className="health-detail-panel"><dl className="detail-list"><dt>{tenantLabel}</dt><dd>{tenantName(instance.tenantId)}</dd><dt>Host</dt><dd>{instance.host}</dd><dt>Resolved IP</dt><dd>{resolvedIpLabel(stepDetails)}</dd><dt>Port</dt><dd>{formatNullable(instance.port)}</dd><dt>Base URL</dt><dd>{instance.baseUrl}</dd><dt>API Base URL</dt><dd>{instance.apiBaseUrl}</dd><dt>Launch URL</dt><dd>{instance.launchUrl}</dd><dt>Username</dt><dd>{instance.username}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'monitoring' && <div className="health-detail-panel"><dl className="detail-list"><dt>Enabled</dt><dd>{booleanPill(instance.isEnabled, 'green', 'red', { trueLabel: 'Enabled', falseLabel: 'Disabled' })}</dd><dt>Check License</dt><dd>{booleanPill(instance.checkLicense, 'green', 'grey', { trueLabel: 'Enabled', falseLabel: 'Disabled' })}</dd><dt>Archived</dt><dd>{booleanPill(instance.archived, 'red', 'green')}</dd><dt>Last success</dt><dd>{formatDateTime(instance.lastSuccessAt)}</dd><dt>Last failure</dt><dd>{formatDateTime(instance.lastFailureAt)}</dd><dt>Uptime 24h</dt><dd>{instance.uptimePercent24h === null ? 'Unknown' : `${instance.uptimePercent24h}%`}</dd><dt>Uptime 7d</dt><dd>{instance.uptimePercent7d === null ? 'Unknown' : `${instance.uptimePercent7d}%`}</dd><dt>Last error</dt><dd>{formatNullable(instance.lastError, 'None')}</dd></dl></div>}
      {!isHealthDetailsLoading && healthModal === 'workflow' && <div className="health-detail-panel"><dl className="detail-list workflow-queue-detail-list">{renderQueueStatusList(instance)}<dt>Workflow summary</dt><dd>{instance.workflowSummaryJson ? 'Collected' : 'Not collected yet'}</dd></dl>{renderWorkflowIssueList(workflowSummary(instance.workflowSummaryJson), healthDetails?.latestWorkflow)}{Boolean(instance.workflowSummaryJson) && <ReadOnlyJsonEditor value={instance.workflowSummaryJson} />}</div>}
      {!isHealthDetailsLoading && healthModal === 'settings' && <div className="health-detail-panel"><p className="panel-copy small-copy">Key values extracted from the latest collected global settings payload.</p>{renderSettingsTree(instance.settingsJson)}<ReadOnlyJsonEditor value={instance.settingsJson ?? { message: 'No settings JSON collected yet.' }} /></div>}
      {!isHealthDetailsLoading && healthModal === 'metadata' && <div className="health-detail-panel"><p className="panel-copy small-copy">Edit custom instance metadata stored with this instance.</p><EditableJsonEditor value={metadataDraft ?? {}} onChange={setMetadataDraft} /></div>}
      {!isHealthDetailsLoading && healthModal === 'notes' && <div className="health-detail-panel"><dl className="detail-list"><dt>Detected format</dt><dd>{detectNotesFormat(instance.notes).toUpperCase()}</dd><dt>Editor mode</dt><dd>{detectNotesFormat(instance.notes) === 'markdown' ? 'Markdown rendered through Kendo Editor' : 'Rich text HTML'}</dd></dl><Editor className="instance-notes-editor" defaultEditMode="div" value={notesDraft} onChange={(event: EditorChangeEvent) => setNotesDraft(event.html)} tools={notesEditorTools} contentStyle={{ height: 360, backgroundColor: '#020b14', color: '#f8fafc' }} /></div>}
      {!isHealthDetailsLoading && healthModal === 'record' && <div className="health-detail-panel"><dl className="detail-list"><dt>Description</dt><dd>{formatNullable(instance.description, 'No description')}</dd><dt>Created</dt><dd>{formatDateTime(instance.createdAt)}</dd><dt>Updated</dt><dd>{formatDateTime(instance.updatedAt)}</dd><dt>Instance ID</dt><dd>{instance.id}</dd></dl></div>}
    </>;
    if (isMobileViewport) {
      return <section className="mobile-health-screen" aria-labelledby="mobile-health-title"><header className="mobile-health-screen-header"><button className="mobile-editor-back" type="button" onClick={() => setHealthModal(null)} aria-label="Back"><ChevronLeft /></button><div><p className="eyebrow small">Instance health</p><h2 id="mobile-health-title">{title}</h2></div></header><div className="mobile-health-screen-body">{body}<div className="mobile-editor-actions">{healthModal === 'metadata' && <Button className="compact-button" type="button" themeColor="primary" onClick={() => void saveInstanceMetadata()} disabled={isSavingHealthDetail}>Save Metadata</Button>}{healthModal === 'notes' && <Button className="compact-button" type="button" themeColor="primary" onClick={() => void saveInstanceNotes()} disabled={isSavingHealthDetail}>Save Notes</Button>}</div></div></section>;
    }
    return <Dialog className="cms-dialog instance-health-dialog" title={title} onClose={() => setHealthModal(null)} width={healthModal === 'license' || healthModal === 'settings' || healthModal === 'metadata' || healthModal === 'notes' ? 920 : 760}>
      {body}
      <DialogActionsBar>{healthModal === 'metadata' && <Button className="compact-button" type="button" themeColor="primary" onClick={() => void saveInstanceMetadata()} disabled={isSavingHealthDetail}>Save Metadata</Button>}{healthModal === 'notes' && <Button className="compact-button" type="button" themeColor="primary" onClick={() => void saveInstanceNotes()} disabled={isSavingHealthDetail}>Save Notes</Button>}<Button className="compact-button instance-health-dialog-close" type="button" fillMode="flat" onClick={() => setHealthModal(null)}>Close</Button></DialogActionsBar>
    </Dialog>;
  }

  function renderDashboard() {
    if (!dashboard) {
      return <article className="panel tenant-dashboard-empty"><LoadingOverlay label="Loading dashboard summary…" /></article>;
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
        <div className="dashboard-refresh-actions"><label className="dashboard-inline-filter"><span>{tenantLabel}</span><select value={scopedDashboardTenantValue} disabled={!canSelectAnyTenantScope} onChange={(e) => { setDashboardTenantFilter(e.target.value); setShowDashboardInstanceBoard(false); }}>{canSelectAnyTenantScope && <><option value="all">All {tenantLabelPlural}</option><option value="global">Global / unassigned</option></>}{!canSelectAnyTenantScope && actorTenantId && dashboardTenantOptions.length === 0 && <option value={actorTenantId}>{actorTenantName}</option>}{!canSelectAnyTenantScope && !actorTenantId && <option value="global">Global / unassigned</option>}{dashboardTenantOptions.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenantOptionLabel(tenant)}</option>)}</select></label><button className="compact-button dashboard-refresh-button" type="button" onClick={() => void loadDashboard(token, 'manual')} disabled={isDashboardRefreshing}><RotateCw className={isDashboardRefreshing ? 'spin-icon' : ''} /><span>Refresh</span></button></div>
      </section>
      <section className="tenant-issue-grid dashboard-admin-kpis" aria-label="Dashboard security and tenant counts">{adminCards.map((card) => <article className={`tenant-issue-card ${card.tone}`} key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>)}</section>
      <section className={`panel service-status-card ${pollerTone}`} aria-label="Background polling service status"><div className="service-status-main"><div className="service-title-block"><p className="eyebrow small">Service</p><div className="service-title-row"><h3>Background Polling Runner</h3><span className="service-state service-title-state">(<span className={`service-dot ${pollerTone}`} /><strong>{poller ? poller.state.toUpperCase() : 'UNAVAILABLE'}</strong>)</span></div></div></div><dl className="service-status-grid"><div><dt>Last run</dt><dd>{formatDateTime(poller?.lastRunAt ?? null)}</dd></div><div><dt>Next run</dt><dd>{formatDateTime(poller?.nextRunAt ?? null)}</dd></div><div className="compact"><dt>In flight</dt><dd>{poller?.inFlight ?? 0}</dd></div><div className="summary-wide"><dt>Last summary</dt><dd>{pollerSummary}</dd></div>{poller?.lastError && <div className="wide"><dt>Last error</dt><dd>{poller.lastError}</dd></div>}</dl>{canManagePoller && <div className="service-actions"><Button className="compact-button" type="button" onClick={() => void handlePollerControl('run-now')} disabled={!poller}><RotateCw /> Run Now</Button><Button className="compact-button" type="button" onClick={() => void handlePollerControl(poller?.isPaused ? 'resume' : 'pause')} disabled={!poller}>{poller?.isPaused ? <Play /> : <Pause />}{poller?.isPaused ? 'Resume Poller' : 'Pause Poller'}</Button><Button className="compact-button" type="button" fillMode="flat" onClick={() => nav('settings-logs')}><ClipboardList /> View Logs</Button></div>}</section>
      <section className="tenant-metric-grid dashboard-primary-kpis" aria-label="Dashboard health KPIs">{metricCards.map((card) => <button className={`tenant-metric-card ${card.tone} clickable`} key={card.label} type="button" onClick={() => card.tone === 'ok' ? openDashboardGrid(metricCardFilter(card.label)) : revealDashboardInstances(metricCardFilter(card.label))}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></button>)}</section>
      <section className={`tenant-instance-board ${showDashboardInstanceBoard ? 'expanded' : 'collapsed'}`} aria-label="Tenant instance cards">
        <div className="tenant-section-heading"><div><p className="eyebrow small">Instances</p><h3>Instance Board</h3></div><div className="dashboard-filter-bar"><label>Issues<select value={dashboardIssueFilter} onChange={(e) => revealDashboardInstances(e.target.value)}>{dashboardIssueOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><Button className="compact-button" type="button" onClick={() => setShowDashboardInstanceBoard((visible) => !visible)}>{showDashboardInstanceBoard ? <EyeOff /> : <Eye />} {showDashboardInstanceBoard ? 'Hide Cards' : 'Show Cards'}</Button><Button className="compact-button" type="button" onClick={() => openDashboardGrid(dashboardIssueFilter)}><Server /> View Grid</Button></div></div>
        {!showDashboardInstanceBoard && <article className="panel tenant-dashboard-empty compact"><p className="panel-copy">Instance cards are hidden by default. Use Show Cards or click an issue KPI to reveal the filtered cards.</p></article>}
        {showDashboardInstanceBoard && (dashboard.instances.length === 0 ? <article className="panel tenant-dashboard-empty"><p className="panel-copy">No instances are currently visible for this dashboard scope.</p></article> : dashboardFilteredInstances.length === 0 ? <article className="panel tenant-dashboard-empty"><p className="panel-copy">No instances match the current dashboard filters.</p></article> : <div className="tenant-instance-card-grid">{dashboardFilteredInstances.map((instance) => {
          const tone = statusTone(instance);
          return <article className={`tenant-instance-card status-${instance.status} ${tone}`} key={instance.id}>
            <header><div><span className="instance-status-dot" /><h4><button className="tenant-instance-name-link" type="button" onClick={() => void openInstanceDashboard(instance)}>{instance.name}</button></h4><p>{instance.host}</p></div><button className="instance-status-pill" type="button" onClick={() => openDashboardInstanceHealth(instance, instanceStatusModalKind(instance))}>{statusLabel(instance)}</button></header>
            <div className="tenant-instance-stats"><button type="button" onClick={() => openDashboardInstanceHealth(instance, 'availability')}><b className={valueTone(instance.uptimePercent24h !== null && instance.uptimePercent24h >= 99, instance.uptimePercent24h === null)}>{instance.uptimePercent24h === null ? '—' : `${instance.uptimePercent24h}%`}</b><small>Uptime</small></button><button type="button" onClick={() => openDashboardInstanceHealth(instance, 'response')}><b className={responseTone(instance)}>{responseLabel(instance)}</b><small>Response</small></button><button type="button" onClick={() => openDashboardInstanceHealth(instance, instance.checkLicense ? 'license' : 'monitoring')}><b className={hasLicenseFailure(instance) ? 'issue' : hasLicenseWarning(instance) ? 'warning' : valueTone(instance.licenseStatus === 'valid', instance.licenseStatus === 'unknown')}>{licenseStatusLabel(instance)}</b><small>License</small></button></div>
            <div className="tenant-instance-foot"><button className="tenant-instance-status-message" type="button" onClick={() => openDashboardInstanceLogs(instance)}>{instance.primaryIssue ? issueDisplayLabel(instance.primaryIssue) : instance.hasIssue ? issueDisplayLabel(instance.issues[0] || 'Issue detected') : 'No active issues'}</button><div className="tenant-instance-actions" aria-label={`Actions for ${instance.name}`}><InstanceActionMenu instance={instance} mobile /></div></div>
          </article>;
        })}</div>)}
      </section>
    </div>;
  }

  function updateTone(snapshot: SystemVersionSnapshot | null): 'ok' | 'warning' | 'issue' | 'neutral' {
    if (!snapshot) return 'neutral';
    if (snapshot.update.available) return 'warning';
    if (snapshot.update.error) return 'issue';
    return 'ok';
  }

  function updateStatusLabel(snapshot: SystemVersionSnapshot | null) {
    if (!snapshot) return 'Checking';
    if (snapshot.update.available) return snapshot.update.source === 'github-branch' ? 'Branch Update Available' : 'Update Available';
    if (snapshot.update.error) return 'Check Unavailable';
    return snapshot.update.source === 'github-branch' ? 'Branch Current' : 'Up to Date';
  }

  function latestUpdateLabel(update: SystemVersionSnapshot['update'] | undefined) {
    if (!update) return { heading: 'Latest', value: 'Unknown', detail: 'Not checked yet', timestampLabel: 'Published', targetPlaceholder: 'main' };
    if (update.source === 'github-branch') {
      const branchName = update.latestName?.split(' @ ')[0] || 'default branch';
      return {
        heading: 'Default Branch',
        value: update.latestName ?? update.latestVersion ?? branchName,
        detail: 'GitHub branch commit',
        timestampLabel: 'Branch commit',
        targetPlaceholder: branchName
      };
    }
    if (update.source === 'github-tag') return { heading: 'Latest', value: update.latestVersion ?? 'Unknown', detail: 'GitHub tag', timestampLabel: 'Published', targetPlaceholder: update.latestVersion ?? 'main' };
    if (update.source === 'github-release') return { heading: 'Latest', value: update.latestVersion ?? 'Unknown', detail: 'GitHub release', timestampLabel: 'Published', targetPlaceholder: update.latestVersion ?? 'main' };
    return { heading: 'Latest', value: 'Unknown', detail: 'GitHub unavailable', timestampLabel: 'Published', targetPlaceholder: 'main' };
  }

  function updateRunnerLabel(status: SystemUpdateStatus | null) {
    if (!status) return 'Loading';
    if (status.runner.inProgress) return 'Update Running';
    if (!status.runner.enabled || status.runner.state === 'unavailable') return 'Unavailable';
    if (!status.runner.canRun) return 'Blocked';
    return 'Ready';
  }

  function updateStepTone(state: SystemUpdateStepState) {
    if (state === 'completed') return 'ok';
    if (state === 'running') return 'running';
    if (state === 'failed') return 'issue';
    if (state === 'skipped') return 'warning';
    return 'pending';
  }

  function renderVersionUpdatePanel() {
    const snapshot = systemVersion;
    const update = snapshot?.update;
    const current = snapshot?.current;
    const status = systemUpdateStatus;
    const tone = updateTone(snapshot);
    const latest = latestUpdateLabel(update);
    const updateTargetPlaceholder = status?.runner.targetRef || latest.targetPlaceholder || 'main';
    return <article className={`panel settings-panel version-update-panel ${tone}`}>
      <div className="panel-heading"><Download /><div><p className="eyebrow small">Application updates</p><h3>OxyGen CMS Version & Update Readiness</h3><small className="dashboard-refresh-stamp">Application version, GitHub update readiness, and guarded host-side update controls live here.</small></div></div>
      <section className={`version-update-summary ${tone}`}>
        <div><span>Current</span><strong>{current?.version ?? 'Unknown'}</strong><small>{current?.commit ? `Build ${current.commit.slice(0, 12)}` : 'Build commit not stamped'}</small></div>
        <div><span>{latest.heading}</span><strong>{latest.value}</strong><small>{latest.detail}</small></div>
        <div><span>Version Status</span><strong>{updateStatusLabel(snapshot)}</strong><small>{update ? `Checked ${formatDateTime(update.checkedAt)}` : 'Not checked yet'}</small></div>
        <div><span>Update Runner</span><strong>{updateRunnerLabel(status)}</strong><small>{status ? `Generated ${formatDateTime(status.generatedAt)}` : 'Checking host command'}</small></div>
      </section>
      {update?.available && <p className="panel-copy version-update-message">{update.source === 'github-branch' ? 'The GitHub default branch has a newer commit than this running build. CMS can dry-run or update to that branch when guarded host execution is enabled.' : 'A newer OxyGen CMS version is available. CMS shows guarded update readiness and host-side execution can be enabled explicitly for self-hosted deployments.'}</p>}
      {update?.error && <p className="panel-copy version-update-message warning">Update checks are non-blocking. CMS could not reach GitHub: {update.error}</p>}
      {status?.lastError && <p className="panel-copy version-update-message warning">Last update runner error: {status.lastError}</p>}
      <dl className="detail-list version-detail-list"><dt>Repository</dt><dd>{current?.repository ?? 'Unknown'}</dd><dt>Channel</dt><dd>{current?.updateChannel ?? 'stable'}</dd><dt>Build date</dt><dd>{current?.buildDate ? formatDateTime(current.buildDate) : 'Not stamped by deployment'}</dd><dt>{latest.timestampLabel}</dt><dd>{update?.publishedAt ? formatDateTime(update.publishedAt) : 'Unavailable'}</dd><dt>Dry run</dt><dd><code>{status?.runner.dryRunCommand ?? 'scripts/deploy.sh update --dry-run'}</code></dd><dt>Confirmed update</dt><dd><code>{status ? `${status.runner.confirmationVariable}=YES ${status.runner.command}` : 'CONFIRM_UPDATE=YES scripts/deploy.sh update'}</code></dd></dl>
      {status && <section className="update-runner-workflow" aria-label="Guarded update workflow"><div className="update-workflow-copy"><strong>Guarded update workflow</strong><span>These steps are the host-side deployment workflow. They remain pending until an authorized dry run or confirmed update is started.</span></div><div className="update-readiness-grid">{status.steps.map((step, index) => <article className={`update-readiness-step ${updateStepTone(step.state)}`} key={step.code}><span className="update-step-index">{index + 1}</span><div><strong>{step.label}</strong><p>{step.description}</p>{step.message && <small>{step.message}</small>}</div><span className="update-step-state">{step.state.replace('-', ' ')}</span></article>)}</div></section>}
      {status?.lastRun && <p className="panel-copy version-update-message">Last {status.lastRun.mode === 'dry-run' ? 'dry run' : 'update'} for {status.lastRun.targetRef} is {status.lastRun.state}{status.lastRun.summary ? `: ${status.lastRun.summary}` : ''}.</p>}
      {status && <section className="update-runner-actions" aria-label="Guarded update actions"><label><span>Target ref</span><input value={updateTargetRef} onChange={(e) => setUpdateTargetRef(e.target.value)} placeholder={updateTargetPlaceholder} disabled={status.runner.inProgress || Boolean(updateRunnerAction)} /></label><div><Button className="compact-button" type="button" onClick={() => void runUpdateRunner('dry-run')} disabled={!status.runner.canRun || Boolean(updateRunnerAction)}><Play /> {updateRunnerAction === 'dry-run' ? 'Starting…' : 'Run Dry Run'}</Button><Button className="compact-button btn-danger-outline" type="button" onClick={() => void runUpdateRunner('update')} disabled={!status.runner.canRun || Boolean(updateRunnerAction)}><Download /> {updateRunnerAction === 'update' ? 'Starting…' : 'Confirm Update'}</Button></div><small>{status.runner.enabled ? 'Dry Run is safe. Confirm Update still requires server-side guarded runner configuration and confirmation.' : 'Update execution is disabled until CMS_UPDATE_RUNNER_ENABLED=true is configured on the host.'}</small></section>}
      {status && <section className="update-recovery-guidance" aria-label="Update recovery guidance"><strong>Recovery guidance</strong><ul><li>Every confirmed update creates a pre-update backup before checkout/build/restart.</li><li>If the app fails after update, review the latest backup under <code>deploy/backups/</code>, then restore with <code>CONFIRM_RESTORE=YES scripts/deploy.sh restore-db deploy/backups/&lt;timestamp&gt;/mysql.sql.gz</code>.</li><li>If the runner fails before checkout, fix the reported blocker and rerun Dry Run before Confirm Update.</li><li>If schema migration fails after restart, keep the backup, correct the database/setup issue, then rerun the guarded update or the setup schema step.</li></ul></section>}
      <div className="version-update-actions"><Button className="compact-button" type="button" onClick={() => void loadSystemVersion(token, 'manual')} disabled={isSystemVersionRefreshing}><RotateCw className={isSystemVersionRefreshing ? 'spin-icon' : ''} /> Refresh Readiness</Button>{(update?.releaseUrl || current?.sourceUrl) && <Button className="compact-button" type="button" fillMode="flat" onClick={() => window.open(update?.releaseUrl || current?.sourceUrl, '_blank', 'noopener,noreferrer')}><ExternalLink /> View Source</Button>}</div>
    </article>;
  }

  function renderUpdateNotice() {
    if (!systemVersion?.update.available) return null;
    const update = systemVersion.update;
    const label = update.source === 'github-branch' ? update.latestName ?? update.latestVersion : update.latestVersion;
    const message = update.source === 'github-branch'
      ? `The GitHub default branch has a newer commit (${label}) than this running build.`
      : `${label} is available from GitHub. Current version: ${systemVersion.current.version}.`;
    return <section className="version-update-notice" role="status"><div><strong>OxyGen CMS update available</strong><span>{message}</span></div><Button className="compact-button" type="button" onClick={() => nav('settings-update')}><Download /> View Update</Button></section>;
  }


  function queueHealthTone(snapshot: SystemQueueStatus | null): 'ok' | 'warning' | 'issue' | 'neutral' {
    if (!snapshot) return 'neutral';
    if (!snapshot.enabled || snapshot.mode === 'disabled') return 'warning';
    if (!snapshot.redis.connected) return 'issue';
    return 'ok';
  }

  function queueJobInstanceLabel(job: QueueJobSummary) {
    return job.data.instanceName ?? (job.data.instanceId ? `Unknown (${job.data.instanceId.slice(0, 8)}…)` : '—');
  }

  function formatQueueDuration(seconds: number | null | undefined) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.round((seconds % 86400) / 3600)}h`;
  }

  function formatQueueRuntime(durationMs: number | null | undefined) {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return '—';
    if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
    return formatQueueDuration(durationMs / 1000);
  }

  function queueJobResourceLabel(job: QueueJobSummary) {
    const phase = job.resource?.phase ?? (job.state === 'scheduled' ? 'scheduled' : job.state === 'completed' || job.state === 'failed' ? 'retained' : job.state === 'active' || job.state === 'waiting' || job.state === 'delayed' ? 'live' : 'unknown');
    const attemptCost = job.resource?.attemptCost ?? job.attemptsMade ?? 0;
    return attemptCost > 0 ? `${phase} · ${attemptCost} attempt${attemptCost === 1 ? '' : 's'}` : phase;
  }

  function queueJobDetail(job: QueueJobSummary) {
    const bits = [job.data.task, job.data.source, job.result?.summary ? `Result ${job.result.summary}` : null, typeof job.iterationCount === 'number' ? `Run count ${job.iterationCount}` : null, job.data.requestedBy ? `By ${job.data.requestedBy}` : null].filter(Boolean);
    return bits.length ? bits.join(' · ') : 'No public metadata';
  }

  function formatRecurringSchedule(everySeconds: number | undefined) {
    if (typeof everySeconds !== 'number' || !Number.isFinite(everySeconds) || everySeconds <= 0) return null;
    const seconds = Math.round(everySeconds);
    const units = [
      { label: 'Year', seconds: 365 * 24 * 60 * 60 },
      { label: 'Month', seconds: 30 * 24 * 60 * 60 },
      { label: 'Week', seconds: 7 * 24 * 60 * 60 },
      { label: 'Day', seconds: 24 * 60 * 60 },
      { label: 'Hour', seconds: 60 * 60 },
      { label: 'Minute', seconds: 60 },
      { label: 'Second', seconds: 1 }
    ];
    const unit = units.find((candidate) => seconds >= candidate.seconds && seconds % candidate.seconds === 0) ?? units[units.length - 1];
    const count = Math.max(1, Math.round(seconds / unit.seconds));
    return count === 1 ? `Every ${unit.label}` : `Every ${count} ${unit.label}s`;
  }

  function queueJobAttemptLabel(job: QueueJobSummary) {
    if (job.state === 'active') return 'Running now';
    if (job.state === 'scheduled') return formatRecurringSchedule(job.everySeconds) ?? job.data.task ?? 'Scheduled recurrence';
    if (job.state === 'delayed' && job.attemptsMade === 0) return 'Scheduled; not run yet';
    if (job.attemptsMade) return `${job.attemptsMade} attempt${job.attemptsMade === 1 ? '' : 's'}`;
    return 'No attempts yet';
  }

  function renderQueueOrchestrationPanel() {
    const snapshot = systemQueueStatus;
    const totals = snapshot?.queues.reduce((sum, queue) => ({ waiting: sum.waiting + queue.waiting, active: sum.active + queue.active, delayed: sum.delayed + queue.delayed, failed: sum.failed + queue.failed, completed: sum.completed + queue.completed }), { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 }) ?? { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };
    const tone = queueHealthTone(snapshot);
    return <article className={`panel settings-panel queue-orchestration-panel ${tone}`}>
      {isSystemVersionRefreshing && !snapshot && <LoadingOverlay label="Loading queue status…" />}
      <div className="panel-heading queue-panel-heading"><Activity /><div><p className="eyebrow small">System Operations</p><h3>BullMQ / Redis Orchestration</h3><small className="dashboard-refresh-stamp">BullMQ/Redis orchestration, scheduled work, retained history, and queue actions live here.</small></div><div className="queue-heading-actions"><Button className="compact-button" type="button" onClick={() => void loadQueueStatus(token, 'manual')} disabled={isSystemVersionRefreshing}><RotateCw className={isSystemVersionRefreshing ? 'spin-icon' : ''} /> Refresh</Button></div></div>
      <section className={`version-update-summary queue-summary ${tone}`}>
        <div><span>Mode</span><strong>{snapshot?.mode === 'bullmq' ? 'BullMQ' : snapshot ? 'Disabled' : 'Checking'}</strong><small>{snapshot?.enabled ? 'Durable queue mode enabled' : snapshot ? 'In-process poller active' : 'Loading runtime state'}</small></div>
        <div><span>Redis</span><strong>{snapshot?.redis.connected ? 'Connected' : snapshot?.redis.configured ? 'Configured' : 'Not configured'}</strong><small>{snapshot?.redis.host ? `${snapshot.redis.host}:${snapshot.redis.port}` : snapshot ? 'Set REDIS_HOST to enable' : 'Checking Redis'}</small></div>
        <div><span>Live Backlog</span><strong>{formatNumber(totals.active)} running / {formatNumber(totals.waiting)} ready</strong><small>{formatNumber(totals.delayed)} scheduled for future runs</small></div>
        <div><span>Retained History</span><strong>{formatNumber(totals.completed)} completed</strong><small>{formatNumber(totals.failed)} failed retained</small></div>
      </section>
      {snapshot?.redis.error && <p className="panel-copy version-update-message warning">Redis/BullMQ status is unavailable: {snapshot.redis.error}</p>}
      {!snapshot?.enabled && <p className="panel-copy">BullMQ is installed but disabled until `BULLMQ_ENABLED=true` and Redis settings are configured. The existing background poller continues to run for MVP safety.</p>}
      {snapshot && <section className="queue-compact-table" aria-label="Queue counts"><div className="queue-table-head"><span>Queue</span><span>State</span><span>Ready</span><span>Running</span><span>Scheduled</span><span>Failed Retained</span><span>Completed Retained</span></div>{snapshot.queues.map((queue) => <article className="queue-table-row" key={queue.name}><div><strong>{queue.name}</strong><small>{queue.description}</small></div><span className={`queue-state-label ${queue.active > 0 ? 'enabled' : queue.waiting > 0 ? 'enabled' : queue.delayed > 0 ? 'scheduled' : queue.failed > 0 ? 'paused' : 'unknown'}`}>{queue.active > 0 ? 'active' : queue.waiting > 0 ? 'ready' : queue.delayed > 0 ? 'scheduled' : queue.failed > 0 ? 'history' : 'idle'}</span><span>{formatNumber(queue.waiting)}</span><span>{formatNumber(queue.active)}</span><span>{formatNumber(queue.delayed)}</span><span>{formatNumber(queue.failed)}</span><span>{formatNumber(queue.completed)}</span></article>)}</section>}
      {queueJobRows.length ? <section className="queue-latest-jobs queue-latest-managed-grid" aria-label="Latest queue jobs"><ManagedGrid gridKey="system-queue-jobs-sequence" token={token!} rows={filteredQueueJobRows} columns={queueJobColumnDefs} loading={isSystemVersionRefreshing && !systemQueueJobs} loadingLabel="Loading latest queue jobs…" actionCell={QueueJobActionCell} actionWidth={canManageJobs ? 150 : 70} toolbar={<div className="logs-toolbar queue-jobs-toolbar"><div className="logs-toolbar-left"><strong>Active / Scheduled Jobs</strong><span>{formatNumber(filteredQueueJobRows.length)} of {formatNumber(queueJobRows.length)} jobs</span></div><div className="logs-filter-bar grid-toolbar-filters"><LogMultiSelectFilter label="Queue" allLabel="All queues" options={queueJobQueueOptions} selected={queueJobQueueFilter} onChange={setQueueJobQueueFilter} /><LogMultiSelectFilter label="State" allLabel="All states" options={queueJobStateOptions} selected={queueJobStateFilter} onChange={setQueueJobStateFilter} /><LogMultiSelectFilter label="Job" allLabel="All jobs" options={queueJobTypeOptions} selected={queueJobTypeFilter} onChange={setQueueJobTypeFilter} /></div></div>} /></section> : snapshot?.mode === 'bullmq' && <p className="panel-copy small-copy">No recent queue jobs returned from the sanitized CMS job view yet.</p>}
    </article>;
  }

  function renderSettingsGeneral() {
    const retentionDays = logRetention?.days ?? 90;
    const sslWarningDays = sslCertificateWarning?.daysBeforeExpiration ?? 30;
    const licenseWarningDays = licenseExpirationWarning?.daysBeforeExpiration ?? 30;
    return <div className="settings-basic-stack settings-group-stack">
      {canManageSettings && <section className="settings-card-group" aria-labelledby="general-settings-group-title"><div className="settings-group-header"><h3 id="general-settings-group-title">General Settings</h3></div><div className="settings-group-grid two-up">
        <article className="panel settings-panel compact-settings-card"><div className="panel-heading"><Settings /><div><h3>Labels</h3></div></div><p className="panel-copy">Customize display labels without changing the data model.</p><form className="settings-form" onSubmit={handleSaveLabels}><label>Tenant<input name="tenant" defaultValue={tenantLabel} placeholder="Tenant" required /></label><button type="submit">Save Labels</button></form></article>
        <article className="panel settings-panel compact-settings-card"><div className="panel-heading"><Settings /><div><h3>Log Retention</h3></div></div><p className="panel-copy">Keep CMS activity and instance-check history for this many days.</p><form className="settings-form compact-settings-form" onSubmit={handleSaveLogRetention}><label className="days-inline-field"><input name="days" type="number" min={1} max={3650} defaultValue={retentionDays} required /><small>day(s)</small></label><button type="submit">Save Retention</button></form></article>
      </div></section>}

      {canManageSettings && <section className="settings-card-group" aria-labelledby="monitoring-settings-group-title"><div className="settings-group-header"><h3 id="monitoring-settings-group-title">Monitoring</h3></div><div className="settings-group-grid two-up">
        <article className="panel settings-panel compact-settings-card"><div className="panel-heading"><Settings /><div><h3>SSL Warning</h3></div></div><p className="panel-copy">Show otherwise valid HTTPS certificates as Expiring Soon before they expire.</p><form className="settings-form compact-settings-form" onSubmit={handleSaveSslCertificateWarning}><label className="days-inline-field"><input name="daysBeforeExpiration" type="number" min={0} max={3650} defaultValue={sslWarningDays} required /><small>day(s)</small></label><button type="submit">Save SSL Warning</button></form></article>
        <article className="panel settings-panel compact-settings-card"><div className="panel-heading"><Settings /><div><h3>License Warning</h3></div></div><p className="panel-copy">Show valid OxyGen licenses as Expiring Soon before they expire.</p><form className="settings-form compact-settings-form" onSubmit={handleSaveLicenseExpirationWarning}><label className="days-inline-field"><input name="daysBeforeExpiration" type="number" min={0} max={3650} defaultValue={licenseWarningDays} required /><small>day(s)</small></label><button type="submit">Save License Warning</button></form></article>
      </div></section>}

      {canManageSettings && queueSchedules.jobs.length > 0 && <section className="settings-card-group" aria-labelledby="queue-settings-group-title"><div className="settings-group-header"><h3 id="queue-settings-group-title">Queue</h3></div><div className="settings-group-grid queue-settings-grid">
        {queueSchedules.jobs.map((job) => { const enabled = queueScheduleEnabledDraft[job.key] ?? job.enabled; return <article className={`panel settings-panel compact-settings-card queue-schedule-card${enabled ? '' : ' disabled'}`} key={job.key}><div className="panel-heading queue-schedule-heading"><Settings /><div><h3>{job.label}</h3></div><label className="switch-field queue-switch-field"><input name="enabled" type="checkbox" checked={enabled} onChange={(event) => void handleToggleQueueSchedule(job, event.target.checked)} /><em>{enabled ? 'Enabled' : 'Disabled'}</em><span className="switch-track" aria-hidden="true"><span /></span></label></div><p className="panel-copy queue-job-meta">{job.queue} · {job.name}</p><p className="panel-copy queue-job-description">{queueScheduleDescription(job)}</p><form className="settings-form queue-schedule-settings compact-settings-form" onSubmit={(event) => void handleSaveQueueSchedule(job, event)}><input name="enabled" type="hidden" value={enabled ? 'on' : 'off'} /><label className="days-inline-field queue-days-field"><span>Every</span><input name="everyDays" type="number" min={1} max={30} step={1} defaultValue={queueScheduleDays(job)} disabled={!enabled} /><small>day(s)</small></label><button type="submit" disabled={!enabled}>Save Schedule</button></form></article>; })}
      </div></section>}
      {!canManageSettings && <article className="panel settings-panel compact-settings-card"><p className="panel-copy">No application settings are available for your current permissions.</p></article>}
    </div>;
  }


  function renderSettingsQueue() {
    return <div className="settings-operations-stack">
      {isSystemVersionRefreshing && !systemQueueStatus && <LoadingOverlay label="Loading queue status…" />}
      {canViewJobs ? renderQueueOrchestrationPanel() : <article className="panel settings-panel"><p className="panel-copy">Queue resources are not available for your current permissions.</p></article>}
    </div>;
  }

  function renderSettingsUpdate() {
    return <div className="settings-operations-stack">
      {isSystemVersionRefreshing && !systemVersion && <LoadingOverlay label="Loading update readiness…" />}
      {canViewVersion ? renderVersionUpdatePanel() : <article className="panel settings-panel"><p className="panel-copy">Update readiness is not available for your current permissions.</p></article>}
    </div>;
  }

  function renderSettingsLogs() {
    return <ManagedGrid
      gridKey="application-logs"
      token={token!}
      loading={isLogsRefreshing}
      loadingLabel="Loading Logs…"
      rows={appLogRows}
      columns={appLogColumnDefs}
      toolbar={<div className="logs-toolbar">
        <div className="logs-toolbar-left">{logsBackTarget && <Button className="compact-button logs-back-button" type="button" fillMode="flat" onClick={() => { const target = logsBackTarget; setLogsBackTarget(null); setLogEntityGuidFilter(''); setRoute(target.section, target.entityId); setActiveSection(target.section); }}><ChevronLeft /> Back to {logsBackTarget.label}</Button>}</div>
        <div className="logs-filter-bar grid-toolbar-filters">
        <LogMultiSelectFilter label="Type" allLabel="All types" options={logTypes} selected={logTypeFilter} onChange={setLogTypeFilter} />
        <LogMultiSelectFilter label="Severity" allLabel="All severities" options={logSeverities} selected={logSeverityFilter} onChange={setLogSeverityFilter} />
        {logEntityGuidFilter && <Button className="compact-button" type="button" fillMode="flat" onClick={() => { setLogEntityGuidFilter(''); setLogsBackTarget(null); setRoute('settings-logs'); }}>Clear Entity Filter</Button>}
        <Button className="compact-button" type="button" onClick={() => setIsLogRefreshPaused((paused) => !paused)} themeColor={isLogRefreshPaused ? 'warning' : undefined}>{isLogRefreshPaused ? <Play /> : <Pause />} {isLogRefreshPaused ? 'Resume Refresh' : 'Pause Refresh'}</Button>
        <Button className="compact-button" type="button" onClick={() => void loadAppLogs(token)} disabled={isLogsRefreshing}><RotateCw className={isLogsRefreshing ? 'spin-icon' : ''} /> Refresh</Button>
        {canMaintainLogs && <Button className="compact-button btn-danger-outline" type="button" onClick={() => void handleClearLogs()} disabled={isClearingLogs}><Trash2 /> {isClearingLogs ? 'Clearing...' : 'Clear Logs'}</Button>}
        </div>
      </div>}
    />;
  }

  function renderIssueCatalog() {
    const snapshot = issueCatalog;
    if (!snapshot) return <article className="panel"><p className="panel-copy">Loading issue type catalog…</p></article>;
    if (snapshot.error) return <article className="panel database-performance-alert"><p className="panel-copy">{snapshot.error}</p><Button className="compact-button" type="button" onClick={() => void loadIssueCatalog(token, 'manual')}><RotateCw /> Retry</Button></article>;
    const affectedTotal = snapshot.issueTypes.reduce((total, issueType) => total + issueType.affectedCount, 0);
    return <ManagedGrid
      gridKey="issue-types"
      loading={isIssueCatalogRefreshing}
      loadingLabel="Loading Issue Types…"
      token={token!}
      rows={visibleIssueCatalogRows}
      columns={issueCatalogColumnDefs}
      actionCell={IssueCatalogActionCell}
      actionWidth={120}
      toolbar={<div className="logs-toolbar issue-types-toolbar">
        <div className="logs-toolbar-left issue-types-toolbar-summary"><span>{formatNumber(snapshot.categories.length)} categories</span><span>{formatNumber(snapshot.severities.length)} severities</span><span>{formatNumber(snapshot.issueTypes.length)} issue types</span><span>{formatNumber(affectedTotal)} matches</span><span>Updated {formatDateTime(snapshot.generatedAt)}</span></div>
        <div className="logs-filter-bar grid-toolbar-filters">
          <LogMultiSelectFilter label="Category" allLabel="All categories" options={issueCategoryOptions} selected={issueCategoryFilter} onChange={setIssueCategoryFilter} />
          <LogMultiSelectFilter label="Severity" allLabel="All severities" options={issueSeverityOptions} selected={issueSeverityFilter} onChange={setIssueSeverityFilter} />
          <LogMultiSelectFilter label="Issue Type" allLabel="All issue types" options={issueTypeOptions} selected={issueTypeFilter} onChange={setIssueTypeFilter} />
          {(issueCategoryFilter.length > 0 || issueSeverityFilter.length > 0 || issueTypeFilter.length > 0) && <Button className="compact-button" type="button" fillMode="flat" onClick={() => { setIssueCategoryFilter([]); setIssueSeverityFilter([]); setIssueTypeFilter([]); }}>Clear Filters</Button>}
          <Button className="compact-button" type="button" onClick={() => void loadIssueCatalog(token, 'manual')} disabled={isIssueCatalogRefreshing}><RotateCw className={isIssueCatalogRefreshing ? 'spin-icon' : ''} /> Refresh</Button>
        </div>
      </div>}
    />;
  }

  function renderIssueCatalogDialog() {
    if (!selectedIssueType) return null;
    return <Dialog className="cms-dialog issue-catalog-dialog" title={`${selectedIssueType.label} (${selectedIssueType.code})`} onClose={() => setSelectedIssueType(null)} width={920}>
      <div className="issue-catalog-dialog-body">
        <dl className="detail-list database-detail-list"><dt>Category</dt><dd>{selectedIssueType.category.name}</dd><dt>Severity</dt><dd>{selectedIssueType.severity.name}</dd><dt>Match rule</dt><dd>{selectedIssueType.matchValue ? `${selectedIssueType.matchKind}: ${selectedIssueType.matchValue}` : selectedIssueType.matchKind}</dd><dt>Description</dt><dd>{selectedIssueType.description || 'No description provided.'}</dd></dl>
        <h3>Affected Instances ({formatNumber(selectedIssueType.affectedCount)})</h3>
        {selectedIssueType.affectedInstances.length === 0 ? <p className="panel-copy">No enabled, active instances currently match this condition.</p> : <div className="issue-affected-list">{selectedIssueType.affectedInstances.map((affected) => <button type="button" key={affected.id} className="issue-affected-row" onClick={() => openIssueAffectedInstance(affected)}><span><strong>{affected.name}</strong><small>{affected.tenantName || 'Global'} · {affected.status} · Last checked {formatDateTime(affected.lastCheckedAt)}</small><small>{affected.evidence}</small></span><ChevronRight /></button>)}</div>}
      </div>
      <DialogActionsBar><Button className="compact-button" type="button" fillMode="flat" onClick={() => setSelectedIssueType(null)}>Close</Button></DialogActionsBar>
    </Dialog>;
  }

  function renderDatabasePerformance() {
    const snapshot = databasePerformance;
    if (!snapshot) return <article className="panel database-performance-panel"><p className="panel-copy">Loading database performance metrics…</p></article>;
    const connectionTone = !snapshot.configured || !snapshot.connected ? 'issue' : 'ok';
    const connectionLabel = !snapshot.configured ? 'Setup needed' : snapshot.connected ? 'Online' : 'Issue';
    const allocatedBytes = snapshot.summary.totalSizeBytes + snapshot.summary.freeBytes;
    const bufferHealth = bufferPoolHealth(snapshot.server.bufferPoolReadHitPercent);
    const schemaLabel = snapshot.schema.current ? 'Current' : snapshot.schema.currentVersion ? 'Upgrade' : 'Unknown';
    const schemaTone = snapshot.schema.current ? 'ok' : snapshot.schema.upgradeAvailable ? 'warning' : 'neutral';
    const queryDigestLabel = snapshot.queryDigestStatus.state === 'available' ? `${snapshot.queryDigests.length} query digest${snapshot.queryDigests.length === 1 ? '' : 's'} available` : snapshot.queryDigestStatus.state === 'empty' ? 'Digest collection enabled; no rows yet' : 'Digest collection unavailable';
    const kpiCards: Array<{ panel: DatabaseDetailPanel; label: string; value: string; detail: string; subdetail?: string; tone: 'ok' | 'warning' | 'issue' | 'neutral' }> = [
      { panel: 'schema', label: 'Schema Version', value: schemaLabel, detail: `${snapshot.schema.currentVersion || 'Unknown'} → ${snapshot.schema.targetVersion}`, subdetail: snapshot.schema.current ? 'No upgrade needed' : 'Upgrade available', tone: schemaTone },
      { panel: 'status', label: 'Status', value: connectionLabel, detail: snapshot.connected ? `Connected to ${snapshot.database || 'CMS database'}` : snapshot.database || 'No database selected', tone: connectionTone },
      { panel: 'storage', label: 'Table Storage', value: formatBytes(snapshot.summary.totalSizeBytes), detail: `${formatBytes(snapshot.summary.dataSizeBytes)} data + ${formatBytes(snapshot.summary.indexSizeBytes)} indexes`, subdetail: `${formatBytes(allocatedBytes)} allocated incl. ${formatBytes(snapshot.summary.freeBytes)} reusable/free`, tone: snapshot.summary.totalSizeBytes > 1024 ** 3 ? 'warning' : 'neutral' },
      { panel: 'tables', label: 'Tables', value: formatNumber(snapshot.summary.tableCount), detail: `${formatNumber(snapshot.summary.estimatedRows)} estimated rows`, tone: 'neutral' },
      { panel: 'connections', label: 'Active Connections', value: formatNumber(snapshot.server.threadsConnected), detail: snapshot.server.maxConnections ? `${formatNumber(snapshot.server.maxConnections)} configured max` : 'Max unavailable', tone: snapshot.server.maxConnections && snapshot.server.threadsConnected && snapshot.server.threadsConnected / snapshot.server.maxConnections > 0.8 ? 'issue' : snapshot.server.maxConnections && snapshot.server.threadsConnected && snapshot.server.threadsConnected / snapshot.server.maxConnections > 0.6 ? 'warning' : 'ok' },
      { panel: 'queries', label: 'Slow Queries', value: formatNumber(snapshot.server.slowQueries), detail: `Queries over ${formatSeconds(snapshot.server.longQueryTimeSeconds)}`, subdetail: queryDigestLabel, tone: snapshot.server.slowQueries ? 'warning' : 'ok' },
      { panel: 'cache', label: 'Buffer Pool Hit', value: formatPercent(snapshot.server.bufferPoolReadHitPercent), detail: bufferHealth.label, subdetail: bufferHealth.detail, tone: bufferHealth.tone }
    ];
    const maintenanceActions: Array<{ action: DatabaseMaintenanceAction; label: string; detail: string; icon: ReactNode; tone?: string }> = [
      { action: 'run-retention', label: 'Run Retention', detail: `Delete activity rows older than the configured ${formatNumber(logRetention.days)} day retention window.`, icon: <RotateCw /> },
      { action: 'purge-logs', label: 'Purge Logs', detail: 'Truncate CMS application logs and instance check history activity rows.', icon: <Trash2 />, tone: 'danger' },
      { action: 'compress', label: 'Compress', detail: 'Planned maintenance job for table rebuild/compression after backup.', icon: <Archive /> },
      { action: 'defrag', label: 'Defrag', detail: 'Planned OPTIMIZE/defragment job for reclaiming fragmented table space.', icon: <Activity /> },
      { action: 'backup', label: 'Backup', detail: 'Planned export job with a downloadable backup artifact.', icon: <Download /> },
      { action: 'restore', label: 'Restore', detail: 'Planned guarded restore workflow with uploaded backup file.', icon: <Upload />, tone: 'danger' }
    ];
    const renderDetailPanel = () => {
      if (databaseDetailPanel === 'schema') return <section className="panel database-performance-panel"><div className="panel-heading"><ArchiveRestore /><div><p className="eyebrow small">Schema management</p><h3>Database Schema</h3></div></div><dl className="detail-list database-detail-list"><dt>Current version</dt><dd>{snapshot.schema.currentVersion || 'Unknown'}</dd><dt>Target version</dt><dd>{snapshot.schema.targetVersion}</dd><dt>Status</dt><dd>{snapshot.schema.current ? 'Current' : snapshot.schema.upgradeAvailable ? 'Upgrade available' : 'Unknown'}</dd></dl>{!snapshot.schema.current && <Button className="compact-button database-schema-upgrade-button" type="button" onClick={() => void handleApplySchema()}><ArchiveRestore /> Upgrade Schema</Button>}</section>;
      if (databaseDetailPanel === 'status') return <section className="panel database-performance-panel"><div className="panel-heading"><Database /><div><p className="eyebrow small">Connection details</p><h3>Database Status</h3></div></div><dl className="detail-list database-detail-list"><dt>Configured</dt><dd>{snapshot.configured ? 'Yes' : 'No'}</dd><dt>Connected</dt><dd>{snapshot.connected ? 'Yes' : 'No'}</dd><dt>Database</dt><dd>{snapshot.database || 'Unknown'}</dd><dt>Last refreshed</dt><dd>{formatDateTime(snapshot.generatedAt)}</dd><dt>Error</dt><dd>{snapshot.error || 'None'}</dd></dl></section>;
      if (databaseDetailPanel === 'storage') return <section className="panel database-performance-panel"><div className="panel-heading"><Database /><div><p className="eyebrow small">Storage allocation</p><h3>Table Storage</h3></div></div><dl className="detail-list database-detail-list"><dt>Actually used</dt><dd>{formatBytes(snapshot.summary.totalSizeBytes)}</dd><dt>Data</dt><dd>{formatBytes(snapshot.summary.dataSizeBytes)}</dd><dt>Indexes</dt><dd>{formatBytes(snapshot.summary.indexSizeBytes)}</dd><dt>Allocated including free</dt><dd>{formatBytes(allocatedBytes)}</dd><dt>Reusable / fragmented</dt><dd>{formatBytes(snapshot.summary.freeBytes)}</dd></dl><p className="panel-copy">Clearing rows reduces live log data, but InnoDB commonly keeps table pages allocated for reuse. Physical disk or Docker volume size may not shrink until a guarded Defrag/Optimize maintenance job rebuilds the table.</p></section>;
      if (databaseDetailPanel === 'connections') return <section className="panel database-performance-panel"><div className="panel-heading"><Server /><div><p className="eyebrow small">Server counters</p><h3>MySQL Runtime</h3></div></div><dl className="detail-list database-detail-list"><dt>Version</dt><dd>{formatNullable(snapshot.server.version)}</dd><dt>Uptime</dt><dd>{formatDurationLong(snapshot.server.uptimeSeconds)}</dd><dt>Active connections</dt><dd>{formatNumber(snapshot.server.threadsConnected)}</dd><dt>Configured max</dt><dd>{formatNumber(snapshot.server.maxConnections)}</dd><dt>Max used connections</dt><dd>{formatNumber(snapshot.server.maxUsedConnections)}</dd><dt>Questions</dt><dd>{formatNumber(snapshot.server.questions)}</dd><dt>Aborted connects</dt><dd>{formatNumber(snapshot.server.abortedConnects)}</dd></dl></section>;
      if (databaseDetailPanel === 'queries') return <section className="panel database-performance-panel"><div className="panel-heading"><Activity /><div><p className="eyebrow small">Bad query indicators</p><h3>Slow Query Digests</h3></div></div><p className="panel-copy">Slow Queries is MySQL's lifetime counter for queries over {formatSeconds(snapshot.server.longQueryTimeSeconds)} since startup. Query digests are normalized statement patterns from performance_schema, ordered by total time.</p>{snapshot.queryDigests.length === 0 ? <p className="panel-copy">{snapshot.queryDigestStatus.reason || (snapshot.queryDigestStatus.state === 'empty' ? 'Digest collection is enabled, but no statement digest rows are currently available for this database.' : 'performance_schema digest collection is unavailable.')}</p> : <div className="database-query-list">{snapshot.queryDigests.map((query) => <article className="database-query-row" key={`${query.digestText}-${query.lastSeen || query.count}`}><strong>{query.digestText}</strong><dl><dt>Count</dt><dd>{formatNumber(query.count)}</dd><dt>Total time</dt><dd>{query.totalTimeSeconds.toFixed(3)}s</dd><dt>Avg time</dt><dd>{query.avgTimeSeconds.toFixed(6)}s</dd><dt>Rows examined</dt><dd>{formatNumber(query.rowsExamined)}</dd><dt>Rows sent</dt><dd>{formatNumber(query.rowsSent)}</dd><dt>Errors / warnings</dt><dd>{formatNumber(query.errors)} / {formatNumber(query.warnings)}</dd></dl><small>First seen {formatDateTime(query.firstSeen)} · Last seen {formatDateTime(query.lastSeen)}</small></article>)}</div>}</section>;
      if (databaseDetailPanel === 'cache') return <section className="panel database-performance-panel"><div className="panel-heading"><Activity /><div><p className="eyebrow small">InnoDB cache</p><h3>Buffer Pool Health</h3></div></div><dl className="detail-list database-detail-list"><dt>Hit rate</dt><dd>{formatPercent(snapshot.server.bufferPoolReadHitPercent)}</dd><dt>Health</dt><dd>{bufferHealth.label}</dd><dt>Disk-read estimate</dt><dd>{bufferHealth.detail}</dd></dl><p className="panel-copy">Higher is better. 99%+ is excellent, 98–99% is good, 95–98% is watch, and below 95% is poor.</p></section>;
      return <section className="panel database-performance-panel"><div className="panel-heading"><Database /><div><p className="eyebrow small">Largest tables</p><h3>Storage Hotspots</h3></div></div>{snapshot.topTables.length === 0 ? <p className="panel-copy">No table statistics are available yet.</p> : <div className="database-table-list">{snapshot.topTables.map((table) => <article className="database-table-row" key={table.tableName}><div><strong>{table.tableName}</strong><small>{table.engine || 'Unknown engine'} · {formatNumber(table.rowEstimate)} estimated rows</small></div><span>{formatBytes(table.totalSizeBytes)}</span><small>{formatBytes(table.dataSizeBytes)} data · {formatBytes(table.indexSizeBytes)} index · {formatBytes(table.freeBytes)} reusable</small></article>)}</div>}</section>;
    };
    return <div className="settings-database-scroll"><div className="settings-database-stack">
      <section className="tenant-dashboard-hero compact database-performance-hero">
        <div><p className="eyebrow small">Database</p><h3>{snapshot.database || 'CMS Database'}</h3><small className="dashboard-refresh-stamp">Schema {snapshot.schema.currentVersion || 'unknown'} / target {snapshot.schema.targetVersion} · Last refreshed: {formatDateTime(snapshot.generatedAt)}</small></div>
        <div className="database-hero-actions">
          {!snapshot.schema.current && <Button className="compact-button dashboard-refresh-button" type="button" onClick={() => void handleApplySchema()}><ArchiveRestore /> Upgrade Schema</Button>}
          <Button className="compact-button dashboard-refresh-button" type="button" onClick={() => void loadDatabasePerformance(token, 'manual')} disabled={isDatabasePerformanceRefreshing}><RotateCw className={isDatabasePerformanceRefreshing ? 'spin-icon' : ''} /> Refresh</Button>
        </div>
      </section>
      {snapshot.error && <article className="panel database-performance-alert"><p className="panel-copy">{snapshot.error}</p></article>}
      <section className="tenant-issue-grid database-performance-kpis" aria-label="Database performance KPIs">
        {kpiCards.map((card) => <button className={`tenant-issue-card database-kpi-button ${card.tone} ${databaseDetailPanel === card.panel ? 'selected' : ''}`} key={card.label} type="button" onClick={() => { setDatabaseDetailPanel(card.panel); if (isMobileViewport) setDatabaseDetailPanel(card.panel); else setDatabaseDetailModal(card.panel); }} aria-pressed={databaseDetailPanel === card.panel}><span>{card.label}</span><strong className={card.panel === 'status' ? 'database-status-value' : undefined}>{card.value}</strong><small>{card.detail}</small>{card.subdetail && <small>{card.subdetail}</small>}</button>)}
      </section>
      {isMobileViewport && renderDetailPanel()}
      {!isMobileViewport && databaseDetailModal && <Dialog className="cms-dialog database-detail-dialog" title={`${kpiCards.find((card) => card.panel === databaseDetailModal)?.label || 'Database'} Details`} onClose={() => setDatabaseDetailModal(null)} width={920}>{renderDetailPanel()}<DialogActionsBar><Button className="compact-button" type="button" fillMode="flat" onClick={() => setDatabaseDetailModal(null)}>Close</Button></DialogActionsBar></Dialog>}
      <section className="panel database-performance-panel"><div className="panel-heading"><Settings /><div><p className="eyebrow small">Maintenance actions</p><h3>Database Maintenance</h3></div></div><div className="database-maintenance-grid">{maintenanceActions.map((action) => <button className={`database-maintenance-action ${action.tone || ''}`} type="button" key={action.action} onClick={() => void handleDatabaseMaintenance(action.action)} disabled={databaseMaintenanceAction === action.action || isClearingLogs}><span className="database-maintenance-label">{action.icon}<strong>{action.label}</strong></span><small>{action.detail}</small></button>)}</div></section>
      {canViewJobs && <section className="panel database-performance-panel database-maintenance-jobs-panel"><div className="panel-heading"><Activity /><div><p className="eyebrow small">Queued maintenance</p><h3>Database Jobs</h3></div><Button className="compact-button" type="button" onClick={() => void loadQueueJobs(token)} disabled={isSystemVersionRefreshing}><RotateCw /> Refresh Jobs</Button></div>{databaseMaintenanceJobRows.length ? <div className="queue-latest-managed-grid database-maintenance-jobs-grid"><ManagedGrid gridKey="database-maintenance-jobs" token={token!} rows={databaseMaintenanceJobRows} columns={queueJobColumnDefs.filter((column) => !['tenant', 'instance', 'instanceGuid', 'queue'].includes(column.key))} loading={isSystemVersionRefreshing && !systemQueueJobs} loadingLabel="Loading database jobs…" actionCell={QueueJobActionCell} actionWidth={canManageJobs ? 150 : 70} toolbar={<div className="queue-jobs-toolbar"><strong>Database maintenance queue</strong><span>{formatNumber(databaseMaintenanceJobRows.length)} active, scheduled, or retained database job{databaseMaintenanceJobRows.length === 1 ? '' : 's'}</span></div>} /></div> : <p className="panel-copy small-copy">No database maintenance jobs are active, scheduled, or retained yet. Analyze Tables and Optimize Tables can be queued from Operations Run Now controls.</p>}</section>}
    </div></div>;
  }

  const sectionMeta = (() => {
    switch (activeSection) {
      case 'dashboard': return { eyebrow: dashboard?.scope === 'tenant' ? tenantLabel : 'Dashboard', heading: dashboardTitle || `Welcome, ${profile?.user.displayName || ''}` };
      case 'organizations': return { eyebrow: 'Organizations', heading: tenantLabelPlural };
      case 'instances': return { eyebrow: 'Organizations', heading: showArchivedInstances ? 'Archived Instances' : 'Instances' };
      case 'instance-dashboard': return { eyebrow: 'Instance Dashboard', heading: selectedInstance?.name || 'Instance Detail' };
      case 'users': return { eyebrow: 'Security', heading: 'Users' };
      case 'user-groups': return { eyebrow: 'Security', heading: 'User Groups' };
      case 'roles': return { eyebrow: 'Security', heading: 'Roles' };
      case 'settings-general': return { eyebrow: 'Settings', heading: 'General Settings' };
      case 'settings-queue': return { eyebrow: 'Settings', heading: 'Queue' };
      case 'settings-update': return { eyebrow: 'Settings', heading: 'Updates' };
      case 'settings-logs': return { eyebrow: 'Settings', heading: 'Logs' };
      case 'settings-database': return { eyebrow: 'Settings', heading: 'Database' };
      case 'settings-issues': return { eyebrow: 'Settings', heading: 'Issue Types' };
      case 'settings-advanced': return { eyebrow: 'Settings', heading: 'Advanced' };
    }
  })();

  const gridSection = activeSection === 'users' || activeSection === 'user-groups' || activeSection === 'roles' || activeSection === 'organizations' || activeSection === 'instances' || activeSection === 'settings-logs' || activeSection === 'settings-issues';
  const settingsSection = activeSection.startsWith('settings-');

  function TenantSelect({ disabled = false, allowGlobal = canSelectGlobalTenantScope }: { disabled?: boolean; allowGlobal?: boolean }) {
    const lockedToActorTenant = !canSelectAnyTenantScope;
    const options = lockedToActorTenant
      ? actorTenantId
        ? tenants.filter((tenant) => tenant.id === actorTenantId)
        : []
      : tenants;
    const effectiveValue = lockedToActorTenant ? actorTenantId || '' : selectedTenantId;
    const isDisabled = disabled || lockedToActorTenant;
    return <label>{tenantLabel}<select value={effectiveValue} disabled={isDisabled} onChange={(e) => setSelectedTenantId(e.target.value)}>{allowGlobal && !lockedToActorTenant && <option value="">Global</option>}{lockedToActorTenant && actorTenantId && options.length === 0 && <option value={actorTenantId}>{actorTenantName}</option>}{options.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenantOptionLabel(tenant)}</option>)}</select>{lockedToActorTenant ? <small>{tenantLabel} is fixed to your signed-in {tenantLabelLower}: {actorTenantName}.</small> : disabled && <small>{tenantLabel} assignment is locked after creation.</small>}</label>;
  }

  function handleInstanceProtocolChange(protocol: 'http' | 'https') {
    setInstanceProtocol(protocol);
    setInstancePort(protocol === 'http' ? '80' : '443');
  }

  const modalTitle = modal ? `${modal.data ? 'Edit' : 'Create'} ${modal.kind === 'user' ? 'User' : modal.kind === 'group' ? 'Group' : modal.kind === 'role' ? 'Role' : modal.kind === 'instance' ? 'Instance' : tenantLabel}` : '';
  function FormActions({ children }: { children: ReactNode }) {
    return isMobileViewport ? <div className="mobile-editor-actions">{children}</div> : <DialogActionsBar>{children}</DialogActionsBar>;
  }


  function RolePermissionChecklist() {
    const groups = Array.from(new Set(PERMISSION_CATALOG.map((permission) => permission.group)));
    const query = permissionFilter.trim().toLowerCase();
    const visibleGroups = groups.map((group) => {
      const groupPermissions = PERMISSION_CATALOG.filter((permission) => permission.group === group);
      const groupMatches = !query || group.toLowerCase().includes(query);
      const permissions = groupPermissions.filter((permission) => groupMatches || [permission.label, permission.description, permission.key].some((value) => value.toLowerCase().includes(query)));
      return { group, permissions };
    }).filter(({ permissions }) => permissions.length > 0);
    return <fieldset className="form-section permission-builder"><legend>Permissions</legend>
      <div className="permission-toolbar"><div><strong>{selectedPermissionKeys.length} of {PERMISSION_CATALOG.length} permissions</strong><span>Search, apply a preset, or use a group checkbox to select all permissions in that type.</span></div><div className="permission-preset-row"><label>Apply preset<select value={permissionPresetDraft} onChange={(event) => setPermissionPresetDraft(event.target.value)}><option value="">Select preset…</option>{Object.keys(DEFAULT_ROLE_PERMISSIONS).map((roleName) => <option key={roleName} value={roleName}>{roleName}</option>)}<option value="__clear">Clear all permissions</option></select></label><button type="button" disabled={!permissionPresetDraft} onClick={applyRolePresetDraft}>Apply</button></div></div>
      <label className="permission-search">Find permissions<input type="search" value={permissionFilter} onChange={(event) => setPermissionFilter(event.target.value)} placeholder="Search by type, name, description, or code" /></label>
      <div className="permission-grid" role="table" aria-label="Role permissions">
        <div className="permission-grid-head" role="row"><span>Checkbox</span><span>Name</span><span>Description</span><span>Code</span></div>
        {visibleGroups.length === 0 ? <span className="empty-state permission-grid-empty">No permissions match this search.</span> : visibleGroups.map(({ group, permissions }) => {
          const groupKeys = PERMISSION_CATALOG.filter((permission) => permission.group === group).map((permission) => permission.key);
          const selectedCount = groupKeys.filter((key) => selectedPermissionKeys.includes(key)).length;
          const allSelected = selectedCount === groupKeys.length;
          const partiallySelected = selectedCount > 0 && !allSelected;
          return <section key={group} className="permission-grid-group" role="rowgroup" aria-label={`${group} permissions`}>
            <label className="permission-grid-group-row"><input type="checkbox" checked={allSelected} ref={(input) => { if (input) input.indeterminate = partiallySelected; }} onChange={(event) => setPermissionGroup(group, event.target.checked)} aria-label={`Select all ${group} permissions`} /><span><strong>{group}</strong><small>{selectedCount} / {groupKeys.length} enabled</small></span></label>
            {permissions.map((permission) => <label key={permission.key} className="permission-grid-row" role="row"><span className="permission-grid-check"><input type="checkbox" checked={selectedPermissionKeys.includes(permission.key)} onChange={(event) => toggleSelectedPermission(permission.key, event.target.checked)} aria-label={`Toggle ${permission.label}`} /></span><span className="permission-grid-name">{permission.label}</span><span className="permission-grid-description">{permission.description}</span><code>{permission.key}</code></label>)}
          </section>;
        })}
      </div>
    </fieldset>;
  }



  function renderModalForm() {
    if (!modal) return null;
    return <>
        {modal.kind === 'user' && <form className="modal-form" onSubmit={handleSaveUser}><label>Email<input name="email" type="email" placeholder="operator@example.com" defaultValue={(modal.data as UserProfile)?.user.email || ''} required /></label><label>Display name<input name="displayName" placeholder="Operator" defaultValue={(modal.data as UserProfile)?.user.displayName || ''} required /></label><label>Password<input name="password" type="password" minLength={12} placeholder={modal.data ? 'Leave blank to keep current password' : '12+ characters'} required={!modal.data} /></label><TenantSelect disabled={Boolean(modal.data)} /><label>Role<select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>{availableRoles.map((r) => <option key={r.id} value={r.name}>{r.name}{r.tenantId ? ` (${tenantName(r.tenantId)})` : ''}</option>)}</select></label><label>Group<select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}><option value="">None</option>{groups.map((g) => <option key={g.id} value={g.id}>{groupOptionLabel(g)}{g.tenantId ? ` (${tenantName(g.tenantId)})` : ''}</option>)}</select></label><label>Instance access<select name="instanceAccessMode" value={instanceAccessModeDraft} onChange={(event) => setInstanceAccessModeDraft(event.target.value as UserInstanceAccessMode)}><option value="inherit">Inherited from assigned groups</option><option value="none">No instances</option><option value="all">All instances</option><option value="specific">Specific instances</option></select></label><InstanceAccessSelector /><FormActions><Button className="compact-button btn-dialog-cancel" type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button className="compact-button btn-dialog-primary" type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'group' && <form className="modal-form" onSubmit={handleSaveGroup}><label>Name<input name="name" placeholder="Customer Group A" defaultValue={(modal.data as Group)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Optional" defaultValue={(modal.data as Group)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><label>Instance access<select name="instanceAccessMode" value={instanceAccessModeDraft} onChange={(event) => setInstanceAccessModeDraft(event.target.value as GroupInstanceAccessMode)}><option value="none">No instances</option><option value="all">All instances</option><option value="specific">Specific instances</option></select></label><InstanceAccessSelector /><FormActions><Button className="compact-button btn-dialog-cancel" type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button className="compact-button btn-dialog-primary" type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'role' && <form className="modal-form" onSubmit={handleSaveRole}><label>Name<input name="name" placeholder="WorkflowReviewer" defaultValue={(modal.data as Role)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Optional" defaultValue={(modal.data as Role)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><RolePermissionChecklist /><FormActions><Button className="compact-button btn-dialog-cancel" type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button className="compact-button btn-dialog-primary" type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'tenant' && <form className="modal-form" onSubmit={handleSaveTenant}><label>Name<input name="name" placeholder={`${tenantLabel} A`} defaultValue={(modal.data as Tenant)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Optional" defaultValue={(modal.data as Tenant)?.description || ''} /></label><FormActions><Button className="compact-button btn-dialog-cancel" type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button className="compact-button btn-dialog-primary" type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
        {modal.kind === 'instance' && <form className="modal-form instance-form" onSubmit={handleSaveInstance}><TenantSelect disabled={Boolean(modal.data)} /><label>Name<input name="name" placeholder="Instance display name, e.g. Development" defaultValue={(modal.data as OxyGenInstance)?.name || ''} required /></label><label>Description<textarea name="description" rows={3} placeholder="Short optional description" defaultValue={(modal.data as OxyGenInstance)?.description || ''} /></label><fieldset className="form-section"><legend>Connection</legend><div className="form-row three"><label>Protocol<select name="protocol" value={instanceProtocol} onChange={(e) => handleInstanceProtocolChange(e.target.value as 'http' | 'https')}><option value="https">HTTPS</option><option value="http">HTTP</option></select></label><label>Host / URL<input name="host" placeholder="customer.example.com" defaultValue={(modal.data as OxyGenInstance)?.host || ''} required /></label><label>Port<input name="port" type="number" min={1} max={65535} value={instancePort} onChange={(e) => setInstancePort(e.target.value)} required /></label></div></fieldset><fieldset className="form-section"><legend>Authentication</legend><div className="form-row two"><label>Username<input name="username" placeholder="admin (default)" defaultValue={(modal.data as OxyGenInstance)?.username || ''} /></label><label>Password<input name="password" type="password" placeholder={modal.data ? 'Leave blank to keep current password' : 'Remote OxyGen password'} required={!modal.data} /></label></div></fieldset><fieldset className="form-section"><legend>Monitoring</legend><label className="checkbox-label inline-checkbox"><input name="isEnabled" type="checkbox" checked={instancePollingEnabled} onChange={(e) => setInstancePollingEnabled(e.target.checked)} /> Enabled for polling</label><label className="checkbox-label inline-checkbox"><input name="checkLicense" type="checkbox" checked={instanceLicenseCheckEnabled} onChange={(e) => setInstanceLicenseCheckEnabled(e.target.checked)} /> Check OxyGen license/settings API</label><label className="checkbox-label inline-checkbox"><input name="archived" type="checkbox" defaultChecked={(modal.data as OxyGenInstance)?.archived || false} /> Archived / hidden from default instance list</label><label>Polling interval seconds<input name="pollingIntervalSeconds" type="number" min={30} defaultValue={(modal.data as OxyGenInstance)?.pollingIntervalSeconds || 300} required /></label></fieldset><FormActions><Button className="compact-button btn-dialog-cancel" type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="button" onClick={(event) => void testInstanceFormConnectivity(event.currentTarget.closest('form'))}><RotateCw /> Test Connection</Button><Button className="compact-button btn-dialog-primary" type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></FormActions></form>}
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

      {profile && (<div className={`admin-layout ${isDrawerExpanded ? 'drawer-expanded' : 'drawer-collapsed'} ${isMobileDrawerOpen ? 'mobile-drawer-open' : ''}`}><aside className={`admin-sidebar ${isDrawerExpanded ? 'expanded' : 'collapsed'} ${isMobileDrawerOpen ? 'mobile-open' : ''}`}><button className="mobile-drawer-close" type="button" onClick={() => setIsMobileDrawerOpen(false)} aria-label="Close navigation"><X /></button><button className="sidebar-toggle" type="button" onClick={() => setIsDrawerExpanded((v) => !v)} aria-label={isDrawerExpanded ? 'Collapse navigation' : 'Expand navigation'}>{isDrawerExpanded ? <ChevronLeft /> : <ChevronRight />}</button><div className="sidebar-user"><UserCircle /><div><span className="su-name">{profile.user.displayName}</span><span className="su-role">{displayRoleName(profile.roles[0])}</span></div></div><nav className="sidebar-nav"><button className={`nav-link${activeSection === 'dashboard' ? ' active' : ''}`} onClick={() => nav('dashboard')}><LayoutDashboard /><span>Dashboard</span></button>{(canViewTenants || canViewInstances) && <div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => handleSidebarParentClick('organizations')}><Server /><span>Organizations</span>{openAccordions.has('organizations') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('organizations') && (<div className="nav-accordion-children">{canViewTenants && <button className={`nav-link child${activeSection === 'organizations' ? ' active' : ''}`} onClick={() => nav('organizations')}><span>{tenantLabelPlural}</span></button>}{canViewInstances && <button className={`nav-link child${activeSection === 'instances' ? ' active' : ''}`} onClick={() => { nav('instances'); loadInstances(); }}><span>Instances</span></button>}</div>)}</div>}{canManageSecurity && <div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => handleSidebarParentClick('security')}><ShieldCheck /><span>Security</span>{openAccordions.has('security') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('security') && (<div className="nav-accordion-children">{canManageUsers && <button className={`nav-link child${activeSection === 'users' ? ' active' : ''}`} onClick={() => nav('users')}><span>Users</span></button>}{canManageGroups && <button className={`nav-link child${activeSection === 'user-groups' ? ' active' : ''}`} onClick={() => nav('user-groups')}><span>User Groups</span></button>}{canManageRoles && <button className={`nav-link child${activeSection === 'roles' ? ' active' : ''}`} onClick={() => nav('roles')}><span>Roles</span></button>}</div>)}</div>}{canUseSettings && <div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => handleSidebarParentClick('settings')}><Settings /><span>System</span>{openAccordions.has('settings') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('settings') && (<div className="nav-accordion-children">{canViewDatabase && <button className={`nav-link child${activeSection === 'settings-database' ? ' active' : ''}`} onClick={() => nav('settings-database')}><span>Database</span></button>}{canViewIssueTypes && <button className={`nav-link child${activeSection === 'settings-issues' ? ' active' : ''}`} onClick={() => nav('settings-issues')}><span>Issue Types</span></button>}{canViewLogs && <button className={`nav-link child${activeSection === 'settings-logs' ? ' active' : ''}`} onClick={() => nav('settings-logs')}><span>Logs</span></button>}{canViewJobs && <button className={`nav-link child${activeSection === 'settings-queue' ? ' active' : ''}`} onClick={() => nav('settings-queue')}><span>Queue</span></button>}{canManageSettings && <button className={`nav-link child${activeSection === 'settings-general' ? ' active' : ''}`} onClick={() => nav('settings-general')}><span>Settings</span></button>}{canViewVersion && <button className={`nav-link child${activeSection === 'settings-update' ? ' active' : ''}`} onClick={() => nav('settings-update')}><span>Updates</span></button>}</div>)}</div>}</nav><button className="sidebar-logout" onClick={handleLogout}><LogOut /><span>Sign out</span></button></aside>
        <section className={`admin-content ${gridSection ? 'grid-section' : ''} ${settingsSection ? 'settings-section' : ''}`}>{activeSection !== 'dashboard' && <div className="page-header"><p className="eyebrow small">{sectionMeta.eyebrow}</p><h2>{sectionMeta.heading}</h2></div>}
          {activeSection !== 'settings-general' && activeSection !== 'settings-update' && renderUpdateNotice()}
          {activeSection === 'dashboard' && renderDashboard()}
          {activeSection === 'organizations' && canViewTenants && <ManagedGrid gridKey="tenants" token={token!} rows={tenantRows} loading={isAdminDataRefreshing} loadingLabel="Loading Tenants…" columns={tenantColumnDefs} actionCell={TenantActionCell} mobileActions={(row) => <TenantActionMenu tenant={row.raw} mobile />} toolbar={canManageTenants ? <Button className="btn-create" onClick={openCreateTenantModal} type="button" themeColor="primary"><Plus /> Create “{tenantLabel}”</Button> : null} />}
          {activeSection === 'instances' && canViewInstances && <ManagedGrid gridKey="instances" token={token!} rows={visibleInstanceRows} loading={isAdminDataRefreshing || isDashboardRefreshing} loadingLabel="Loading Instances…" columns={labeledInstanceColumnDefs} actionCell={InstanceActionCell} actionWidth={58} mobileActions={mobileInstanceActions} toolbar={canImportExportInstances || canManageInstances ? renderInstanceToolbar() : null} />}
          {activeSection === 'instance-dashboard' && selectedInstance && <div className="instance-detail-dashboard"><div className="instance-dashboard-actions"><Button className="compact-button" type="button" fillMode="flat" onClick={closeInstanceDashboard}><ChevronLeft /> Back to Instances</Button>{canManageInstances && <Button className="compact-button" type="button" onClick={() => openEditInstanceModal(selectedInstance)}><Pencil /> Edit</Button>}{canManageInstances && <Button className="compact-button" type="button" onClick={() => testInstanceConnectivity(selectedInstance)}><RotateCw /> Run Health Check</Button>}{canManageInstances && <Button className="compact-button" type="button" onClick={() => void setInstanceArchived(selectedInstance, !selectedInstance.archived)}>{selectedInstance.archived ? <ArchiveRestore /> : <Archive />} {selectedInstance.archived ? 'Unarchive' : 'Archive'}</Button>}{canViewLogs && <Button className="compact-button" type="button" onClick={() => openInstanceLogs(selectedInstance)}><ClipboardList /> View Logs</Button>}<Button className="compact-button" type="button" onClick={() => window.open(launchUrlForInstance(selectedInstance), '_blank', 'noopener,noreferrer')}><ExternalLink /> Launch OxyGen</Button></div><div className="instance-health-strip"><button className={`instance-health-card clickable status-${selectedInstance.status}`} type="button" onClick={() => void openInstanceHealthModal('availability')}><span>Availability</span><strong>{availabilityLabel(selectedInstance)}</strong><small>{formatDateTime(selectedInstance.lastCheckedAt)}</small></button>{selectedInstance.protocol === 'https' && <button className="instance-health-card clickable status-unknown" type="button" onClick={() => void openInstanceHealthModal('ssl')}><span>SSL Certificate</span><strong>{sslCardLabel(selectedInstance)}</strong><small>{sslCardDetail(selectedInstance, connectivityDetails(healthDetails?.latestConnectivity).ssl)}</small></button>}{selectedInstance.checkLicense && <button className={`instance-health-card clickable status-${licenseCardStatusClass(selectedInstance, connectivityDetails(healthDetails?.latestConnectivity).license)}`} type="button" onClick={() => void openInstanceHealthModal('license')}><span>License</span><strong>{licenseCardLabel(selectedInstance)}</strong><small>{licenseCardDetail(selectedInstance, connectivityDetails(healthDetails?.latestConnectivity).license)}</small></button>}<button className={`instance-health-card clickable status-${selectedInstance.status}`} type="button" onClick={() => void openInstanceHealthModal('response')}><span>Response</span><strong>{selectedInstance.responseTimeMs === null ? '—' : `${selectedInstance.responseTimeMs} ms`}</strong><small>Polling every {selectedInstance.pollingIntervalSeconds}s</small></button></div><div className="instance-detail-grid"><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('endpoint')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'endpoint')}><div className="panel-heading"><Server /><div><p className="eyebrow small">Endpoint</p><h3>Connection Details</h3></div></div><dl className="detail-list"><dt>{tenantLabel}</dt><dd>{tenantName(selectedInstance.tenantId)}</dd><dt>Host</dt><dd>{selectedInstance.host}</dd><dt>Resolved IP</dt><dd>{resolvedIpLabel(connectivityDetails(healthDetails?.latestConnectivity))}</dd><dt>Port</dt><dd>{formatNullable(selectedInstance.port)}</dd><dt>Base URL</dt><dd>{selectedInstance.baseUrl}</dd><dt>API Base URL</dt><dd>{selectedInstance.apiBaseUrl}</dd><dt>Launch URL</dt><dd>{selectedInstance.launchUrl}</dd><dt>Username</dt><dd>{selectedInstance.username}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('monitoring')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'monitoring')}><div className="panel-heading"><Activity /><div><p className="eyebrow small">Monitoring</p><h3>Health Status</h3></div></div><dl className="detail-list"><dt>Enabled</dt><dd>{booleanPill(selectedInstance.isEnabled, 'green', 'red', { trueLabel: 'Enabled', falseLabel: 'Disabled' })}</dd><dt>Last Success</dt><dd>{formatDateTime(selectedInstance.lastSuccessAt)}</dd><dt>Last Failure</dt><dd>{formatDateTime(selectedInstance.lastFailureAt)}</dd><dt>Uptime 24h</dt><dd>{selectedInstance.uptimePercent24h === null ? 'Unknown' : `${selectedInstance.uptimePercent24h}%`}</dd><dt>Uptime 7d</dt><dd>{selectedInstance.uptimePercent7d === null ? 'Unknown' : `${selectedInstance.uptimePercent7d}%`}</dd><dt>Check License</dt><dd>{booleanPill(selectedInstance.checkLicense, 'green', 'grey', { trueLabel: 'Enabled', falseLabel: 'Disabled' })}</dd><dt>Archived</dt><dd>{booleanPill(selectedInstance.archived, 'red', 'green')}</dd><dt>Last Error</dt><dd>{formatNullable(selectedInstance.lastError, 'None')}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('workflow')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'workflow')}><div className="panel-heading"><Database /><div><p className="eyebrow small">OxyGen BPM</p><h3>Workflow & Components</h3></div></div><dl className="detail-list workflow-queue-detail-list">{renderQueueStatusList(selectedInstance)}<dt>Workflow Summary</dt><dd>{selectedInstance.workflowSummaryJson ? 'Collected' : 'Not collected yet'}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('settings')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'settings')}><div className="panel-heading"><Settings /><div><p className="eyebrow small">OxyGen BPM</p><h3>Settings</h3></div></div>{renderSettingsTree(selectedInstance.settingsJson, true)}<dl className="detail-list settings-card-summary"><dt>Raw JSON</dt><dd>{selectedInstance.settingsJson ? `${collectedSettingsCount(selectedInstance.settingsJson)} key setting(s) found` : 'Not collected yet'}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('metadata')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'metadata')}><div className="panel-heading"><Database /><div><p className="eyebrow small">Custom Data</p><h3>Metadata</h3></div></div><dl className="detail-list"><dt>Status</dt><dd>{selectedInstance.metadata ? 'Custom metadata added' : 'No metadata'}</dd><dt>Type</dt><dd>{selectedInstance.metadata === null ? 'None' : Array.isArray(selectedInstance.metadata) ? 'Array' : typeof selectedInstance.metadata}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('notes')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'notes')}><div className="panel-heading"><ClipboardList /><div><p className="eyebrow small">Knowledge</p><h3>Notes</h3></div></div><dl className="detail-list"><dt>Detected format</dt><dd>{detectNotesFormat(selectedInstance.notes).toUpperCase()}</dd><dt>Status</dt><dd>{selectedInstance.notes ? 'Notes added' : 'No notes'}</dd></dl></article><article className="panel instance-detail-card clickable" role="button" tabIndex={0} onClick={() => void openInstanceHealthModal('record')} onKeyDown={(event) => handleInstanceDetailTileKeyDown(event, 'record')}><div className="panel-heading"><ShieldCheck /><div><p className="eyebrow small">Record</p><h3>Metadata</h3></div></div><dl className="detail-list"><dt>Description</dt><dd>{formatNullable(selectedInstance.description, 'No description')}</dd><dt>Created</dt><dd>{formatDateTime(selectedInstance.createdAt)}</dd><dt>Updated</dt><dd>{formatDateTime(selectedInstance.updatedAt)}</dd><dt>Instance ID</dt><dd>{selectedInstance.id}</dd></dl></article></div></div>}
          {activeSection === 'instance-dashboard' && !selectedInstance && <article className="panel"><p className="panel-copy">Select an instance from the grid to open its dashboard.</p><Button className="compact-button" type="button" onClick={() => setActiveSection('instances')}><ChevronLeft /> Back to Instances</Button></article>}
          {activeSection === 'user-groups' && canManageGroups && <ManagedGrid gridKey="user-groups" token={token!} rows={groupRows} loading={isAdminDataRefreshing} loadingLabel="Loading User Groups…" columns={labeledGroupColumnDefs} actionCell={GroupActionCell} mobileActions={(row) => <MobileStandardActions onEdit={() => openEditGroupModal(row.raw)} onDelete={() => deleteItem('group', row.raw.id, `group ${row.raw.name}`)} />} toolbar={<Button className="btn-create" onClick={openCreateGroupModal} type="button" themeColor="primary"><Plus /> Create &quot;Group&quot;</Button>} />}
          {activeSection === 'users' && canManageUsers && <ManagedGrid gridKey="users" token={token!} rows={userRows} loading={isAdminDataRefreshing} loadingLabel="Loading Users…" columns={labeledUserColumnDefs} actionCell={UserActionCell} mobileActions={(row) => <MobileStandardActions onEdit={() => openEditUserModal(row.raw)} onDelete={() => deleteItem('user', row.raw.user.id, `user ${row.raw.user.email}`)} />} toolbar={<Button className="btn-create" onClick={openCreateUserModal} type="button" themeColor="primary"><Plus /> Create &quot;User&quot;</Button>} />}
          {activeSection === 'roles' && canManageRoles && <ManagedGrid gridKey="roles" token={token!} rows={roleRows} loading={isAdminDataRefreshing} loadingLabel="Loading Roles…" columns={labeledRoleColumnDefs} actionCell={RoleActionCell} mobileActions={(row) => row.raw.isSystem ? <MobileStandardActions protectedOnly onEdit={() => setMessage(`${row.raw.name} is a protected global role and cannot be modified/deleted.`)} /> : <MobileStandardActions onEdit={() => openEditRoleModal(row.raw)} onDelete={() => deleteItem('role', row.raw.id, `role ${row.raw.name}`)} />} toolbar={<Button className="btn-create" onClick={openCreateRoleModal} type="button" themeColor="primary"><Plus /> Create &quot;Role&quot;</Button>} />}
          {activeSection === 'settings-general' && renderSettingsGeneral()}{activeSection === 'settings-queue' && renderSettingsQueue()}{activeSection === 'settings-update' && renderSettingsUpdate()}{activeSection === 'settings-logs' && canViewLogs && renderSettingsLogs()}{activeSection === 'settings-database' && canViewDatabase && renderDatabasePerformance()}{activeSection === 'settings-issues' && canViewIssueTypes && renderIssueCatalog()}{activeSection === 'settings-advanced' && canManageSettings && <article className="panel"><p className="panel-copy">Advanced settings: Not Implemented.</p></article>}
        </section></div>)}

      {profile && !modal && !healthModal && <nav className="mobile-bottom-bar" aria-label="Mobile actions">
        {activeSection === 'instance-dashboard' && selectedInstance ? <>
          {canManageInstances && <button type="button" onClick={() => openEditInstanceModal(selectedInstance)}><Pencil /><span>Edit</span></button>}
          {canManageInstances && <button type="button" onClick={() => testInstanceConnectivity(selectedInstance)}><RotateCw /><span>Health Check</span></button>}
          {canViewLogs && <button type="button" onClick={() => openInstanceLogs(selectedInstance)}><ClipboardList /><span>Logs</span></button>}
          <button type="button" className="primary" onClick={() => window.open(launchUrlForInstance(selectedInstance), '_blank', 'noopener,noreferrer')}><ExternalLink /><span>Launch</span></button>
        </> : <>
          <button type="button" className={activeSection === 'dashboard' ? 'active' : ''} onClick={() => nav('dashboard')}><LayoutDashboard /><span>Home</span></button>
          {canViewInstances && <button type="button" className={activeSection === 'instances' ? 'active' : ''} onClick={() => { nav('instances'); loadInstances(); }}><Server /><span>Instances</span></button>}
          {canManageInstances && <button type="button" className="primary" onClick={openCreateInstanceModal}><Plus /><span>Enroll</span></button>}
          {canManageSecurity && <button type="button" className={activeSection === 'users' || activeSection === 'user-groups' || activeSection === 'roles' ? 'active' : ''} onClick={() => nav(canManageUsers ? 'users' : canManageGroups ? 'user-groups' : 'roles')}><ShieldCheck /><span>Security</span></button>}
          {canUseSettings && <button type="button" className={activeSection.startsWith('settings-') ? 'active' : ''} onClick={() => nav(canManageSettings ? 'settings-general' : canViewJobs ? 'settings-queue' : canViewVersion ? 'settings-update' : canViewLogs ? 'settings-logs' : canViewDatabase ? 'settings-database' : 'settings-issues')}><Settings /><span>Settings</span></button>}
        </>}
      </nav>}


      {renderIssueCatalogDialog()}

      {selectedQueueJob && <Dialog className="cms-dialog database-detail-dialog" title={`Queue Job: ${selectedQueueJob.name}`} onClose={() => setSelectedQueueJob(null)} width={760}><div className="detail-grid"><div><span>Queue</span><strong>{selectedQueueJob.queue}</strong></div><div><span>State</span><strong>{selectedQueueJob.state}</strong></div><div><span>Tenant</span><strong>{selectedQueueJob.data.tenantName ?? (selectedQueueJob.data.tenantId ? tenantName(selectedQueueJob.data.tenantId) : 'Global')}</strong></div><div><span>Instance</span><strong>{queueJobInstanceLabel(selectedQueueJob)}</strong></div><div><span>Next Run</span><strong>{selectedQueueJob.nextProcessAt ? formatDateTime(selectedQueueJob.nextProcessAt) : '—'}</strong></div><div><span>Runtime</span><strong>{formatQueueRuntime(selectedQueueJob.resource?.durationMs)}</strong></div><div><span>Attempts</span><strong>{queueJobAttemptLabel(selectedQueueJob)}</strong></div><div><span>Requested By</span><strong>{selectedQueueJob.data.requestedBy ?? '—'}</strong></div></div><p className="panel-copy"><strong>Result:</strong> {selectedQueueJob.result?.summary ?? '—'}</p><p className="panel-copy"><strong>Failure:</strong> {selectedQueueJob.failedReason ?? '—'}</p><pre className="json-block">{queueJobDetail(selectedQueueJob)}</pre><DialogActionsBar><Button className="compact-button" type="button" fillMode="flat" onClick={() => setSelectedQueueJob(null)}>Close</Button></DialogActionsBar></Dialog>}

      {renderRowActionMenu()}

      {renderInstanceHealthModal()}

      {modal && isMobileViewport && <section className="mobile-editor-screen" aria-labelledby="mobile-editor-title">
        <header className="mobile-editor-screen-header"><button className="mobile-editor-back" type="button" onClick={() => setModal(null)} aria-label="Back"><ChevronLeft /></button><h2 id="mobile-editor-title">{modalTitle}</h2></header>
        <div className="mobile-editor-screen-body">{renderModalForm()}</div>
      </section>}

      {modal && !isMobileViewport && <Dialog className="cms-dialog" title={modalTitle} onClose={() => setModal(null)} width={modal?.kind === 'role' ? 900 : modal?.kind === 'instance' ? 760 : 520}>
        {renderModalForm()}
      </Dialog>}
      {(message || error) && <p className={`status ${error ? 'failure error' : messageTone}`}>{error || message}</p>}
    </main>
  );
}
