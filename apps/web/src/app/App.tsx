import { Activity, Database, Server, ShieldCheck } from 'lucide-react';

const capabilities = [
  { icon: Server, label: 'Instance monitoring', detail: 'Track OxyGen availability, SSL, auth, and API health.' },
  { icon: Activity, label: 'Workflow visibility', detail: 'Surface pending, failed, and recovery workflow triggers.' },
  { icon: Database, label: 'Settings intelligence', detail: 'Query global settings across customer instances.' },
  { icon: ShieldCheck, label: 'Secure access', detail: 'Local authentication, roles, and group-scoped access.' }
];

export function App() {
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
    </main>
  );
}
