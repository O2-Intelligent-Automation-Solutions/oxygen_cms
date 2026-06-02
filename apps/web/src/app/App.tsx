import {
  Activity, ChevronDown, ChevronLeft, ChevronRight, Database, LayoutDashboard,
  LogOut, Pencil, Plus, Server, Settings, ShieldCheck, Trash2, UserCircle, UserPlus
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
type PublicUser = { id: string; email: string; displayName: string; tenantId: TenantId; isActive: boolean };
type AuthProfile = { user: PublicUser; roles: RoleName[]; groups: Array<{ id: string; name: string; tenantId: TenantId }> };
type Group = { id: string; name: string; description: string | null; tenantId: TenantId };
type Role = { id: string; name: string; description: string | null; tenantId: TenantId; isSystem: boolean };
type Tenant = { id: string; name: string; description: string | null };
type UserProfile = AuthProfile;
type BootstrapStatus = { requiresBootstrap: boolean };
type NavSection = 'dashboard' | 'organizations' | 'instances' | 'users' | 'user-groups' | 'roles' | 'settings-general' | 'settings-advanced';
type ModalKind = 'user' | 'group' | 'role' | 'tenant';
type ModalEntity = UserProfile | Group | Role | Tenant;
type ModalState = { kind: ModalKind; data?: ModalEntity } | null;
type GroupGridRow = { id: string; name: string; description: string; tenant: string; raw: Group };
type RoleGridRow = { id: string; name: string; description: string; tenant: string; system: string; raw: Role };
type TenantGridRow = { id: string; name: string; description: string; raw: Tenant };
type UserGridRow = { id: string; displayName: string; email: string; role: string; groups: string; tenant: string; raw: UserProfile };

const capabilities = [
  { icon: Server, label: 'Instance monitoring', detail: 'Track OxyGen availability, SSL, auth, and API health.' },
  { icon: Activity, label: 'Workflow visibility', detail: 'Surface pending, failed, and recovery workflow triggers.' },
  { icon: Database, label: 'Settings intelligence', detail: 'Query global settings across customer instances.' },
  { icon: ShieldCheck, label: 'Secure access', detail: 'Local authentication, roles, and group-scoped access.' },
];

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
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
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

  const isSystemAdmin = useMemo(() => profile?.roles.includes('SystemAdmin') ?? false, [profile]);
  const tenantName = (tenantId: TenantId) => tenantId ? tenants.find((tenant) => tenant.id === tenantId)?.name || 'Unknown tenant' : 'Global';
  const availableRoles = roles.length ? roles : [{ id: 'operator', name: 'Operator', description: null, tenantId: null, isSystem: false }];

  useEffect(() => {
    let active = true;
    api<BootstrapStatus>('/api/auth/bootstrap-status')
      .then((s) => { if (active) setRequiresBootstrap(s.requiresBootstrap); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load setup status.'); });
    return () => { active = false; };
  }, []);

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
    if (!selectedGroupId && gr.groups[0]) setSelectedGroupId(gr.groups[0].id);
    if (!selectedRole && rr.roles[0]) setSelectedRole(rr.roles[0].name);
  }

  function clearStatus() { setError(''); setMessage(''); }
  function showNotImplemented(label: string) { setError(''); setMessage(`${label}: Not Implemented`); }
  function nav(section: NavSection, implemented = true, label?: string) {
    setActiveSection(section);
    if (!implemented) showNotImplemented(label || section);
  }

  async function handleBootstrap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); clearStatus();
    const el = e.currentTarget;
    const f = new FormData(el);
    try {
      await api<AuthProfile>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ email: f.get('email'), displayName: f.get('displayName'), password: f.get('password') }) });
      setMessage('Initial setup succeeded. You can now sign in.'); setRequiresBootstrap(false); el.reset();
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
    const payload = { name: f.get('name'), description: f.get('description') || null, tenantId: editing ? editing.tenantId : tenantPayload() };
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
    const payload: Record<string, unknown> = { email: f.get('email'), displayName: f.get('displayName'), roleNames: [selectedRole], groupIds: selectedGroupId ? [selectedGroupId] : [], tenantId: editing ? editing.user.tenantId : tenantPayload() };
    if (!editing || password) payload.password = password;
    try {
      if (editing) { await api<UserProfile>(`/api/users/${editing.user.id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }); setMessage(`Updated user ${f.get('email')}.`); }
      else { await api<UserProfile>('/api/users', { method: 'POST', token, body: JSON.stringify(payload) }); setMessage(`Created user ${f.get('email')}.`); }
      el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : editing ? 'User update failed.' : 'User creation failed.'); }
  }

  async function deleteItem(kind: ModalKind, id: string, label: string) {
    clearStatus();
    if (!window.confirm(`Delete ${label}?`)) return;
    const path = kind === 'user' ? `/api/users/${id}` : kind === 'group' ? `/api/groups/${id}` : kind === 'role' ? `/api/roles/${id}` : `/api/tenants/${id}`;
    try {
      await api<unknown>(path, { method: 'DELETE', token });
      setMessage(`Deleted ${label}.`);
      await refreshAdminData();
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

  function handleLogout() { setToken(''); setProfile(null); setGroups([]); setUsers([]); setRoles([]); setTenants([]); setActiveSection('dashboard'); setMessage('Signed out.'); }
  function toggleAccordion(key: string) { setOpenAccordions((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }

  const userRows = useMemo<UserGridRow[]>(() => users.map((entry) => ({ id: entry.user.id, displayName: entry.user.displayName, email: entry.user.email, role: entry.roles.join(', '), groups: entry.groups.map((group) => group.name).join(', '), tenant: tenantName(entry.user.tenantId), raw: entry })), [users, tenants]);
  const groupRows = useMemo<GroupGridRow[]>(() => groups.map((group) => ({ id: group.id, name: group.name, description: group.description || '', tenant: tenantName(group.tenantId), raw: group })), [groups, tenants]);
  const roleRows = useMemo<RoleGridRow[]>(() => roles.map((role) => ({ id: role.id, name: role.name, description: role.description || '', tenant: tenantName(role.tenantId), system: role.isSystem ? 'Yes' : 'No', raw: role })), [roles, tenants]);
  const tenantRows = useMemo<TenantGridRow[]>(() => tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, description: tenant.description || '', raw: tenant })), [tenants]);
  const processedUsers = useMemo(() => process(userRows, userGridState), [userRows, userGridState]);
  const processedGroups = useMemo(() => process(groupRows, groupGridState), [groupRows, groupGridState]);
  const processedRoles = useMemo(() => process(roleRows, roleGridState), [roleRows, roleGridState]);
  const processedTenants = useMemo(() => process(tenantRows, tenantGridState), [tenantRows, tenantGridState]);

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

  const gridSection = activeSection === 'users' || activeSection === 'user-groups' || activeSection === 'roles' || activeSection === 'organizations';

  function TenantSelect({ disabled = false }: { disabled?: boolean }) {
    return <label>Tenant / Partner<select value={selectedTenantId} disabled={disabled} onChange={(e) => setSelectedTenantId(e.target.value)}><option value="">Global</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select>{disabled && <small>Tenant assignment is locked after creation.</small>}</label>;
  }

  return (
    <main className={`shell${profile ? ' app-shell' : ''}`}>
      <header className="brand-bar"><a className="brand-lockup" href="/" aria-label="OxyGen CMS home"><img className="brand-logo" src={oxygenLogo} alt="OxyGen" /><span className="brand-product">Central Management Server</span></a><div className="company-lockup"><span>Powered by</span><img src={o2Logo} alt="O2 Intelligent Automation Solutions" /></div></header>
      {!profile && (<><section className="hero"><h1 className="hero-title"><span>Centralized management for</span><span>OxyGen BPM deployments.</span></h1><p className="summary">A lightweight management server for monitoring OxyGen health, licensing, global settings, and workflow status across partner and customer environments.</p></section><section className="cards">{capabilities.map(({ icon: Icon, label, detail }) => (<article className="card" key={label}><Icon /><h2>{label}</h2><p>{detail}</p></article>))}</section>{requiresBootstrap === null && <p className="status">Checking setup status…</p>}{requiresBootstrap === true && (<section className="auth-grid single"><article className="panel setup-panel"><div className="panel-brand-mark-wrap"><img className="panel-brand-mark" src={oxygenFullLogo} alt="OxyGen" /></div><div className="panel-heading"><ShieldCheck /><div><p className="eyebrow small">Initial CMS setup</p><h2>Create the first administrator</h2></div></div><p className="panel-copy">No CMS users exist yet. Create the first local administrator to finish setup.</p><form onSubmit={handleBootstrap}><label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label><label>Display name<input name="displayName" placeholder="System Admin" required /></label><label>Password<input name="password" type="password" minLength={12} placeholder="12+ characters" required /></label><button type="submit">Create administrator</button></form></article></section>)}{requiresBootstrap === false && !profile && (<section className="auth-grid single"><article className="panel"><div className="panel-heading"><UserPlus /><div><p className="eyebrow small">Secure access</p><h2>Sign in</h2></div></div><form onSubmit={handleLogin}><label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label><label>Password<input name="password" type="password" required /></label><button type="submit">Sign in</button></form></article></section>)}</>)}

      {profile && (<div className={`admin-layout ${isDrawerExpanded ? 'drawer-expanded' : 'drawer-collapsed'}`}><aside className={`admin-sidebar ${isDrawerExpanded ? 'expanded' : 'collapsed'}`}><button className="sidebar-toggle" type="button" onClick={() => setIsDrawerExpanded((v) => !v)} aria-label={isDrawerExpanded ? 'Collapse navigation' : 'Expand navigation'}>{isDrawerExpanded ? <ChevronLeft /> : <ChevronRight />}</button><div className="sidebar-user"><UserCircle /><div><span className="su-name">{profile.user.displayName}</span><span className="su-role">{profile.roles[0]}</span></div></div><nav className="sidebar-nav"><button className={`nav-link${activeSection === 'dashboard' ? ' active' : ''}`} onClick={() => nav('dashboard')}><LayoutDashboard /><span>Dashboard</span></button><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('organizations')}><Server /><span>Organizations</span>{openAccordions.has('organizations') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('organizations') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'organizations' ? ' active' : ''}`} onClick={() => nav('organizations')}><span>Tenants / Partners</span></button><button className={`nav-link child${activeSection === 'instances' ? ' active' : ''}`} onClick={() => nav('instances', false, 'Instances')}><span>Instances</span></button></div>)}</div><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('security')}><ShieldCheck /><span>Security</span>{openAccordions.has('security') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('security') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'users' ? ' active' : ''}`} onClick={() => nav('users')}><span>Users</span></button><button className={`nav-link child${activeSection === 'user-groups' ? ' active' : ''}`} onClick={() => nav('user-groups')}><span>User Groups</span></button><button className={`nav-link child${activeSection === 'roles' ? ' active' : ''}`} onClick={() => nav('roles')}><span>Roles</span></button></div>)}</div><div className="nav-accordion"><button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('settings')}><Settings /><span>Settings</span>{openAccordions.has('settings') ? <ChevronDown /> : <ChevronRight />}</button>{openAccordions.has('settings') && (<div className="nav-accordion-children"><button className={`nav-link child${activeSection === 'settings-general' ? ' active' : ''}`} onClick={() => nav('settings-general', false, 'General Settings')}><span>General</span></button><button className={`nav-link child${activeSection === 'settings-advanced' ? ' active' : ''}`} onClick={() => nav('settings-advanced', false, 'Advanced Settings')}><span>Advanced</span></button></div>)}</div></nav><button className="sidebar-logout" onClick={handleLogout}><LogOut /><span>Sign out</span></button></aside>
        <section className={`admin-content ${gridSection ? 'grid-section' : ''}`}><div className="page-header"><p className="eyebrow small">{sectionMeta.eyebrow}</p><h2>{sectionMeta.heading}</h2></div>
          {activeSection === 'dashboard' && <div className="dashboard-metrics"><div className="metric"><strong>{groups.length}</strong><span>User Groups</span></div><div className="metric"><strong>{users.length}</strong><span>Users</span></div><div className="metric"><strong>{roles.length}</strong><span>Roles</span></div><div className="metric"><strong>{tenants.length}</strong><span>Tenants / Partners</span></div></div>}
          {activeSection === 'organizations' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateTenantModal} type="button" themeColor="primary"><Plus /> Create "Tenant"</Button></div><Grid className="cms-kendo-grid" data={processedTenants} sortable filterable resizable {...tenantGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setTenantGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: TenantActionCell }} /><GridColumn field="name" title="Name" filter="text" /><GridColumn field="description" title="Description" filter="text" /></Grid></article>}
          {activeSection === 'instances' && <article className="panel"><p className="panel-copy">Instance enrollment and status monitoring: Not Implemented.</p></article>}
          {activeSection === 'user-groups' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateGroupModal} type="button" themeColor="primary"><Plus /> Create "Group"</Button></div><Grid className="cms-kendo-grid" data={processedGroups} sortable filterable resizable {...groupGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setGroupGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: GroupActionCell }} /><GridColumn field="name" title="Name" filter="text" /><GridColumn field="tenant" title="Tenant" filter="text" /><GridColumn field="description" title="Description" filter="text" /></Grid></article>}
          {activeSection === 'users' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateUserModal} type="button" themeColor="primary"><Plus /> Create "User"</Button></div><Grid className="cms-kendo-grid" data={processedUsers} sortable filterable resizable {...userGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setUserGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: UserActionCell }} /><GridColumn field="displayName" title="Name" filter="text" /><GridColumn field="email" title="Email" filter="text" /><GridColumn field="role" title="Role" filter="text" /><GridColumn field="tenant" title="Tenant" filter="text" /><GridColumn field="groups" title="Groups" filter="text" /></Grid></article>}
          {activeSection === 'roles' && isSystemAdmin && <article className="panel data-panel kendo-data-panel"><div className="dp-head"><Button className="btn-create" onClick={openCreateRoleModal} type="button" themeColor="primary"><Plus /> Create "Role"</Button></div><Grid className="cms-kendo-grid" data={processedRoles} sortable filterable resizable {...roleGridState} onDataStateChange={(e: GridDataStateChangeEvent) => setRoleGridState(e.dataState)}><GridColumn title="Actions" width="104px" filterable={false} sortable={false} cells={{ data: RoleActionCell }} /><GridColumn field="name" title="Name" filter="text" /><GridColumn field="tenant" title="Tenant" filter="text" /><GridColumn field="system" title="System" filter="text" width="110px" /><GridColumn field="description" title="Description" filter="text" /></Grid></article>}
          {activeSection === 'settings-general' && <article className="panel"><p className="panel-copy">General settings: Not Implemented.</p></article>}{activeSection === 'settings-advanced' && <article className="panel"><p className="panel-copy">Advanced settings: Not Implemented.</p></article>}
        </section></div>)}

      {modal && <Dialog className="cms-dialog" title={`${modal.data ? 'Edit' : 'Create'} ${modal.kind === 'user' ? 'User' : modal.kind === 'group' ? 'Group' : modal.kind === 'role' ? 'Role' : 'Tenant'}`} onClose={() => setModal(null)} width={520}>
        {modal.kind === 'user' && <form className="modal-form" onSubmit={handleSaveUser}><label>Email<input name="email" type="email" placeholder="operator@example.com" defaultValue={(modal.data as UserProfile)?.user.email || ''} required /></label><label>Display name<input name="displayName" placeholder="Operator" defaultValue={(modal.data as UserProfile)?.user.displayName || ''} required /></label><label>Password<input name="password" type="password" minLength={12} placeholder={modal.data ? 'Leave blank to keep current password' : '12+ characters'} required={!modal.data} /></label><TenantSelect disabled={Boolean(modal.data)} /><label>Role<select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>{availableRoles.map((r) => <option key={r.id} value={r.name}>{r.name}{r.tenantId ? ` (${tenantName(r.tenantId)})` : ''}</option>)}</select></label><label>Group<select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}><option value="">None</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.tenantId ? ` (${tenantName(g.tenantId)})` : ''}</option>)}</select></label><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
        {modal.kind === 'group' && <form className="modal-form" onSubmit={handleSaveGroup}><label>Name<input name="name" placeholder="Customer Group A" defaultValue={(modal.data as Group)?.name || ''} required /></label><label>Description<input name="description" placeholder="Optional" defaultValue={(modal.data as Group)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
        {modal.kind === 'role' && <form className="modal-form" onSubmit={handleSaveRole}><label>Name<input name="name" placeholder="WorkflowReviewer" defaultValue={(modal.data as Role)?.name || ''} required /></label><label>Description<input name="description" placeholder="Optional" defaultValue={(modal.data as Role)?.description || ''} /></label><TenantSelect disabled={Boolean(modal.data)} /><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
        {modal.kind === 'tenant' && <form className="modal-form" onSubmit={handleSaveTenant}><label>Name<input name="name" placeholder="Partner A" defaultValue={(modal.data as Tenant)?.name || ''} required /></label><label>Description<input name="description" placeholder="Optional" defaultValue={(modal.data as Tenant)?.description || ''} /></label><DialogActionsBar><Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button></DialogActionsBar></form>}
      </Dialog>}
      {(message || error) && <p className={error ? 'status error' : 'status'}>{error || message}</p>}
    </main>
  );
}
