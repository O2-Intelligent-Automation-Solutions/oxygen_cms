import { useEffect, useMemo, useState } from 'react';
import { Grid, GridColumn, type GridCellProps, type GridDataStateChangeEvent, type GridRowClickEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { getWorkflowEventGrid, getWorkflowEventSchema, recordValue } from './api';
import { schemaColumns, triggerIdField, workflowEventIdField, workflowEventStatusField } from './schemaColumns';

type WorkflowEventGridProps = {
  instanceId: string;
  token: string;
  triggerSchema: ProcessingSchema | null;
  selectedTrigger: ProcessingGridRecord | null;
  selectedWorkflowEvent: ProcessingGridRecord | null;
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

export function WorkflowEventGrid({ instanceId, token, triggerSchema, selectedTrigger, selectedWorkflowEvent, onSelectedWorkflowEventChange }: WorkflowEventGridProps) {
  const [schema, setSchema] = useState<ProcessingSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [{ field: 'Id', dir: 'asc' }] });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        {columns.map((column) => <GridColumn key={String(column.field)} {...column} cells={String(column.field) === workflowEventStatusField(schema) ? { data: StatusCell } : column.cells} />)}
      </Grid>
    </div>
    <section className="processing-selection-strip" aria-live="polite"><strong>Selected workflow event</strong><span>{selectedWorkflowEvent ? `${rowId(schema, selectedWorkflowEvent)} · ${String(recordValue(selectedWorkflowEvent, workflowEventStatusField(schema)) ?? 'Unknown')}` : 'Select a workflow event row to drive the service-event context.'}</span></section>
  </article>;
}
