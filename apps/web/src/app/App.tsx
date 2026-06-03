import {
  Activity, ChevronDown, ChevronLeft, ChevronRight, Database, Eye, EyeOff, LayoutDashboard,
  LogOut, Pencil, Plus, RotateCw, Server, Settings, ShieldCheck, Trash2, UserCircle, UserPlus
} from 'lucide-react';
import { Grid, GridColumn, type GridCustomCellProps, type GridDataStateChangeEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { Dialog, DialogActionsBar } from '@progress/kendo-react-dialogs';
import { process, type State } from '@progress/kendo-data-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
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
type OxyGenInstance = { id: string; name: string; description: string | null; tenantId: TenantId; protocol: 'http' | 'https'; host: string; port: number | null; hostname: string; baseUrl: string; launchUrl: string; apiBaseUrl: string; username: string; pollingIntervalSeconds: number; isEnabled: boolean; status: string; sslValid: boolean | null; sslExpiresAt: string | null; lastCheckedAt: string | null; uptimePercent24h: number | null; processingStatus: string; emmQueueStatus: string; smsStatus: string; hangfireStatus: string; licenseKey: string | null; licenseStatus: string; lastError: string | null };
type BootstrapStatus = { requiresBootstrap: boolean };
type SetupNextStep = 'database' | 'schema' | 'admin' | 'complete';
type SetupStatus = { database: { configured: boolean; connected: boolean; schemaCurrent: boolean; defaultDatabaseName: string; targetSchemaVersion: string }; admin: { exists: boolean }; nextStep: SetupNextStep; requiresSetup: boolean };
type DatabaseSetupResponse = { ok: boolean; mode?: string; database: string; message?: string; nextStep?: SetupNextStep; targetSchemaVersion?: string; appliedVersions?: string[]; createdDatabase?: boolean; createdUser?: boolean };
type DeploymentStatus = { mode: 'self-contained' | 'custom'; managedMysql: boolean; mysql?: { host: string; port: number; database: string; applicationUser: string } };
type DatabaseMode = 'managed-mysql' | 'local-mysql' | 'existing-mysql';
type DbWizardStep = 'mode' | 'connection' | 'credentials' | 'review';
type NavSection = 'dashboard' | 'organizations' | 'instances' | 'users' | 'user-groups' | 'roles' | 'settings-general' | 'settings-advanced';
type ModalKind = 'user' | 'group' | 'role' | 'tenant' | 'instance';
type ModalEntity = UserProfile | Group | Role | Tenant | OxyGenInstance;
type ModalState = { kind: ModalKind; data?: ModalEntity } | null;
type GroupGridRow = { id: string; name: string; description: string; tenant: string; instanceAccess: string; raw: Group };
type RoleGridRow = { id: string; name: string; description: string; tenant: string; system: string; raw: Role };
type TenantGridRow = { id: string; name: string; description: string; raw: Tenant };
type UserGridRow = { id: string; displayName: string; email: string; role: string; groups: string; tenant: string; instanceAccess: string; raw: UserProfile };
type InstanceGridRow = { id: string; name: string; tenant: string; host: string; status: string; ssl: string; license: string; processing: string; enabled: string; raw: OxyGenInstance };
type InstanceColumnKey = 'name' | 'tenant' | 'host' | 'status' | 'ssl' | 'license' | 'processing' | 'enabled';

const instanceColumnDefs: { key: InstanceColumnKey; title: string; width?: string }[] = [
  { key: 'name', title: 'Name' },
  { key: 'tenant', title: 'Tenant' },
  { key: 'host', title: 'Host' },
  { key: 'status', title: 'Up/Down', width: '130px' },
  { key: 'ssl', title: 'SSL', width: '110px' },
  { key: 'license', title: 'License', width: '130px' },
  { key: 'processing', title: 'Processing', width: '140px' },
  { key: 'enabled', title: 'Enabled', width: '120px' }
];

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
  const [token, setToken] = useState('');
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleName>('Operator');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set(['security']));
  const [modal, setModal] = useState<ModalState>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [userGridState, setUserGridState] = useState<State>({ sort: [{ field: 'displayName', dir: 'asc' }] });
  const [groupGridState, setGroupGridState] = useState<State>({ sort: [{ field: 'name', dir: 'asc' }] });
  const [roleGridState, setRoleGridState] = useState<State>({ sort: [{ field: 'name', dir: 'asc' }] });
  const [tenantGridState, setTenantGridState] = useState<State>({ sort: [{ field: 'name', dir: 'asc' }] });
  const [instanceGridState, setInstanceGridState] = useState<State>({ sort: [{ field: 'name', dir: 'asc' }] });
  const [instanceFiltersVisible, setInstanceFiltersVisible] = useState(true);
  const [instanceColumnSelectorOpen, setInstanceColumnSelectorOpen] = useState(false);
  const [visibleInstanceColumns, setVisibleInstanceColumns] = useState<Record<InstanceColumnKey, boolean>>(() => Object.fromEntries(instanceColumnDefs.map((column) => [column.key, true])) as Record<InstanceColumnKey, boolean>);

  const isSystemAdmin = useMemo(() => profile?.roles.includes('SystemAdmin') ?? false, [profile]);
  const tenantName = (tenantId: TenantId) => tenantId ? tenants.find((tenant) => tenant.id === tenantId)?.name || 'Unknown tenant' : 'Global';
  const availableRoles = roles.length ? roles : [{ id: 'operator', name: 'Operator', description: null, tenantId: null, isSystem: false }];
  const instanceName = (instanceId: string) => instances.find((instance) => instance.id === instanceId)?.name || instanceId;
  const accessLabel = (mode: string, instanceIds: string[]) => mode === 'all' ? 'All instances' : mode === 'none' ? 'No instances' : mode === 'inherit' ? 'Inherited from groups' : `${instanceIds.length} specific instance${instanceIds.length === 1 ? '' : 's'}`;
  const launchUrlForInstance = (instance: OxyGenInstance) => `${instance.protocol}://${instance.host}:${instance.port ?? (instance.protocol === 'http' ? 80 : 443)}/optws/oxygen.aspx`;
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

  async function loadInstances(t = token) {
    if (!t) return;
    const res = await api<{ instances: OxyGenInstance[] }>('/api/instances', { token: t });
    setInstances(res.instances);
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
    await loadInstances(t);
    if (!selectedGroupId && gr.groups[0]) setSelectedGroupId(gr.groups[0].id);
    if (!selectedRole && rr.roles[0]) setSelectedRole(rr.roles[0].name);
  }

  function clearStatus() { setError(''); setMessage(''); }
  function showNotImplemented(label: string) { setError(''); setMessage(`${label}: Not Implemented`); }
  function nav(section: NavSection, implemented = true, label?: string) {
    setActiveSection(section);
    if (!implemented) showNotImplemented(label || section);
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
      if (login.roles.includes('SystemAdmin')) await refreshAdminData(login.token);
      else await loadInstances(login.token);
    } catch (err) { setError(err instanceof Error ? err.message : 'Login failed.'); }
  }

  const tenantPayload = () => selectedTenantId || null;

  async function handleSaveTenant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget; const f = new FormData(el);
    const editing = modal?.kind === 'tenant' ? modal.data as Tenant | undefined : undefined;
    const payload = { name: f.get('name'), description: f.get('description') || null };
    try {
      if (editing) { const res = await api<{ tenant: Tenant }>(`/api/tenants/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated tenant ${res.tenant.name}.`); }
      else { const res = await api<{ tenant: Tenant }>('/api/tenants', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created tenant ${res.tenant.name}.`); }
      el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'Tenant update failed.' : 'Tenant creation failed.'); }
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
    const payload: Record<string, unknown> = { name: f.get('name'), description: f.get('description') || null, tenantId: selectedTenantId || null, protocol: f.get('protocol') || 'https', host: f.get('host'), port: portValue ? Number(portValue) : null, username, pollingIntervalSeconds: Number(f.get('pollingIntervalSeconds') || 300), isEnabled: f.get('isEnabled') === 'on' };
    if (!editing || password) payload.password = password;
    try {
      if (editing) { const res = await api<{ instance: OxyGenInstance }>(`/api/instances/${editing.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated instance ${res.instance.name}.`); }
      else { const res = await api<{ instance: OxyGenInstance }>('/api/instances', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created instance ${res.instance.name}.`); }
      el.reset(); setModal(null); await loadInstances();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'Instance update failed.' : 'Instance creation failed.'); }
  }

  async function testInstanceConnectivity(instance: OxyGenInstance) {
    clearStatus();
    try { const res = await api<{ ok: boolean; status: string; message: string }>(`/api/instances/${instance.id}/test-connectivity`, { method: 'POST', token }); setMessage(`${instance.name}: ${res.message}`); }
    catch (err) { setError(err instanceof Error ? err.message : 'Connectivity test failed.'); }
  }

  async function deleteItem(kind: ModalKind, id: string, label: string) {
    clearStatus();
    if (!window.confirm(`Delete ${label}?`)) return;
    const path = kind === 'user' ? `/api/users/${id}` : kind === 'group' ? `/api/groups/${id}` : kind === 'role' ? `/api/roles/${id}` : kind === 'instance' ? `/api/instances/${id}` : `/api/tenants/${id}`;
    try {
      await api<unknown>(path, { method: 'DELETE', token });
      setMessage(`Deleted ${label}.`);
      if (kind === 'instance') await loadInstances();
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
  function openCreateInstanceModal() { setSelectedTenantId(''); setModal({ kind: 'instance' }); }
  function openEditInstanceModal(instance: OxyGenInstance) { setSelectedTenantId(instance.tenantId || ''); setModal({ kind: 'instance', data: instance }); }

  function handleLogout() { setToken(''); setProfile(null); setGroups([]); setUsers([]); setRoles([]); setTenants([]); setInstances([]); setActiveSection('dashboard'); setMessage('Signed out.'); }
  function toggleAccordion(key: string) { setOpenAccordions((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }

  const userRows = useMemo<UserGridRow[]>(() => users.map((entry) => ({ id: entry.user.id, displayName: entry.user.displayName, email: entry.user.email, role: entry.roles.join(', '), groups: entry.groups.map((group) => group.name).join(', '), tenant: tenantName(entry.user.tenantId), instanceAccess: accessLabel(entry.user.instanceAccessMode, entry.user.instanceIds), raw: entry })), [users, tenants, instances]);
  const groupRows = useMemo<GroupGridRow[]>(() => groups.map((group) => ({ id: group.id, name: group.name, description: group.description || '', tenant: tenantName(group.tenantId), instanceAccess: accessLabel(group.instanceAccessMode, group.instanceIds), raw: group })), [groups, tenants, instances]);
  const roleRows = useMemo<RoleGridRow[]>(() => roles.map((role) => ({ id: role.id, name: role.name, description: role.description || '', tenant: tenantName(role.tenantId), system: role.isSystem ? 'Yes' : 'No', raw: role })), [roles, tenants]);
  const tenantRows = useMemo<TenantGridRow[]>(() => tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, description: tenant.description || '', raw: tenant })), [tenants]);
  const instanceRows = useMemo<InstanceGridRow[]>(() => instances.map((instance) => ({ id: instance.id, name: instance.name, tenant: tenantName(instance.tenantId), host: instance.host, status: instance.status, ssl: instance.sslValid === null ? 'Unknown' : instance.sslValid ? 'Valid' : 'Invalid', license: instance.licenseStatus, processing: instance.processingStatus, enabled: instance.isEnabled ? 'Yes' : 'No', raw: instance })), [instances, tenants]);
  const processedUsers = useMemo(() => process(userRows, userGridState), [userRows, userGridState]);
  const processedGroups = useMemo(() => process(groupRows, groupGridState), [groupRows, groupGridState]);
  const processedRoles = useMemo(() => process(roleRows, roleGridState), [roleRows, roleGridState]);
  const processedTenants = useMemo(() => process(tenantRows, tenantGridState), [tenantRows, tenantGridState]);
  const processedInstances = useMemo(() => process(instanceRows, instanceGridState), [instanceRows, instanceGridState]);

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
  const TenantActionCell = cell<TenantGridRow>((raw) => openEditTenantModal(raw as Tenant), (raw) => deleteItem('tenant', (raw as Tenant).id, `tenant ${(raw as Tenant).name}`));
  function InstanceActionCell({ dataItem, tdProps }: GridCustomCellProps) { const row = dataItem as InstanceGridRow; return <td {...tdProps} className="k-command-cell"><Button className="btn-icon-info" onClick={() => openEditInstanceModal(row.raw)} title="Edit" type="button" fillMode="flat"><Pencil /></Button><Button className="btn-icon-info" onClick={() => testInstanceConnectivity(row.raw)} title="Test connectivity" type="button" fillMode="flat"><RotateCw /></Button><Button className="btn-icon-info" onClick={() => window.open(launchUrlForInstance(row.raw), '_blank', 'noopener,noreferrer')} title="Launch OxyGen" type="button" fillMode="flat">Launch</Button><Button className="btn-icon-danger" onClick={() => deleteItem('instance', row.raw.id, `instance ${row.raw.name}`)} title="Delete" type="button" fillMode="flat"><Trash2 /></Button></td>; }

  const sectionMeta = (() => {
    switch (activeSection) {
      case 'dashboard': return { eyebrow: 'Dashboard', heading: `Welcome, ${profile?.user.displayName || ''}` };
      case 'organizations': return { eyebrow: 'Organizations', heading: 'Tenants / Partners' };
      case 'instances': return { eyebrow: 'Organizations', heading: 'Instances' };
      case 'users': return { eyebrow: 'Security', heading: 'Users' };
      case 'user-groups': return { eyebrow: 'Security', heading: 'User Groups' };
      case 'roles': return { eyebrow: 'Security', heading: 'Roles' };
      case 'settings-general': return { eyebrow: 'Settings', heading: 'General' };
      case 'settings-advanced': return { eyebrow: 'Settings', heading: 'Advanced' };
    }
  })();

  const gridSection = activeSection === 'users' || activeSection === 'user-groups' || activeSection === 'roles' || activeSection === 'organizations' || activeSection === 'instances';

  function TenantSelect({ disabled = false }: { disabled?: boolean }) {
    return <label>Tenant / Partner<select value={selectedTenantId} disabled={disabled} onChange={(e) => setSelectedTenantId(e.target.value)}><option value="">Global</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select>{disabled && <small>Tenant assignment is locked after creation.</small>}</label>;
  }

  return (
    <main className={`shell${profile ? ' app-shell' : ''}`}>
      <header className="brand-bar"><a className="brand-lockup" href="/" aria-label="OxyGen CMS home"><img className="brand-logo" src={oxygenLogo} alt="OxyGen" /><span className="brand-product">Central Management Server</span></a><div className="company-lockup"><span>Powered by</span><img src={o2Logo} alt="O2 Intelligent Automation Solutions" /></div></header>
      {!profile && (
        <>
          <section className="hero"><h1 className="hero-title"><span>Centralized management for</span><span>OxyGen BPM deployments.</span></h1><p className="summary">A lightweight management server for monitoring OxyGen health, licensing, global settings, and workflow status across partner and customer environments.</p></section>
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

      {profile && (<div className={`admin-layout ${isDrawerExpanded ? 'drawer-expanded' : 'drawer-collapsed'}`}><aside className={`admin-sidebar ${isDrawerExpanded ? 'expanded' : 'collapsed'}`}><button className="sidebar-toggle" type="button" onClick={() => setIsDrawerExpanded((v) => !v)} aria-label={isDrawerExpanded ? 'Collapse navigation' : 'Expand navigation'}>{isDrawerExpanded ? <ChevronLeft /> : <ChevronRight />}</button><div className="sidebar-user"><UserCircle /><div><span className="su-name">{profile.user.displayName}</span><span className="su-role">{profile.roles[0]}</span></div></div><nav className="sidebar-nav"><button className={`nav-link${activeSection === 'dashboard' ? ' active' : ''}`} onClick={() => nav('dashboard')}><LayoutDashboard /><span>Dashboard</span></button><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('organizations')}><Server /><span>Organizations</span>{openAccordions.has('organizations') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('organizations') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'organizations' ? ' active' : ''}`} onClick={() => nav('organizations')}><span>Tenants / Partners</span></button><button className={`nav-link child${activeSection === 'instances' ? ' active' : ''}`} onClick={() => { nav('instances'); loadInstances(); }}><span>Instances</span></button></div>)}</div><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('security')}><ShieldCheck /><span>Security</span>{openAccordions.has('security') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('security') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'users' ? ' active' : ''}`} onClick={() => nav('users')}><span>Users</span></button><button className={`nav-link child${activeSection === 'user-groups' ? ' active' : ''}`} onClick={() => nav('user-groups')}><span>User Groups</span></button><button className={`nav-link child${activeSection === 'roles' ? ' active' : ''}`} onClick={() => nav('roles')}><span>Roles</span></button></div>)}</div><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('settings')}><Settings /><span>Settings</span>{openAccordions.has('settings') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('settings') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'settings-general' ? ' active' : ''}`} onClick={() => nav('settings-general', false, 'General Settings')}><span>General</span></button><button className={`nav-link child${activeSection === 'settings-advanced' ? ' active' : ''}`} onClick={() => nav('settings-advanced', false, 'Advanced Settings')}><span>Advanced</span></button></div>)}</div></nav><button className="sidebar-logout" onClick={handleLogout}><LogOut /><span>Sign out</span></button></aside>
        <section className={`admin-content ${gridSection ? 'grid-section' : ''}`}><div className="page-header"><p className="eyebrow small">{sectionMeta.eyebrow}</p><h2>{sectionMeta.heading}</h2></div>
          {activeSection === 'dashboard' && <div className="dashboard-metrics"><div className="metric"><strong>{groups.length}</strong><span>User Groups</span></div><div className="metric"><strong>{users.length}</strong><span>Users</span></div><div className="metric"><strong>{roles.length}</strong><span>Roles</span></div><div className="metric"><strong>{tenants.length}</strong><span>Tenants / Partners</span></div></div>}
          {activeSection === 'organizations' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateTenantModal} type="button" themeColor="primary"><Plus /> Create "Tenant"</Button></div><Grid className="cms-kendo-grid" data={processedTenants} sortable filterable resizable {...tenantGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setTenantGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: TenantActionCell }} /><GridColumn field="name" title="Name" filter="text" /><GridColumn field="description" title="Description" filter="text" /></Grid></article>}
          {activeSection === 'instances' && <article className="panel data-panel kendo-data-panel"><div className="dp-head instance-grid-toolbar">{isSystemAdmin && <Button className="btn-create" onClick={openCreateInstanceModal} type="button" themeColor="primary"><Plus /> Enroll Instance</Button>}<div className="column-selector-wrap"><Button type="button" fillMode="outline" onClick={() => setInstanceColumnSelectorOpen((value) => !value)}>Select Columns</Button>{instanceColumnSelectorOpen && <div className="column-selector-popover">{instanceColumnDefs.map((column) => <label key={column.key} className="checkbox-label"><input type="checkbox" checked={visibleInstanceColumns[column.key]} onChange={(event) => setVisibleInstanceColumns((current) => ({ ...current, [column.key]: event.target.checked }))} /> {column.title}</label>)}</div>}</div><Button type="button" fillMode="outline" onClick={() => setInstanceFiltersVisible((value) => !value)}>{instanceFiltersVisible ? 'Hide Filters' : 'Show Filters'}</Button></div><Grid className="cms-kendo-grid" data={processedInstances} sortable filterable={instanceFiltersVisible} groupable resizable {...instanceGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setInstanceGridState(e.dataState)}><GridColumn title="Actions" width="210px" filterable={false} sortable={false} groupable={false} cells={{ data: InstanceActionCell }} />{instanceColumnDefs.filter((column) => visibleInstanceColumns[column.key]).map((column) => <GridColumn key={column.key} field={column.key} title={column.title} filter="text" width={column.width} />)}</Grid></article>}
          {activeSection === 'user-groups' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateGroupModal} type="button" themeColor="primary"><Plus /> Create "Group"</Button></div><Grid className="cms-kendo-grid" data={processedGroups} sortable filterable resizable {...groupGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setGroupGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: GroupActionCell }} /><GridColumn field="name" title="Name" filter="text" /><GridColumn field="tenant" title="Tenant" filter="text" /><GridColumn field="description" title="Description" filter="text" /><GridColumn field="instanceAccess" title="Instance Access" filter="text" /></Grid></article>}
          {activeSection === 'users' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateUserModal} type="button" themeColor="primary"><Plus /> Create "User"</Button></div><Grid className="cms-kendo-grid" data={processedUsers} sortable filterable resizable {...userGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setUserGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: UserActionCell }} /><GridColumn field="displayName" title="Name" filter="text" /><GridColumn field="email" title="Email" filter="text" /><GridColumn field="role" title="Role" filter="text" /><GridColumn field="tenant" title="Tenant" filter="text" /><GridColumn field="groups" title="Groups" filter="text" /><GridColumn field="instanceAccess" title="Instance Access" filter="text" /></Grid></article>}
          {activeSection === 'roles' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateRoleModal} type="button" themeColor="primary"><Plus /> Create "Role"</Button></div><Grid className="cms-kendo-grid" data={processedRoles} sortable filterable resizable {...roleGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setRoleGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: RoleActionCell }} /><GridColumn field="name" title="Name" filter="text" /><GridColumn field="tenant" title="Tenant" filter="text" /><GridColumn field="system" title="System" filter="text" width="110px" /><GridColumn field="description" title="Description" filter="text" /></Grid></article>}
          {activeSection === 'settings-general' && <article className="panel"><p className="panel-copy">General settings: Not Implemented.</p></article>}{activeSection === 'settings-advanced' && <article className="panel"><p className="panel-copy">Advanced settings: Not Implemented.</p></article>}
        </section></div>)}

      {modal && <Dialog className="cms-dialog" title={`${modal.data ? 'Edit' : 'Create'} ${modal.kind === 'user' ? 'User' : modal.kind === 'group' ? 'Group' : modal.kind === 'role' ? 'Role' : modal.kind === 'instance' ? 'Instance' : 'Tenant'}`} onClose={() => setModal(null)} width={520}>
        {modal.kind === 'user' && <form className="modal-form" onSubmit={handleSaveUser}><label>Email<input name="email" type="email" placeholder="operator@example.com" defaultValue={(modal.data as UserProfile)?.user.email || ''} required /></label><label>Display name<input name="displayName" placeholder="Operator" defaultValue={(modal.data as UserProfile)?.user.displayName || ''} required /></label><label>Password<input name="password" type="password" minLength={12} placeholder={modal.data ? 'Leave blank to keep current password' : '12+ characters'} required={!modal.data} /></label><TenantSelect disabled={Boolean(modal.data)} /><label>Role<select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>{availableRoles.map((r) => <option key={r.id} value={r.name}>{r.name}{r.tenantId ? ` (${tenantName(r.tenantId)})` : ''}</option>)}</select></label><label>Group<select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}><option value="">None</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.tenantId ? ` (${tenantName(g.tenantId)})` : ''}</option>)}</select></label><label>Instance access<select name="instanceAccessMode" defaultValue={(modal.data as UserProfile)?.user.instanceAccessMode || 'inherit'}><option value="inherit">Inherited from assigned groups</option><option value="none">No instances</option><option value="all">All instances</option><option value="specific">Specific instances</option></select></label><label>Specific instances<InstanceAccessCheckboxes selected={(modal.data as UserProfile)?.user.instanceIds || []} /></label><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
        {modal.kind === 'group' && <form className="modal-form" onSubmit={handleSaveGroup}><label>Name<input name="name" placeholder="Customer Group A" defaultValue={(modal.data as Group)?.name || ''} required /></label><label>Description<input name="description" placeholder="Optional" defaultValue={(modal.data as Group)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><label>Instance access<select name="instanceAccessMode" defaultValue={(modal.data as Group)?.instanceAccessMode || 'none'}><option value="none">No instances</option><option value="all">All instances</option><option value="specific">Specific instances</option></select></label><label>Specific instances<InstanceAccessCheckboxes selected={(modal.data as Group)?.instanceIds || []} /></label><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
        {modal.kind === 'role' && <form className="modal-form" onSubmit={handleSaveRole}><label>Name<input name="name" placeholder="WorkflowReviewer" defaultValue={(modal.data as Role)?.name || ''} required /></label><label>Description<input name="description" placeholder="Optional" defaultValue={(modal.data as Role)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
        {modal.kind === 'tenant' && <form className="modal-form" onSubmit={handleSaveTenant}><label>Name<input name="name" placeholder="Partner A" defaultValue={(modal.data as Tenant)?.name || ''} required /></label><label>Description<input name="description" placeholder="Optional" defaultValue={(modal.data as Tenant)?.description || ''} /></label><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
        {modal.kind === 'instance' && <form className="modal-form" onSubmit={handleSaveInstance}><label>Name<input name="name" placeholder="Acme Production" defaultValue={(modal.data as OxyGenInstance)?.name || ''} required /></label><label>Description<input name="description" placeholder="Optional notes about this deployment" defaultValue={(modal.data as OxyGenInstance)?.description || ''} /></label><TenantSelect /><label>Protocol<select name="protocol" defaultValue={(modal.data as OxyGenInstance)?.protocol || 'https'}><option value="https">HTTPS</option><option value="http">HTTP</option></select></label><label>Host / URL<input name="host" placeholder="customer.example.com" defaultValue={(modal.data as OxyGenInstance)?.host || ''} required /></label><label>Port<input name="port" type="number" min={1} max={65535} placeholder="Default: 443 for HTTPS, 80 for HTTP" defaultValue={(modal.data as OxyGenInstance)?.port || ''} /></label><label>Username<input name="username" placeholder="admin" defaultValue={(modal.data as OxyGenInstance)?.username || 'admin'} required /></label><label>Password<input name="password" type="password" placeholder={modal.data ? 'Leave blank to keep current password' : 'Remote OxyGen password'} required={!modal.data} /></label><label>Polling interval seconds<input name="pollingIntervalSeconds" type="number" min={60} max={86400} defaultValue={(modal.data as OxyGenInstance)?.pollingIntervalSeconds || 300} required /></label><label className="checkbox-label"><input name="isEnabled" type="checkbox" defaultChecked={(modal.data as OxyGenInstance)?.isEnabled ?? true} /> Enabled for polling</label><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
      </Dialog>}
      {(message || error) && <p className={error ? 'status error' : 'status'}>{error || message}</p>}
    </main>
  );
}
