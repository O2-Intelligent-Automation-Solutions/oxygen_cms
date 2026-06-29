import { useCallback, useEffect, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { ChevronLeft, ExternalLink, LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingSchema } from './types';
import { getTriggerSchema, recordValue } from './api';
import { TriggerGrid } from './TriggerGrid';
import { WorkflowEventGrid } from './WorkflowEventGrid';
import { ServiceEventGrid } from './ServiceEventGrid';
import { EventDetailsPanel } from './EventDetailsPanel';
import { serviceEventIdField, serviceEventStatusField, triggerIdField, triggerStatusField, workflowEventIdField, workflowEventStatusField } from './schemaColumns';

type InvestigationPane = 'workflow' | 'service' | 'details';

export type ProcessingErrorsDeepLink = {
  targetPane?: InvestigationPane;
  triggerId?: string;
  workflowEventId?: string;
  serviceEventId?: string;
};

type ProcessingErrorsPageProps = {
  instance: {
    id: string;
    name: string;
    host: string;
    launchUrl: string;
  };
  token: string;
  permissions: string[];
  onBackToInstance: () => void;
  backLabel?: string;
  initialSearch?: string;
  initialFocus?: ProcessingErrorsDeepLink | null;
};

function formatDateTime(value: string | null) {
  if (!value) return 'Not loaded yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function ProcessingErrorsPage({ instance, token, permissions, onBackToInstance, backLabel = 'Back to Instance', initialSearch = '', initialFocus = null }: ProcessingErrorsPageProps) {
  const [schema, setSchema] = useState<ProcessingSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaRefreshKey, setSchemaRefreshKey] = useState(0);
  const [selectedTrigger, setSelectedTrigger] = useState<ProcessingGridRecord | null>(null);
  const [selectedWorkflowEvent, setSelectedWorkflowEvent] = useState<ProcessingGridRecord | null>(null);
  const [selectedServiceEvent, setSelectedServiceEvent] = useState<ProcessingGridRecord | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<InvestigationPane>('workflow');

  useEffect(() => {
    const controller = new AbortController();
    setSchemaLoading(true);
    setSchemaError(null);
    getTriggerSchema(instance.id, token, controller.signal)
      .then(setSchema)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSchemaError(err instanceof Error ? err.message : 'Unable to load Processing Errors trigger schema.');
      })
      .finally(() => setSchemaLoading(false));
    return () => controller.abort();
  }, [instance.id, schemaRefreshKey, token]);

  useEffect(() => {
    setSelectedTrigger(null);
    setSelectedWorkflowEvent(null);
    setSelectedServiceEvent(null);
    setActivePane(initialFocus?.targetPane === 'service' || initialFocus?.targetPane === 'details' ? 'workflow' : initialFocus?.targetPane ?? 'workflow');
  }, [initialFocus?.serviceEventId, initialFocus?.targetPane, initialFocus?.triggerId, initialFocus?.workflowEventId]);

  const handleLoaded = useCallback((timestamp: string) => setLastLoadedAt(timestamp), []);
  const handleSelectedTriggerChange = useCallback((trigger: ProcessingGridRecord | null) => {
    setSelectedTrigger(trigger);
    setSelectedWorkflowEvent(null);
    setSelectedServiceEvent(null);
    setActivePane('workflow');
  }, []);
  const handleSelectedWorkflowEventChange = useCallback((event: ProcessingGridRecord | null) => {
    setSelectedWorkflowEvent(event);
    setSelectedServiceEvent(null);
    if (event) setActivePane('service');
  }, []);
  const handleSelectedServiceEventChange = useCallback((event: ProcessingGridRecord | null) => {
    setSelectedServiceEvent(event);
    if (event) setActivePane('details');
  }, []);
  const actionPermissions = {
    canCancelTrigger: permissions.includes('processing.errors.cancelTrigger'),
    canRecoverWorkflowEvent: permissions.includes('processing.errors.recoverWorkflowEvent'),
    canCancelWorkflowEvent: permissions.includes('processing.errors.cancelWorkflowEvent'),
    canRestoreServiceEvent: permissions.includes('processing.errors.restoreServiceEvent'),
    canDownloadServiceEventFile: permissions.includes('processing.errors.downloadServiceEventFile'),
    canViewServiceEventMessage: permissions.includes('processing.errors.viewServiceEventMessage')
  };
  const selectedServiceIdentifier = selectedWorkflowEvent ? String(recordValue(selectedWorkflowEvent, 'ServiceIdentifier') ?? '') || null : null;

  return <section className="processing-errors-page native-processing-errors" aria-label="Processing Errors">
    <header className="processing-errors-page-head native-processing-head">
      <div className="processing-errors-title-block">
        <Button className="compact-button processing-back-button" type="button" fillMode="flat" onClick={onBackToInstance}><ChevronLeft /> {backLabel}</Button>
        <p className="eyebrow small">Processing Errors</p>
        <h2>{instance.name}</h2>
        <small className="dashboard-refresh-stamp">{instance.host} · Last grid load: {formatDateTime(lastLoadedAt)}</small>
      </div>
      <div className="workflow-errors-page-actions processing-errors-page-actions">
        <Button className="compact-button" type="button" fillMode="flat" onClick={() => setSchemaRefreshKey((value) => value + 1)}><RotateCw /> Refresh</Button>
        <Button className="compact-button" type="button" fillMode="flat" onClick={() => window.open(instance.launchUrl, '_blank', 'noopener,noreferrer')}><ExternalLink /> OxyGen</Button>
      </div>
    </header>

    {schemaLoading && !schema && <article className="panel processing-loading-panel"><LoaderCircle className="cms-loading-spinner" /><span>Loading OxyGen trigger schema…</span></article>}
    {schemaError && <article className="panel processing-error-panel"><strong>Processing Errors schema unavailable</strong><p>{schemaError}</p></article>}

    <TriggerGrid instanceId={instance.id} token={token} schema={schema} selectedTrigger={selectedTrigger} canCancelTrigger={actionPermissions.canCancelTrigger} onSelectedTriggerChange={handleSelectedTriggerChange} onLoaded={handleLoaded} initialSearch={initialSearch} initialSelectedTriggerId={initialFocus?.triggerId} />

    <section className="processing-investigation-workspace" aria-label="Processing Errors investigation workspace">
      <div className="processing-investigation-main">
        <div className="processing-investigation-tabs" role="tablist" aria-label="Investigation panes">
          <button type="button" role="tab" aria-selected={activePane === 'workflow'} className={activePane === 'workflow' ? 'active' : ''} onClick={() => setActivePane('workflow')}>Workflow Events</button>
          <button type="button" role="tab" aria-selected={activePane === 'service'} className={activePane === 'service' ? 'active' : ''} disabled={!selectedWorkflowEvent} onClick={() => setActivePane('service')}>Service Events</button>
          <button type="button" role="tab" aria-selected={activePane === 'details'} className={activePane === 'details' ? 'active' : ''} disabled={!selectedServiceEvent} onClick={() => setActivePane('details')}>Event Details</button>
        </div>
        {activePane === 'workflow' && <WorkflowEventGrid instanceId={instance.id} token={token} triggerSchema={schema} selectedTrigger={selectedTrigger} selectedWorkflowEvent={selectedWorkflowEvent} canRecoverWorkflowEvent={actionPermissions.canRecoverWorkflowEvent} canCancelWorkflowEvent={actionPermissions.canCancelWorkflowEvent} onSelectedWorkflowEventChange={handleSelectedWorkflowEventChange} initialSearch={initialFocus?.workflowEventId ?? ''} initialSelectedWorkflowEventId={initialFocus?.workflowEventId} />}
        {activePane === 'service' && <ServiceEventGrid instanceId={instance.id} token={token} selectedWorkflowEvent={selectedWorkflowEvent} selectedServiceEvent={selectedServiceEvent} canRestoreServiceEvent={actionPermissions.canRestoreServiceEvent} onSelectedServiceEventChange={handleSelectedServiceEventChange} initialSearch={initialFocus?.serviceEventId ?? ''} initialSelectedServiceEventId={initialFocus?.serviceEventId} />}
        {activePane === 'details' && <EventDetailsPanel instanceId={instance.id} token={token} serviceIdentifier={selectedServiceIdentifier} selectedServiceEvent={selectedServiceEvent} canDownloadServiceEventFile={actionPermissions.canDownloadServiceEventFile} canViewServiceEventMessage={actionPermissions.canViewServiceEventMessage} />}
      </div>

      <aside className="panel processing-selected-panel" aria-label="Selected investigation context">
      <div><p className="eyebrow small">Selected Trigger</p><h3>{selectedTrigger ? `Trigger ${String(recordValue(selectedTrigger, triggerIdField(schema)) ?? 'unknown')}` : 'No trigger selected'}</h3></div>
      {selectedTrigger ? <dl className="detail-list processing-selected-detail"><dt>Status</dt><dd>{String(recordValue(selectedTrigger, triggerStatusField(schema)) ?? 'Unknown')}</dd><dt>Workflow</dt><dd>{String(recordValue(selectedTrigger, schema?.IdColumns?.WorkflowNameField || 'WorkflowName') ?? '—')}</dd><dt>Workflow ID</dt><dd>{String(recordValue(selectedTrigger, schema?.IdColumns?.WorkflowIdField || 'WorkflowId') ?? '—')}</dd><dt>Service</dt><dd>{String(recordValue(selectedTrigger, schema?.IdColumns?.ServiceIdentifierField || 'ServiceIdentifier') ?? recordValue(selectedTrigger, 'SourceIdentifier') ?? '—')}</dd><dt>Job ID</dt><dd>{String(recordValue(selectedTrigger, schema?.IdColumns?.JobIdField || 'JobId') ?? '—')}</dd></dl> : <p className="panel-copy small-copy">Select a trigger row to load the read-only workflow-event drilldown pane.</p>}
      <div className="processing-selected-divider" />
      <div><p className="eyebrow small">Selected Workflow Event</p><h3>{selectedWorkflowEvent ? `Event ${String(recordValue(selectedWorkflowEvent, workflowEventIdField(null)) ?? 'unknown')}` : 'No workflow event selected'}</h3></div>
      {selectedWorkflowEvent ? <dl className="detail-list processing-selected-detail"><dt>Status</dt><dd>{String(recordValue(selectedWorkflowEvent, workflowEventStatusField(null)) ?? 'Unknown')}</dd><dt>Service</dt><dd>{String(recordValue(selectedWorkflowEvent, 'ServiceIdentifier') ?? '—')}</dd><dt>Service Event ID</dt><dd>{String(recordValue(selectedWorkflowEvent, 'ServiceEventId') ?? '—')}</dd><dt>Last Error</dt><dd>{String(recordValue(selectedWorkflowEvent, 'LastError') ?? '—')}</dd></dl> : <p className="panel-copy small-copy">Select a workflow event row to prepare the read-only Milestone 4 service-event pane.</p>}
      <div className="processing-selected-divider" />
      <div><p className="eyebrow small">Selected Service Event</p><h3>{selectedServiceEvent ? `Event ${String(recordValue(selectedServiceEvent, serviceEventIdField(null)) ?? 'unknown')}` : 'No service event selected'}</h3></div>
      {selectedServiceEvent ? <dl className="detail-list processing-selected-detail"><dt>Status</dt><dd>{String(recordValue(selectedServiceEvent, serviceEventStatusField(null)) ?? 'Unknown')}</dd><dt>Workflow Event ID</dt><dd>{String(recordValue(selectedServiceEvent, 'WorkflowEventId') ?? '—')}</dd><dt>Job ID</dt><dd>{String(recordValue(selectedServiceEvent, 'JobId') ?? '—')}</dd><dt>Error</dt><dd>{String(recordValue(selectedServiceEvent, 'ErrorMessage') ?? recordValue(selectedServiceEvent, 'LastError') ?? '—')}</dd></dl> : <p className="panel-copy small-copy">Select a service event row to prepare the read-only Milestone 5 details panel.</p>}
      </aside>
    </section>
  </section>;
}
