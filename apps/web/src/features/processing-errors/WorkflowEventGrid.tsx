import { useEffect, useMemo, useState } from 'react';
import { Grid, GridColumn, type GridCellProps, type GridDataStateChangeEvent, type GridRowClickEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { Ban, LoaderCircle, RotateCw, RotateCcw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { cancelWorkflowEvent, getWorkflowEventGrid, getWorkflowEventSchema, recoverWorkflowEvent, recordValue } from './api';
import { schemaColumns, triggerIdField, workflowEventIdField, workflowEventStatusField } from './schemaColumns';

type WorkflowEventGridProps = {
  instanceId: string;
  token: string;
  triggerSchema: ProcessingSchema | null;
  selectedTrigger: ProcessingGridRecord | null;
  selectedWorkflowEvent: ProcessingGridRecord | null;
  canRecoverWorkflowEvent: boolean;
  canCancelWorkflowEvent: boolean;
  onSelectedWorkflowEventChange: (event: ProcessingGridRecord | null) => void;
};

function rowId(schema: ProcessingSchema | null, row: ProcessingGridRecord) {
  const id = recordValue(row, workflowEventIdField(schema));
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

export function WorkflowEventGrid({ instanceId, token, triggerSchema, selectedTrigger, selectedWorkflowEvent, canRecoverWorkflowEvent, canCancelWorkflowEvent, onSelectedWorkflowEventChange }: WorkflowEventGridProps) {
  const [schema, setSchema] = useState<ProcessingSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [{ field: 'Id', dir: 'asc' }] });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const columns = useMemo(() => schemaColumns(schema, 'WorkflowEvent'), [schema]);
  const triggerId = selectedTrigger ? recordValue(selectedTrigger, triggerSchema?.IdColumns?.WorkflowTriggerIdField || triggerIdField(triggerSchema)) : null;
  const selectedId = selectedWorkflowEvent ? rowId(schema, selectedWorkflowEvent) : null;

  useEffect(() => {
    if (!selectedTrigger) {
      setRows([]);
      setTotal(0);
      onSelectedWorkflowEventChange(null);
      return undefined;
    }
    const controller = new AbortController();
    setSchemaError(null);
    getWorkflowEventSchema(instanceId, token, controller.signal)
      .then(setSchema)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSchemaError(err instanceof Error ? err.message : 'Workflow event schema request failed.');
      });
    return () => controller.abort();
  }, [instanceId, onSelectedWorkflowEventChange, selectedTrigger, token]);

  useEffect(() => {
    if (triggerId === null || triggerId === undefined) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getWorkflowEventGrid(instanceId, token, { state, workflowTriggerId: String(triggerId), search }, controller.signal)
      .then((response) => {
        setRows(response.data);
        setTotal(response.total);
        if (selectedId && !response.data.some((row) => rowId(schema, row) === selectedId)) onSelectedWorkflowEventChange(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Workflow event grid request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [instanceId, onSelectedWorkflowEventChange, refreshKey, schema, search, selectedId, state, token, triggerId]);

  function handleRowClick(event: GridRowClickEvent) {
    onSelectedWorkflowEventChange(event.dataItem as ProcessingGridRecord);
  }

  async function handleRecovery(row: ProcessingGridRecord) {
    const id = rowId(schema, row);
    const rowTriggerId = recordValue(row, 'WorkflowTriggerId') ?? triggerId;
    if (rowTriggerId === null || rowTriggerId === undefined) {
      setError('Workflow trigger id is required to recover this event.');
      return;
    }
    if (!window.confirm(`Recover workflow event ${id}? This resumes processing at the selected event destination.`)) return;
    setActionBusyId(id);
    setActionMessage(null);
    setError(null);
    try {
      const response = await recoverWorkflowEvent(instanceId, id, token, String(rowTriggerId));
      setActionMessage(actionResultMessage(response.result, `Workflow event ${id} recovery requested.`));
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workflow event recovery failed.');
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleCancel(row: ProcessingGridRecord) {
    const id = rowId(schema, row);
    const action = window.prompt(`Cancel workflow event ${id}. Choose action: 1=Stop, 2=Reset, 3=Cancel`, '1');
    if (action === null) return;
    const parsed = Number(action);
    if (![1, 2, 3].includes(parsed)) {
      setError('Cancel action must be 1 (Stop), 2 (Reset), or 3 (Cancel).');
      return;
    }
    if (!window.confirm(`Confirm workflow event ${id} cancel action ${parsed}?`)) return;
    setActionBusyId(id);
    setActionMessage(null);
    setError(null);
    try {
      const response = await cancelWorkflowEvent(instanceId, id, token, parsed as 1 | 2 | 3);
      setActionMessage(actionResultMessage(response.result, `Workflow event ${id} cancel action requested.`));
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workflow event cancel failed.');
    } finally {
      setActionBusyId(null);
    }
  }

  function ActionCell(props: GridCellProps) {
    const row = props.dataItem as ProcessingGridRecord;
    const id = rowId(schema, row);
    const status = String(recordValue(row, workflowEventStatusField(schema)) ?? '').toLowerCase();
    const recoverDisabled = status.includes('complete') || status.includes('pending') || status.includes('recover') || status.includes('cancel');
    const cancelDisabled = status.includes('complete') || status.includes('cancel');
    return <td className="k-table-td processing-action-cell">
      <Button className="compact-button" type="button" fillMode="flat" disabled={!canRecoverWorkflowEvent || recoverDisabled || actionBusyId === id} title={canRecoverWorkflowEvent ? 'Recover workflow event' : 'Permission required'} onClick={(event) => { event.stopPropagation(); void handleRecovery(row); }}><RotateCcw /> Recover</Button>
      <Button className="compact-button" type="button" fillMode="flat" disabled={!canCancelWorkflowEvent || cancelDisabled || actionBusyId === id} title={canCancelWorkflowEvent ? 'Cancel workflow event' : 'Permission required'} onClick={(event) => { event.stopPropagation(); void handleCancel(row); }}><Ban /> Cancel</Button>
    </td>;
  }

  function StatusCell(props: GridCellProps) {
    const value = recordValue(props.dataItem as ProcessingGridRecord, String(props.field ?? workflowEventStatusField(schema)));
    return <td className="k-table-td"><span className={`processing-status-pill ${statusTone(value)}`}>{String(value ?? 'Unknown')}</span></td>;
  }

  if (!selectedTrigger) {
    return <article className="panel processing-trigger-panel processing-workflow-panel"><div className="processing-grid-toolbar"><div className="processing-grid-toolbar-summary"><strong>Workflow Events</strong><span>Select a workflow trigger to load its server-paged event grid.</span></div></div><section className="processing-selection-strip"><strong>No trigger selected</strong><span>Workflow events are lazy-loaded only after trigger selection.</span></section></article>;
  }

  return <article className="panel processing-trigger-panel processing-workflow-panel">
    <div className="processing-grid-toolbar">
      <div className="processing-grid-toolbar-summary"><strong>Workflow Events</strong><span>{total.toLocaleString()} matching rows · trigger {String(triggerId ?? 'unknown')} · Id ascending</span></div>
      <label className="processing-inline-filter"><span>Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setState((current) => ({ ...current, skip: 0 })); }} placeholder="Workflow, trigger, service, status" /></label>
      <Button className="compact-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}><RotateCw /> Refresh Events</Button>
    </div>
    {schemaError && <p className="panel-copy warning">{schemaError}</p>}
    {actionMessage && <p className="panel-copy success">{actionMessage}</p>}
    {error && <p className="panel-copy warning">{error}</p>}
    <div className="processing-grid-scroll">
      {loading && <div className="cms-loading-overlay grid-loading-overlay" role="status" aria-live="polite"><LoaderCircle className="cms-loading-spinner" /><span>Loading workflow event page…</span></div>}
      <Grid
        className="cms-kendo-grid processing-kendo-grid processing-workflow-grid"
        data={{ data: rows, total }}
        skip={state.skip}
        take={state.take}
        total={total}
        pageable={{ buttonCount: 5, pageSizes: [25, 50, 100, 250] }}
        sortable
        sort={state.sort}
        filterable
        filter={state.filter}
        scrollable="scrollable"
        dataItemKey={workflowEventIdField(schema)}
        selectable={{ enabled: true, mode: 'single' }}
        onRowClick={handleRowClick}
        onDataStateChange={(event: GridDataStateChangeEvent) => setState({ skip: event.dataState.skip ?? 0, take: event.dataState.take ?? 50, sort: event.dataState.sort ?? [{ field: 'Id', dir: 'asc' }], filter: event.dataState.filter })}
      >
        <GridColumn title="Actions" width={230} filterable={false} sortable={false} cells={{ data: ActionCell }} />
        {columns.map((column) => <GridColumn key={String(column.field)} {...column} cells={String(column.field) === workflowEventStatusField(schema) ? { data: StatusCell } : column.cells} />)}
      </Grid>
    </div>
    <section className="processing-selection-strip" aria-live="polite"><strong>Selected workflow event</strong><span>{selectedWorkflowEvent ? `${rowId(schema, selectedWorkflowEvent)} · ${String(recordValue(selectedWorkflowEvent, workflowEventStatusField(schema)) ?? 'Unknown')}` : 'Select a workflow event row to drive the service-event context.'}</span></section>
  </article>;
}
