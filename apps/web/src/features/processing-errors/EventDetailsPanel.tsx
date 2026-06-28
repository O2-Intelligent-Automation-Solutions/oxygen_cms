import { Fragment, useEffect, useMemo, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Copy, Download, LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord } from './types';
import { downloadServiceEventFile, getServiceEventDetail, recordValue } from './api';
import { serviceEventIdField } from './schemaColumns';

type EventDetailsPanelProps = {
  instanceId: string;
  token: string;
  serviceIdentifier: string | null;
  selectedServiceEvent: ProcessingGridRecord | null;
  canDownloadServiceEventFile: boolean;
};

type EventFile = {
  FileName: string;
  IsExists?: boolean;
  Location?: string | number;
  LocationString?: string;
  [key: string]: unknown;
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

function normalizeFile(value: unknown): EventFile | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const fileName = record.FileName ?? record.fileName ?? record.Name ?? record.name;
  if (typeof fileName !== 'string' || !fileName.trim()) return null;
  const location = record.Location ?? record.location;
  return {
    ...record,
    FileName: fileName,
    IsExists: typeof record.IsExists === 'boolean' ? record.IsExists : typeof record.isExists === 'boolean' ? record.isExists : undefined,
    Location: typeof location === 'string' || typeof location === 'number' ? location : undefined,
    LocationString: typeof record.LocationString === 'string' ? record.LocationString : typeof record.locationString === 'string' ? record.locationString : undefined
  };
}

function extractFiles(detail: ProcessingGridRecord | null): EventFile[] {
  if (!detail) return [];
  const seen = new Set<string>();
  const files: EventFile[] = [];
  for (const value of Object.values(detail)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const file = normalizeFile(entry);
      if (!file || seen.has(file.FileName)) continue;
      seen.add(file.FileName);
      files.push(file);
    }
  }
  return files.sort((left, right) => `${left.LocationString ?? left.Location ?? ''}`.localeCompare(`${right.LocationString ?? right.Location ?? ''}`) || left.FileName.localeCompare(right.FileName));
}

function fileMeta(file: EventFile) {
  const location = file.LocationString ?? file.Location;
  const exists = file.IsExists === false ? 'missing in OxyGen' : 'available';
  return [location ? `Location ${String(location)}` : null, exists].filter(Boolean).join(' · ');
}

export function EventDetailsPanel({ instanceId, token, serviceIdentifier, selectedServiceEvent, canDownloadServiceEventFile }: EventDetailsPanelProps) {
  const [detail, setDetail] = useState<ProcessingGridRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const eventId = selectedServiceEvent ? recordValue(selectedServiceEvent, serviceEventIdField(null)) : null;
  const groups = useMemo(() => groupedDetails(detail, advanced), [advanced, detail]);
  const files = useMemo(() => extractFiles(detail), [detail]);

  useEffect(() => {
    if (!serviceIdentifier || eventId === null || eventId === undefined) {
      setDetail(null);
      setError(null);
      setDownloadError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDownloadError(null);
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

  async function handleDownload(file: EventFile) {
    if (!serviceIdentifier || eventId === null || eventId === undefined || !canDownloadServiceEventFile || file.IsExists === false) return;
    setDownloadingFile(file.FileName);
    setDownloadError(null);
    try {
      await downloadServiceEventFile(instanceId, serviceIdentifier, String(eventId), file.FileName, token);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Event file download failed.');
    } finally {
      setDownloadingFile(null);
    }
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
    {downloadError && <p className="panel-copy warning">{downloadError}</p>}
    {detail && <div className="processing-details-body">
      {files.length > 0 && <section className="processing-detail-group processing-file-downloads">
        <header><p className="eyebrow small">Files</p><span className="panel-copy small-copy">Downloads use typed CMS endpoints and remain lazy until clicked.</span></header>
        <div className="processing-file-list">
          {files.map((file) => <article key={file.FileName} className="processing-file-row">
            <div><strong>{file.FileName}</strong><small>{fileMeta(file)}</small></div>
            <Button className="compact-button" type="button" fillMode="flat" disabled={!canDownloadServiceEventFile || file.IsExists === false || downloadingFile === file.FileName} onClick={() => void handleDownload(file)}><Download /> {downloadingFile === file.FileName ? 'Downloading…' : 'Download'}</Button>
          </article>)}
        </div>
        {!canDownloadServiceEventFile && <p className="panel-copy small-copy">Your role can view event details but cannot download raw event files.</p>}
      </section>}
      {groups.map((group) => <section key={group.name} className={`processing-detail-group ${group.name === 'Error' ? 'error' : ''}`}>
        <header><p className="eyebrow small">{group.name}</p>{group.name === 'Error' && <Button className="compact-button" type="button" fillMode="flat" onClick={() => void copyError()}><Copy /> Copy Error</Button>}</header>
        <dl className="detail-list processing-selected-detail">
          {group.entries.map(([field, value]) => <Fragment key={`${group.name}-${field}`}><dt>{field}</dt><dd><pre>{displayValue(value)}</pre></dd></Fragment>)}
        </dl>
      </section>)}
    </div>}
    <p className="panel-copy small-copy">EMM message viewers remain deferred to the next guarded details/actions slice; raw message content is not fetched until implemented behind typed CMS endpoints and audit-safe handling.</p>
  </article>;
}
