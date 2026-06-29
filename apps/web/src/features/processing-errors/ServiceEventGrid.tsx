import { useEffect, useMemo, useState } from 'react';
import { type GridCellProps, type GridRowClickEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { RotateCw, RotateCcw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { getServiceEventGrid, getServiceEventSchema, recordValue, restoreServiceEvent } from './api';
import { schemaColumns, serviceEventIdField, serviceEventStatusField, workflowEventIdField } from './schemaColumns';
import { ProcessingServerGrid } from './ProcessingServerGrid';
import { ProcessingRowActionMenu } from './ProcessingRowActionMenu';


type ServiceEventGridProps = {
  instanceId: string;
  token: string;
  selectedWorkflowEvent: ProcessingGridRecord | null;
  selectedServiceEvent: ProcessingGridRecord | null;
  canRestoreServiceEvent: boolean;
  onSelectedServiceEventChange: (event: ProcessingGridRecord | null) => void;
  initialSearch?: string;
  initialSelectedServiceEventId?: string;
};

function rowId(schema: ProcessingSchema | null, row: ProcessingGridRecord) {
  const id = recordValue(row, serviceEventIdField(schema));
  return id === null || id === undefined ? JSON.stringify(row) : String(id);
}

function statusTone(status: unknown) {
  const value = String(status ?? '').toLowerCase();
  if (value.includes('error') || value.includes('fail') || value.includes('cancel')) return 'issue';
  if (value.includes('recover') || value.includes('retry') || value.includes('pending') || value.includes('running')) return 'warning';
  if (value.includes('complete') || value.includes('success')) return 'ok';
  return 'unknown';
}


function actionResultMessage(result: unknown, fallback: string) {
  if (typeof result === 'string' && result.trim()) return result;
  return fallback;
}

export function ServiceEventGrid({ instanceId, token, selectedWorkflowEvent, selectedServiceEvent, canRestoreServiceEvent, onSelectedServiceEventChange, initialSearch = '', initialSelectedServiceEventId }: ServiceEventGridProps) {
  const [schema, setSchema] = useState<ProcessingSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [] });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const serviceIdentifier = selectedWorkflowEvent ? recordValue(selectedWorkflowEvent, 'ServiceIdentifier') : null;
  const workflowEventId = selectedWorkflowEvent ? recordValue(selectedWorkflowEvent, workflowEventIdField(null)) ?? recordValue(selectedWorkflowEvent, 'WorkflowEventId') : null;
  const columns = useMemo(() => schemaColumns(schema, 'ServiceEvent'), [schema]);
  const selectedId = selectedServiceEvent ? rowId(schema, selectedServiceEvent) : null;

  useEffect(() => {
    setSearch(initialSearch);
    setState((current) => ({ ...current, skip: 0 }));
  }, [initialSearch]);

  useEffect(() => {
    if (!serviceIdentifier) {
      setSchema(null);
      setRows([]);
      setTotal(0);
      onSelectedServiceEventChange(null);
      return undefined;
    }
    const controller = new AbortController();
    setSchemaError(null);
    getServiceEventSchema(instanceId, String(serviceIdentifier), token, controller.signal)
      .then(setSchema)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSchemaError(err instanceof Error ? err.message : 'Service event schema request failed.');
      });
    return () => controller.abort();
  }, [instanceId, onSelectedServiceEventChange, serviceIdentifier, token]);

  useEffect(() => {
    if (!serviceIdentifier || workflowEventId === null || workflowEventId === undefined) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getServiceEventGrid(instanceId, token, { state, serviceIdentifier: String(serviceIdentifier), workflowEventId: String(workflowEventId), search }, controller.signal)
      .then((response) => {
        setRows(response.data);
        setTotal(response.total);
        if (initialSelectedServiceEventId && selectedId !== initialSelectedServiceEventId) {
          const match = response.data.find((row) => rowId(schema, row) === initialSelectedServiceEventId);
          if (match) {
            onSelectedServiceEventChange(match);
            return;
          }
        }
        if (selectedId && !response.data.some((row) => rowId(schema, row) === selectedId)) onSelectedServiceEventChange(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Service event grid request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [initialSelectedServiceEventId, instanceId, onSelectedServiceEventChange, refreshKey, schema, search, selectedId, serviceIdentifier, state, token, workflowEventId]);

  function handleRowClick(event: GridRowClickEvent) {
    onSelectedServiceEventChange(event.dataItem as ProcessingGridRecord);
  }

  async function handleRestore(row: ProcessingGridRecord) {
    const id = rowId(schema, row);
    if (!serviceIdentifier) return;
    if (!window.confirm(`Restore ${String(serviceIdentifier).toUpperCase()} service event ${id}? This queues a one-row OxyGen restore action.`)) return;
    setActionBusyId(id);
    setActionMessage(null);
    setError(null);
    try {
      const response = await restoreServiceEvent(instanceId, String(serviceIdentifier), id, token);
      setActionMessage(actionResultMessage(response.result, `Service event ${id} restore queued.`));
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Service event restore failed.');
    } finally {
      setActionBusyId(null);
    }
  }


  function ActionCell(props: GridCellProps) {
    const row = props.dataItem as ProcessingGridRecord;
    const id = rowId(schema, row);
    return <td className="k-table-td processing-action-cell"><ProcessingRowActionMenu label={`Actions for service event ${id}`}>{(close) => <Button className="compact-button" type="button" fillMode="flat" disabled={!canRestoreServiceEvent || actionBusyId === id} title={canRestoreServiceEvent ? 'Restore service event' : 'Permission required'} onClick={() => { close(); void handleRestore(row); }}><RotateCcw /> Restore</Button>}</ProcessingRowActionMenu></td>;
  }

  function StatusCell(props: GridCellProps) {
    const value = recordValue(props.dataItem as ProcessingGridRecord, String(props.field ?? serviceEventStatusField(schema)));
    return <td className="k-table-td"><span className={`processing-status-pill ${statusTone(value)}`}>{String(value ?? 'Unknown')}</span></td>;
  }

  if (!selectedWorkflowEvent || !serviceIdentifier) {
    return <article className="panel processing-trigger-panel processing-service-panel"><div className="processing-grid-toolbar"><div className="processing-grid-toolbar-summary"><strong>Service Events</strong><span>Select a workflow event with a service identifier to load service events.</span></div></div><section className="processing-selection-strip"><strong>No workflow event selected</strong><span>Service events are lazy-loaded only after workflow-event selection.</span></section></article>;
  }

  return <article className="panel processing-trigger-panel processing-service-panel">
    <ProcessingServerGrid
      gridKey="processing-service-events"
      title={`${String(serviceIdentifier).toUpperCase()} Service Events`}
      summary={`${total.toLocaleString()} matching rows · workflow event ${String(workflowEventId ?? 'unknown')}`}
      rows={rows}
      total={total}
      state={state}
      onStateChange={setState}
      columns={columns}
      dataItemKey={serviceEventIdField(schema)}
      loading={loading}
      loadingLabel="Loading service event page…"
      actionCell={ActionCell}
      statusField={serviceEventStatusField(schema)}
      statusCell={StatusCell}
      onRowClick={handleRowClick}
      toolbar={<><label className="processing-inline-filter"><span>Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setState((current) => ({ ...current, skip: 0 })); }} placeholder="Workflow, trigger, event, service, job, status" /></label><Button className="compact-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}><RotateCw /> Refresh Service Events</Button></>}
    />
    {schemaError && <p className="panel-copy warning">{schemaError}</p>}
    {actionMessage && <p className="panel-copy success">{actionMessage}</p>}
    {error && <p className="panel-copy warning">{error}</p>}
    <section className="processing-selection-strip" aria-live="polite"><strong>Selected service event</strong><span>{selectedServiceEvent ? `${rowId(schema, selectedServiceEvent)} · ${String(recordValue(selectedServiceEvent, serviceEventStatusField(schema)) ?? 'Unknown')}` : 'Select a service event row to prepare event details.'}</span></section>
  </article>;
}
