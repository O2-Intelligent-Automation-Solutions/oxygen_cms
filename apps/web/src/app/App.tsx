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

type RoleName = 'SystemAdmin' | 'PartnerAdmin' | 'Operator' | 'Viewer';

type AuthProfile = {
  user: { id: string; email: string; displayName: string; isActive: boolean };
  roles: RoleName[];
  groups: Array<{ id: string; name: string }>;
};

type Group = { id: string; name: string; description: string | null };
type UserProfile = AuthProfile;
type BootstrapStatus = { requiresBootstrap: boolean };
type NavSection = 'dashboard' | 'organizations' | 'instances' | 'users' | 'user-groups' | 'roles' | 'settings-general' | 'settings-advanced';
type ModalKind = 'user' | 'group';
type ModalState = { kind: ModalKind; data?: UserProfile | Group } | null;
type GroupGridRow = { id: string; name: string; description: string; raw: Group };
type UserGridRow = { id: string; displayName: string; email: string; role: string; groups: string; raw: UserProfile };

const capabilities = [
  { icon: Server, label: 'Instance monitoring', detail: 'Track OxyGen availability, SSL, auth, and API health.' },
  { icon: Activity, label: 'Workflow visibility', detail: 'Surface pending, failed, and recovery workflow triggers.' },
  { icon: Database, label: 'Settings intelligence', detail: 'Query global settings across customer instances.' },
  { icon: ShieldCheck, label: 'Secure access', detail: 'Local authentication, roles, and group-scoped access.' },
];

const roleNames: RoleName[] = ['SystemAdmin', 'PartnerAdmin', 'Operator', 'Viewer'];

