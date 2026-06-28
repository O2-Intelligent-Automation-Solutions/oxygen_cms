import { Fragment, useEffect, useMemo, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Copy, Download, LoaderCircle, Mail, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingQueueEntryDetail, ProcessingMessageAttachment, ProcessingMessageDetails } from './types';
import { downloadBase64Attachment, downloadServiceEventFile, getServiceEventDetail, getServiceEventMessage, getServiceEventMessageSchema, recordValue } from './api';
import { serviceEventIdField } from './schemaColumns';

type EventDetailsPanelProps = {
  instanceId: string;
  token: string;
  serviceIdentifier: string | null;
  selectedServiceEvent: ProcessingGridRecord | null;
  canDownloadServiceEventFile: boolean;
  canViewServiceEventMessage: boolean;
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

function emailLabel(address: unknown) {
  if (!address || typeof address !== 'object') return String(address ?? '—');
  const record = address as { Name?: unknown; Address?: unknown; IsInvalid?: unknown; Message?: unknown };
  const name = typeof record.Name === 'string' && record.Name ? `${record.Name} ` : '';
  const email = typeof record.Address === 'string' && record.Address ? `<${record.Address}>` : '';
  const invalid = record.IsInvalid ? ` (${String(record.Message ?? 'invalid')})` : '';
  return `${name}${email}${invalid}`.trim() || '—';
}

function emailList(addresses: unknown) {
  if (!Array.isArray(addresses)) return '—';
  return addresses.map(emailLabel).join(', ') || '—';
}

function downloadAttachment(attachment: ProcessingMessageAttachment) {
  downloadBase64Attachment(attachment.FileName, attachment.Content, attachment.ContentType || 'application/octet-stream');
}

function MessageSummary({ message, title }: { message: ProcessingMessageDetails | null | undefined; title: string }) {
  if (!message) return null;
  return <section className="processing-detail-group processing-message-details">
    <header><p className="eyebrow small">{title}</p></header>
    <dl className="detail-list processing-selected-detail">
      <dt>From</dt><dd>{emailLabel(message.From)}</dd>
      <dt>To</dt><dd>{emailList(message.To)}</dd>
      <dt>CC</dt><dd>{emailList(message.CC)}</dd>
      <dt>BCC</dt><dd>{emailList(message.BCC)}</dd>
      <dt>Subject</dt><dd>{message.Subject || '—'}</dd>
      <dt>Delivery Receipt</dt><dd>{message.SendDeliveryReceipts ? message.DeliveryReceiptEmail || 'Enabled' : 'No'}</dd>
      <dt>Read Receipt</dt><dd>{message.SendReadReceipts ? message.ReadReceiptEmail || 'Enabled' : 'No'}</dd>
    </dl>
    {message.Attachments?.length ? <div className="processing-file-list processing-attachment-list">
      {message.Attachments.map((attachment) => <article key={attachment.FileName} className="processing-file-row"><div><strong>{attachment.FileName}</strong><small>{attachment.ContentType || 'attachment'}</small></div><Button className="compact-button" type="button" fillMode="flat" onClick={() => downloadAttachment(attachment)}><Download /> Download</Button></article>)}
    </div> : null}
    {message.IsPlainText ? <pre className="processing-message-body">{message.Body || '—'}</pre> : <iframe className="processing-message-frame" title={`${title} body`} sandbox="" srcDoc={message.Body || ''} />}
  </section>;
}

export function EventDetailsPanel({ instanceId, token, serviceIdentifier, selectedServiceEvent, canDownloadServiceEventFile, canViewServiceEventMessage }: EventDetailsPanelProps) {
  const [detail, setDetail] = useState<ProcessingGridRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [message, setMessage] = useState<ProcessingQueueEntryDetail | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const eventId = selectedServiceEvent ? recordValue(selectedServiceEvent, serviceEventIdField(null)) : null;
  const groups = useMemo(() => groupedDetails(detail, advanced), [advanced, detail]);
  const files = useMemo(() => extractFiles(detail), [detail]);

  useEffect(() => {
    if (!serviceIdentifier || eventId === null || eventId === undefined) {
      setDetail(null);
      setError(null);
      setDownloadError(null);
      setMessage(null);
      setMessageError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDownloadError(null);
    setMessage(null);
    setMessageError(null);
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

  async function handleViewMessage() {
    if (!serviceIdentifier || eventId === null || eventId === undefined || !canViewServiceEventMessage) return;
    setMessageLoading(true);
    setMessageError(null);
    try {
      await getServiceEventMessageSchema(instanceId, serviceIdentifier, token);
      const response = await getServiceEventMessage(instanceId, serviceIdentifier, String(eventId), token);
      setMessage(response);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : 'Event message request failed.');
    } finally {
      setMessageLoading(false);
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
      {String(serviceIdentifier).toUpperCase() === 'EMM' && <section className="processing-detail-group processing-message-shell">
        <header><p className="eyebrow small">Message</p><Button className="compact-button" type="button" fillMode="flat" disabled={!canViewServiceEventMessage || messageLoading} onClick={() => void handleViewMessage()}><Mail /> {messageLoading ? 'Loading…' : message ? 'Refresh Message' : 'View Message'}</Button></header>
        {!canViewServiceEventMessage && <p className="panel-copy small-copy">Your role can view event details but cannot view raw EMM message content.</p>}
        {messageError && <p className="panel-copy warning">{messageError}</p>}
        {message && <>
          <dl className="detail-list processing-selected-detail"><dt>Status</dt><dd>{String(message.Status ?? '—')}</dd><dt>Queue ID</dt><dd>{String(message.QueueId ?? '—')}</dd><dt>Last Edit</dt><dd>{String(message.LastEditDate ?? '—')}</dd></dl>
          <MessageSummary title="Current Message" message={message.Message} />
          {message.OriginalMessage && <MessageSummary title="Original Message" message={message.OriginalMessage} />}
        </>}
      </section>}
      {groups.map((group) => <section key={group.name} className={`processing-detail-group ${group.name === 'Error' ? 'error' : ''}`}>
        <header><p className="eyebrow small">{group.name}</p>{group.name === 'Error' && <Button className="compact-button" type="button" fillMode="flat" onClick={() => void copyError()}><Copy /> Copy Error</Button>}</header>
        <dl className="detail-list processing-selected-detail">
          {group.entries.map(([field, value]) => <Fragment key={`${group.name}-${field}`}><dt>{field}</dt><dd><pre>{displayValue(value)}</pre></dd></Fragment>)}
        </dl>
      </section>)}
    </div>}
    <p className="panel-copy small-copy">Message editing, queue reset/cancel, bulk actions, and non-EMM message surfaces remain deferred to later guarded slices; raw message content is loaded only behind typed CMS endpoints and named permissions.</p>
  </article>;
}
