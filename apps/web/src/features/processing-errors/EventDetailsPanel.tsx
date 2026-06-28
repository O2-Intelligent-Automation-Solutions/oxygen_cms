import { Fragment, useEffect, useMemo, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Copy, LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord } from './types';
import { getServiceEventDetail, recordValue } from './api';
import { serviceEventIdField } from './schemaColumns';

type EventDetailsPanelProps = {
  instanceId: string;
  token: string;
  serviceIdentifier: string | null;
  selectedServiceEvent: ProcessingGridRecord | null;
};

const GROUPS: Array<{ name: string; fields: string[] }> = [
  { name: 'Workflow', fields: ['WorkflowId', 'WorkflowName', 'WorkflowTriggerId', 'WorkflowEventId'] },
  { name: 'Module', fields: ['ServiceIdentifier', 'ModuleId', 'ModuleName', 'ServiceName'] },
  { name: 'Job', fields: ['JobId', 'JobName', 'Sequence', 'MappedIndexData'] },
  { name: 'Event', fields: ['Id', 'ParentId', 'EventId', 'Status', 'ProcessState', 'ProcessingErorr'] },
  { name: 'Triggered', fields: ['CreatedDate', 'ModifiedDate', 'TriggeredBy', 'TriggeredDate'] },
  { name: 'File', fields: ['FileName', 'Source', 'Destination'] },
  { name: 'Error', fields: ['ErrorMessage', 'LastError', 'StackTrace'] },
  { name: 'Payload', fields: ['Payload', 'OutgoingPayload'] }
];

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

type DetailGroup = { name: string; entries: Array<readonly [string, unknown]> };

function groupedDetails(detail: ProcessingGridRecord | null, advanced: boolean): DetailGroup[] {
  if (!detail) return [];
  const used = new Set<string>();
  const groups: DetailGroup[] = GROUPS.map((group) => {
    const entries = group.fields
      .filter((field) => recordValue(detail, field) !== null)
      .map((field) => {
        used.add(field);
        return [field, recordValue(detail, field)] as const;
      });
    return { name: group.name, entries };
  }).filter((group) => group.entries.length > 0);
  if (advanced) {
    const remaining = Object.entries(detail).filter(([key]) => !used.has(key));
    if (remaining.length) groups.push({ name: 'Advanced', entries: remaining });
  }
  return groups;
}

export function EventDetailsPanel({ instanceId, token, serviceIdentifier, selectedServiceEvent }: EventDetailsPanelProps) {
  const [detail, setDetail] = useState<ProcessingGridRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const eventId = selectedServiceEvent ? recordValue(selectedServiceEvent, serviceEventIdField(null)) : null;
  const groups = useMemo(() => groupedDetails(detail, advanced), [advanced, detail]);

  useEffect(() => {
    if (!serviceIdentifier || eventId === null || eventId === undefined) {
      setDetail(null);
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getServiceEventDetail(instanceId, serviceIdentifier, String(eventId), token, controller.signal)
      .then(setDetail)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Event detail request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [eventId, instanceId, refreshKey, serviceIdentifier, token]);

  async function copyError() {
    const errorText = detail ? displayValue(recordValue(detail, 'ErrorMessage') ?? recordValue(detail, 'LastError') ?? recordValue(detail, 'StackTrace')) : '';
    await navigator.clipboard?.writeText(errorText);
  }

  if (!selectedServiceEvent || !serviceIdentifier) {
    return <article className="panel processing-details-panel"><div className="processing-grid-toolbar"><div className="processing-grid-toolbar-summary"><strong>Event Details</strong><span>Select a service event to load details on demand.</span></div></div><p className="panel-copy small-copy">Details, files, and messages stay lazy. This panel does not fetch remote detail payloads until a service event is selected.</p></article>;
  }

  return <article className="panel processing-details-panel">
    <div className="processing-grid-toolbar">
      <div className="processing-grid-toolbar-summary"><strong>Event Details</strong><span>{serviceIdentifier}:{String(eventId ?? 'unknown')} · loaded on demand</span></div>
      <label className="processing-inline-filter processing-switch-filter"><span>Advanced</span><input type="checkbox" checked={advanced} onChange={(event) => setAdvanced(event.target.checked)} /></label>
      <Button className="compact-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}><RotateCw /> Refresh Details</Button>
    </div>
    {loading && <div className="cms-loading-overlay grid-loading-overlay" role="status" aria-live="polite"><LoaderCircle className="cms-loading-spinner" /><span>Loading event details…</span></div>}
    {error && <p className="panel-copy warning">{error}</p>}
    {detail && <div className="processing-details-body">
      {groups.map((group) => <section key={group.name} className={`processing-detail-group ${group.name === 'Error' ? 'error' : ''}`}>
        <header><p className="eyebrow small">{group.name}</p>{group.name === 'Error' && <Button className="compact-button" type="button" fillMode="flat" onClick={() => void copyError()}><Copy /> Copy Error</Button>}</header>
        <dl className="detail-list processing-selected-detail">
          {group.entries.map(([field, value]) => <Fragment key={`${group.name}-${field}`}><dt>{field}</dt><dd><pre>{displayValue(value)}</pre></dd></Fragment>)}
        </dl>
      </section>)}
    </div>}
    <p className="panel-copy small-copy">File downloads and EMM message viewers remain intentionally deferred to the next guarded details/actions slice; raw content is not fetched until implemented behind typed CMS endpoints and audit-safe handling.</p>
  </article>;
}
