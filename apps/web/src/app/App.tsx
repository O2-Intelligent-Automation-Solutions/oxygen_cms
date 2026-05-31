import { Activity, Database, Server, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type RoleName = 'SystemAdmin' | 'PartnerAdmin' | 'Operator' | 'Viewer';

type AuthProfile = {
  user: {
    id: string;
    email: string;
    displayName: string;
    isActive: boolean;
  };
  roles: RoleName[];
  groups: Array<{ id: string; name: string }>;
};

type Group = { id: string; name: string; description: string | null };
type UserProfile = AuthProfile;
type BootstrapStatus = { requiresBootstrap: boolean };

const capabilities = [
  { icon: Server, label: 'Instance monitoring', detail: 'Track OxyGen availability, SSL, auth, and API health.' },
  { icon: Activity, label: 'Workflow visibility', detail: 'Surface pending, failed, and recovery workflow triggers.' },
  { icon: Database, label: 'Settings intelligence', detail: 'Query global settings across customer instances.' },
  { icon: ShieldCheck, label: 'Secure access', detail: 'Local authentication, roles, and group-scoped access.' }
];

const roles: RoleName[] = ['SystemAdmin', 'PartnerAdmin', 'Operator', 'Viewer'];

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
  const [token, setToken] = useState<string>('');
  const [requiresBootstrap, setRequiresBootstrap] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<RoleName>('Operator');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  const isSystemAdmin = useMemo(() => profile?.roles.includes('SystemAdmin') ?? false, [profile]);

  useEffect(() => {
    let active = true;
    api<BootstrapStatus>('/api/auth/bootstrap-status')
      .then((status) => {
        if (active) setRequiresBootstrap(status.requiresBootstrap);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load setup status.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshAdminData(authToken = token) {
    if (!authToken) return;
    const [groupResponse, userResponse] = await Promise.all([
      api<{ groups: Group[] }>('/api/groups', { token: authToken }),
      api<{ users: UserProfile[] }>('/api/users', { token: authToken })
    ]);
    setGroups(groupResponse.groups);
    setUsers(userResponse.users);
    if (!selectedGroupId && groupResponse.groups[0]) setSelectedGroupId(groupResponse.groups[0].id);
  }

  async function handleBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await api<AuthProfile>('/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          displayName: form.get('displayName'),
          password: form.get('password')
        })
      });
      setMessage('Initial setup succeeded. You can now sign in with the administrator account.');
      setRequiresBootstrap(false);
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed.');
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const login = await api<{ token: string } & AuthProfile>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
      });
      setToken(login.token);
      setProfile({ user: login.user, roles: login.roles, groups: login.groups });
      setMessage(`Signed in as ${login.user.displayName}.`);
      if (login.roles.includes('SystemAdmin')) await refreshAdminData(login.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await api<{ group: Group }>('/api/groups', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: form.get('name'), description: form.get('description') })
      });
      setMessage(`Created group ${response.group.name}.`);
      event.currentTarget.reset();
      await refreshAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Group creation failed.');
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await api<UserProfile>('/api/users', {
        method: 'POST',
        token,
        body: JSON.stringify({
          email: form.get('email'),
          displayName: form.get('displayName'),
          password: form.get('password'),
          roleNames: [selectedRole],
          groupIds: selectedGroupId ? [selectedGroupId] : []
        })
      });
      setMessage(`Created user ${response.user.email}.`);
      event.currentTarget.reset();
      await refreshAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User creation failed.');
    }
  }

  function handleLogout() {
    setToken('');
    setProfile(null);
    setGroups([]);
    setUsers([]);
    setMessage('Signed out.');
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">OxyGen CMS</p>
        <h1>Central monitoring for OxyGen BPM deployments.</h1>
        <p className="summary">
          A lightweight management server for monitoring OxyGen health, licensing, global settings,
          and workflow status across partner and customer environments.
        </p>
      </section>

      <section className="cards" aria-label="Phase 1 capabilities">
        {capabilities.map(({ icon: Icon, label, detail }) => (
          <article className="card" key={label}>
            <Icon aria-hidden="true" />
            <h2>{label}</h2>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      {requiresBootstrap === null && <p className="status">Checking CMS setup status…</p>}

      {requiresBootstrap === true && (
        <section className="auth-grid single" aria-label="Initial CMS setup">
          <article className="panel setup-panel">
            <div className="panel-heading">
              <ShieldCheck aria-hidden="true" />
              <div>
                <p className="eyebrow small">Initial CMS setup</p>
                <h2>Create the first administrator</h2>
              </div>
            </div>
            <p className="panel-copy">
              No CMS users exist yet. Create the first local administrator account to finish setup.
              The sign-in screen will be shown after this setup step is complete.
            </p>
            <form onSubmit={handleBootstrap}>
              <label>Administrator email<input name="email" type="email" placeholder="admin@example.com" required /></label>
              <label>Display name<input name="displayName" placeholder="System Admin" required /></label>
              <label>Password<input name="password" type="password" minLength={12} placeholder="12+ characters" required /></label>
              <button type="submit">Create administrator</button>
            </form>
          </article>
        </section>
      )}

      {requiresBootstrap === false && (
        <section className="auth-grid single" aria-label="Authentication and RBAC administration">
          <article className="panel">
            <div className="panel-heading">
              <UserPlus aria-hidden="true" />
              <div>
                <p className="eyebrow small">Secure access</p>
                <h2>Sign in</h2>
              </div>
            </div>
            <form onSubmit={handleLogin}>
              <label>Email<input name="email" type="email" placeholder="admin@example.com" required /></label>
              <label>Password<input name="password" type="password" required /></label>
              <button type="submit">Sign in</button>
            </form>
            {profile && (
              <div className="profile-card">
                <strong>{profile.user.displayName}</strong>
                <span>{profile.user.email}</span>
                <span>Roles: {profile.roles.join(', ')}</span>
                <button className="secondary" type="button" onClick={handleLogout}>Sign out</button>
              </div>
            )}
          </article>
        </section>
      )}

      {(message || error) && <p className={error ? 'status error' : 'status'}>{error || message}</p>}

      {isSystemAdmin && (
        <section className="admin-grid" aria-label="System administration">
          <article className="panel">
            <div className="panel-heading">
              <Users aria-hidden="true" />
              <div>
                <p className="eyebrow small">Groups</p>
                <h2>Create customer group</h2>
              </div>
            </div>
            <form onSubmit={handleCreateGroup}>
              <label>Name<input name="name" placeholder="Customer Group A" required /></label>
              <label>Description<input name="description" placeholder="Optional group description" /></label>
              <button type="submit">Create group</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <UserPlus aria-hidden="true" />
              <div>
                <p className="eyebrow small">Users</p>
                <h2>Create CMS user</h2>
              </div>
            </div>
            <form onSubmit={handleCreateUser}>
              <label>Email<input name="email" type="email" placeholder="operator@example.com" required /></label>
              <label>Display name<input name="displayName" placeholder="Operator User" required /></label>
              <label>Password<input name="password" type="password" minLength={12} required /></label>
              <label>Role
                <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as RoleName)}>
                  {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <label>Group
                <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                  <option value="">No group</option>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <button type="submit">Create user</button>
            </form>
          </article>

          <article className="panel wide">
            <h2>Current groups</h2>
            <div className="list">
              {groups.length === 0 ? <p>No groups created yet.</p> : groups.map((group) => (
                <div className="row" key={group.id}>
                  <strong>{group.name}</strong>
                  <span>{group.description || 'No description'}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide">
            <h2>Current users</h2>
            <div className="list">
              {users.map((entry) => (
                <div className="row" key={entry.user.id}>
                  <strong>{entry.user.displayName}</strong>
                  <span>{entry.user.email}</span>
                  <span>{entry.roles.join(', ')}</span>
                  <span>{entry.groups.map((group) => group.name).join(', ') || 'No groups'}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