async function api<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed with status ${response.status}`);
  return body as T;
}

export function App() {
  const [token, setToken] = useState('');
  const [requiresBootstrap, setRequiresBootstrap] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleName>('Operator');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set(['security']));
  const [modal, setModal] = useState<ModalState>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [userGridState, setUserGridState] = useState<State>({
    sort: [{ field: 'displayName', dir: 'asc' }]
  });
  const [groupGridState, setGroupGridState] = useState<State>({
    sort: [{ field: 'name', dir: 'asc' }]
  });

  const isSystemAdmin = useMemo(() => profile?.roles.includes('SystemAdmin') ?? false, [profile]);

  useEffect(() => {
    let active = true;
    api<BootstrapStatus>('/api/auth/bootstrap-status')
      .then((s) => { if (active) setRequiresBootstrap(s.requiresBootstrap); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load setup status.'); });
    return () => { active = false; };
  }, []);

  async function refreshAdminData(t = token) {
    if (!t) return;
    const [gr, ur] = await Promise.all([
      api<{ groups: Group[] }>('/api/groups', { token: t }),
      api<{ users: UserProfile[] }>('/api/users', { token: t }),
    ]);
    setGroups(gr.groups);
    setUsers(ur.users);
    if (!selectedGroupId && gr.groups[0]) setSelectedGroupId(gr.groups[0].id);
  }

  async function handleBootstrap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setMessage('');
    const el = e.currentTarget;
    const f = new FormData(el);
    try {
      await api<AuthProfile>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify({ email: f.get('email'), displayName: f.get('displayName'), password: f.get('password') }) });
      setMessage('Initial setup succeeded. You can now sign in.'); setRequiresBootstrap(false); el.reset();
    } catch (err) { setError(err instanceof Error ? err.message : 'Bootstrap failed.'); }
  }

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setMessage('');
    const f = new FormData(e.currentTarget);
    try {
      const login = await api<{ token: string } & AuthProfile>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: f.get('email'), password: f.get('password') }) });
      setToken(login.token);
      setProfile({ user: login.user, roles: login.roles, groups: login.groups });
      setMessage(`Signed in as ${login.user.displayName}.`);
      if (login.roles.includes('SystemAdmin')) await refreshAdminData(login.token);
    } catch (err) { setError(err instanceof Error ? err.message : 'Login failed.'); }
  }

  async function handleCreateGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setMessage('');
    const el = e.currentTarget;
    const f = new FormData(el);
    try {
      const res = await api<{ group: Group }>('/api/groups', { method: 'POST', token, body: JSON.stringify({ name: f.get('name'), description: f.get('description') }) });
      setMessage(`Created group ${res.group.name}.`); el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Group creation failed.'); }
  }

  async function handleCreateUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setMessage('');
    const el = e.currentTarget;
    const f = new FormData(el);
    try {
      await api<UserProfile>('/api/users', { method: 'POST', token, body: JSON.stringify({ email: f.get('email'), displayName: f.get('displayName'), password: f.get('password'), roleNames: [selectedRole], groupIds: selectedGroupId ? [selectedGroupId] : [] }) });
      setMessage(`Created user ${f.get('email')}.`); el.reset(); setModal(null); await refreshAdminData();
    } catch (err) { setError(err instanceof Error ? err.message : 'User creation failed.'); }
  }

  function handleLogout() {
    setToken(''); setProfile(null); setGroups([]); setUsers([]);
    setActiveSection('dashboard'); setMessage('Signed out.');
  }

  function toggleAccordion(key: string) {
    setOpenAccordions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const userRows = useMemo<UserGridRow[]>(() => users.map((entry) => ({
    id: entry.user.id,
    displayName: entry.user.displayName,
    email: entry.user.email,
    role: entry.roles.join(', '),
    groups: entry.groups.map((group) => group.name).join(', '),
    raw: entry
  })), [users]);

  const groupRows = useMemo<GroupGridRow[]>(() => groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description || '',
    raw: group
  })), [groups]);

  const processedUsers = useMemo(() => process(userRows, userGridState), [userRows, userGridState]);
  const processedGroups = useMemo(() => process(groupRows, groupGridState), [groupRows, groupGridState]);

  function handleUserGridStateChange(event: GridDataStateChangeEvent) {
    setUserGridState(event.dataState);
  }

  function handleGroupGridStateChange(event: GridDataStateChangeEvent) {
    setGroupGridState(event.dataState);
  }

  function GroupEditCell(props: GridCustomCellProps) {
    const row = props.dataItem as GroupGridRow;
    return (
      <td {...props.tdProps} className="k-command-cell">
        <Button className="btn-icon-info" onClick={() => setModal({ kind: 'group', data: row.raw })} title="Edit" type="button" fillMode="flat"><Pencil /></Button>
      </td>
    );
  }

  function GroupDeleteCell(props: GridCustomCellProps) {
    return (
      <td {...props.tdProps} className="k-command-cell">
        <Button className="btn-icon-danger" title="Delete" type="button" fillMode="flat"><Trash2 /></Button>
      </td>
    );
  }

  function UserEditCell(props: GridCustomCellProps) {
    const row = props.dataItem as UserGridRow;
    return (
      <td {...props.tdProps} className="k-command-cell">
        <Button className="btn-icon-info" onClick={() => setModal({ kind: 'user', data: row.raw })} title="Edit" type="button" fillMode="flat"><Pencil /></Button>
      </td>
    );
  }

  function UserDeleteCell(props: GridCustomCellProps) {
    return (
      <td {...props.tdProps} className="k-command-cell">
        <Button className="btn-icon-danger" title="Delete" type="button" fillMode="flat"><Trash2 /></Button>
      </td>
    );
  }

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

  return (
    <main className={`shell${profile ? ' app-shell' : ''}`}>
      <header className="brand-bar">
        <a className="brand-lockup" href="/" aria-label="OxyGen CMS home">
          <img className="brand-logo" src={oxygenLogo} alt="OxyGen" />
          <span className="brand-product">Central Management Server</span>
        </a>
        <div className="company-lockup">
          <span>Powered by</span>
          <img src={o2Logo} alt="O2 Intelligent Automation Solutions" />
        </div>
      </header>

      {!profile && (
        <>
          <section className="hero">
            <h1 className="hero-title">
              <span>Centralized management for</span>
              <span>OxyGen BPM deployments.</span>
            </h1>
            <p className="summary">A lightweight management server for monitoring OxyGen health, licensing, global settings, and workflow status across partner and customer environments.</p>
          </section>
          <section className="cards">
            {capabilities.map(({ icon: Icon, label, detail }) => (
              <article className="card" key={label}><Icon /><h2>{label}</h2><p>{detail}</p></article>
            ))}
          </section>
          {requiresBootstrap === null && <p className="status">Checking setup status…</p>}
          {requiresBootstrap === true && (
            <section className="auth-grid single">
              <article className="panel setup-panel">
                <div className="panel-brand-mark-wrap"><img className="panel-brand-mark" src={oxygenFullLogo} alt="OxyGen" /></div>
                <div className="panel-heading"><ShieldCheck /><div><p className="eyebrow small">Initial CMS setup</p><h2>Create the first administrator</h2></div></div>
                <p className="panel-copy">No CMS users exist yet. Create the first local administrator to finish setup.</p>
                <form onSubmit={handleBootstrap}>
                  <label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label>
                  <label>Display name<input name="displayName" placeholder="System Admin" required /></label>
                  <label>Password<input name="password" type="password" minLength={12} placeholder="12+ characters" required /></label>
                  <button type="submit">Create administrator</button>
                </form>
              </article>
            </section>
          )}
          {requiresBootstrap === false && !profile && (
            <section className="auth-grid single">
              <article className="panel">
                <div className="panel-heading"><UserPlus /><div><p className="eyebrow small">Secure access</p><h2>Sign in</h2></div></div>
                <form onSubmit={handleLogin}>
                  <label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label>
                  <label>Password<input name="password" type="password" required /></label>
                  <button type="submit">Sign in</button>
                </form>
              </article>
            </section>
          )}
        </>
      )}

      {profile && (
        <div className={`admin-layout ${isDrawerExpanded ? 'drawer-expanded' : 'drawer-collapsed'}`}>
          <aside className={`admin-sidebar ${isDrawerExpanded ? 'expanded' : 'collapsed'}`}>
            <button
              className="sidebar-toggle"
              type="button"
              onClick={() => setIsDrawerExpanded((v) => !v)}
              aria-label={isDrawerExpanded ? 'Collapse navigation' : 'Expand navigation'}
            >
              {isDrawerExpanded ? <ChevronLeft /> : <ChevronRight />}
            </button>
            <div className="sidebar-user">
              <UserCircle />
              <div>
                <span className="su-name">{profile.user.displayName}</span>
                <span className="su-role">{profile.roles[0]}</span>
              </div>
            </div>
            <nav className="sidebar-nav">
              <button className={`nav-link${activeSection === 'dashboard' ? ' active' : ''}`} onClick={() => setActiveSection('dashboard')}>
                <LayoutDashboard /><span>Dashboard</span>
              </button>
              <div className="nav-accordion">
                <button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('organizations')}>
                  <Server /><span>Organizations</span>
                  {openAccordions.has('organizations') ? <ChevronDown /> : <ChevronRight />}
                </button>
                {openAccordions.has('organizations') && (
                  <div className="nav-accordion-children">
                    <button className={`nav-link child${activeSection === 'organizations' ? ' active' : ''}`} onClick={() => setActiveSection('organizations')}><span>Tenants / Partners</span></button>
                    <button className={`nav-link child${activeSection === 'instances' ? ' active' : ''}`} onClick={() => setActiveSection('instances')}><span>Instances</span></button>
                  </div>
                )}
              </div>

              <div className="nav-accordion">
                <button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('security')}>
                  <ShieldCheck /><span>Security</span>
                  {openAccordions.has('security') ? <ChevronDown /> : <ChevronRight />}
                </button>
                {openAccordions.has('security') && (
                  <div className="nav-accordion-children">
                    <button className={`nav-link child${activeSection === 'users' ? ' active' : ''}`} onClick={() => setActiveSection('users')}><span>Users</span></button>
                    <button className={`nav-link child${activeSection === 'user-groups' ? ' active' : ''}`} onClick={() => setActiveSection('user-groups')}><span>User Groups</span></button>
                    <button className={`nav-link child${activeSection === 'roles' ? ' active' : ''}`} onClick={() => setActiveSection('roles')}><span>Roles</span></button>
                  </div>
                )}
              </div>

              <div className="nav-accordion">
                <button className="nav-link nav-accordion-toggle" onClick={() => toggleAccordion('settings')}>
                  <Settings /><span>Settings</span>
                  {openAccordions.has('settings') ? <ChevronDown /> : <ChevronRight />}
                </button>
                {openAccordions.has('settings') && (
                  <div className="nav-accordion-children">
                    <button className={`nav-link child${activeSection === 'settings-general' ? ' active' : ''}`} onClick={() => setActiveSection('settings-general')}><span>General</span></button>
                    <button className={`nav-link child${activeSection === 'settings-advanced' ? ' active' : ''}`} onClick={() => setActiveSection('settings-advanced')}><span>Advanced</span></button>
                  </div>
                )}
              </div>
            </nav>
            <button className="sidebar-logout" onClick={handleLogout}><LogOut /><span>Sign out</span></button>
          </aside>

          <section className={`admin-content ${activeSection === 'users' || activeSection === 'user-groups' ? 'grid-section' : ''}`}>
            <div className="page-header">
              <p className="eyebrow small">{sectionMeta.eyebrow}</p>
              <h2>{sectionMeta.heading}</h2>
            </div>

            {activeSection === 'dashboard' && (
              <div className="dashboard-metrics">
                <div className="metric"><strong>{groups.length}</strong><span>User Groups</span></div>
                <div className="metric"><strong>{users.length}</strong><span>Users</span></div>
                <div className="metric"><strong>0</strong><span>Organizations</span></div>
              </div>
            )}

            {activeSection === 'organizations' && (
              <article className="panel"><p className="panel-copy">Milestone 2 will add tenant and partner organization management here.</p></article>
            )}

            {activeSection === 'instances' && (
              <article className="panel"><p className="panel-copy">Milestone 2 will add OxyGen instance enrollment, connectivity tests, and status monitoring here.</p></article>
            )}

            {activeSection === 'user-groups' && isSystemAdmin && (
              <article className="panel data-panel kendo-data-panel">
                <div className="dp-head">
                  <Button className="btn-create" onClick={() => setModal({ kind: 'group' })} type="button" themeColor="primary"><Plus /> Create "Group"</Button>
                </div>
                <Grid
                  className="cms-kendo-grid"
                  data={processedGroups}
                  sortable
                  filterable
                  resizable
                  {...groupGridState}
                  onDataStateChange={handleGroupGridStateChange}
                >
                  <GridColumn title="" width="52px" filterable={false} sortable={false} cells={{ data: GroupEditCell }} />
                  <GridColumn field="name" title="Name" filter="text" />
                  <GridColumn field="description" title="Description" filter="text" />
                  <GridColumn title="" width="52px" filterable={false} sortable={false} cells={{ data: GroupDeleteCell }} />
                </Grid>
              </article>
            )}

            {activeSection === 'users' && isSystemAdmin && (
              <article className="panel data-panel kendo-data-panel">
                <div className="dp-head">
                  <Button className="btn-create" onClick={() => setModal({ kind: 'user' })} type="button" themeColor="primary"><Plus /> Create "User"</Button>
                </div>
                <Grid
                  className="cms-kendo-grid"
                  data={processedUsers}
                  sortable
                  filterable
                  resizable
                  {...userGridState}
                  onDataStateChange={handleUserGridStateChange}
                >
                  <GridColumn title="" width="52px" filterable={false} sortable={false} cells={{ data: UserEditCell }} />
                  <GridColumn field="displayName" title="Name" filter="text" />
                  <GridColumn field="email" title="Email" filter="text" />
                  <GridColumn field="role" title="Role" filter="text" />
                  <GridColumn title="" width="52px" filterable={false} sortable={false} cells={{ data: UserDeleteCell }} />
                </Grid>
              </article>
            )}

            {activeSection === 'roles' && (
              <article className="panel"><p className="panel-copy">Role management coming in later milestones.</p></article>
            )}
            {activeSection === 'settings-general' && (
              <article className="panel"><p className="panel-copy">General settings coming in later milestones.</p></article>
            )}
            {activeSection === 'settings-advanced' && (
              <article className="panel"><p className="panel-copy">Advanced settings coming in later milestones.</p></article>
            )}
          </section>
        </div>
      )}

      {modal && (
        <Dialog
          className="cms-dialog"
          title={modal.kind === 'user' ? (modal.data ? 'Edit User' : 'Create User') : modal.data ? 'Edit Group' : 'Create Group'}
          onClose={() => setModal(null)}
          width={520}
        >
          {modal.kind === 'user' ? (
            <form className="modal-form" onSubmit={handleCreateUser}>
              <label>Email<input name="email" type="email" placeholder="operator@example.com" defaultValue={(modal.data as UserProfile)?.user.email || ''} required /></label>
              <label>Display name<input name="displayName" placeholder="Operator" defaultValue={(modal.data as UserProfile)?.user.displayName || ''} required /></label>
              <label>Password<input name="password" type="password" minLength={12} placeholder="12+ characters" required={!modal.data} /></label>
              <label>Role
                <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as RoleName)}>
                  {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>Group
                <select value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
                  <option value="">None</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <DialogActionsBar>
                <Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button>
                <Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button>
              </DialogActionsBar>
            </form>
          ) : (
            <form className="modal-form" onSubmit={handleCreateGroup}>
              <label>Name<input name="name" placeholder="Customer Group A" defaultValue={(modal.data as Group)?.name || ''} required /></label>
              <label>Description<input name="description" placeholder="Optional" defaultValue={(modal.data as Group)?.description || ''} /></label>
              <DialogActionsBar>
                <Button type="button" fillMode="flat" onClick={() => setModal(null)}>Cancel</Button>
                <Button type="submit" themeColor="primary">{modal.data ? 'Save' : 'Create'}</Button>
              </DialogActionsBar>
            </form>
          )}
        </Dialog>
      )}

      {(message || error) && <p className={error ? 'status error' : 'status'}>{error || message}</p>}
    </main>
  );
}
