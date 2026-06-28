import { useEffect, useMemo, useState } from 'react';
import { Grid, GridColumn, type GridCellProps, type GridDataStateChangeEvent, type GridRowClickEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { ChevronDown, ChevronRight, LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { getServiceEventGrid, getServiceEventSchema, recordValue } from './api';
import { schemaColumns, serviceEventIdField, serviceEventStatusField, workflowEventIdField } from './schemaColumns';
import { ChildServiceEventGrid } from './ChildServiceEventGrid';

type ServiceEventGridProps = {
  instanceId: string;
  token: string;
  selectedWorkflowEvent: ProcessingGridRecord | null;
  selectedServiceEvent: ProcessingGridRecord | null;
  onSelectedServiceEventChange: (event: ProcessingGridRecord | null) => void;
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

function hasChildren(row: ProcessingGridRecord) {
  return Boolean(row.HasChild ?? row.hasChild ?? row.ChildEvents ?? row.childEvents);
}

export function ServiceEventGrid({ instanceId, token, selectedWorkflowEvent, selectedServiceEvent, onSelectedServiceEventChange }: ServiceEventGridProps) {
  const [schema, setSchema] = useState<ProcessingSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [] });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const serviceIdentifier = selectedWorkflowEvent ? recordValue(selectedWorkflowEvent, 'ServiceIdentifier') : null;
  const workflowEventId = selectedWorkflowEvent ? recordValue(selectedWorkflowEvent, workflowEventIdField(null)) ?? recordValue(selectedWorkflowEvent, 'WorkflowEventId') : null;
  const columns = useMemo(() => schemaColumns(schema, 'ServiceEvent'), [schema]);
  const selectedId = selectedServiceEvent ? rowId(schema, selectedServiceEvent) : null;

  useEffect(() => {
    if (!serviceIdentifier) {
      setSchema(null);
      setRows([]);
      setTotal(0);
      setExpandedEventId(null);
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
        if (selectedId && !response.data.some((row) => rowId(schema, row) === selectedId)) onSelectedServiceEventChange(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Service event grid request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [instanceId, onSelectedServiceEventChange, refreshKey, schema, search, selectedId, serviceIdentifier, state, token, workflowEventId]);

  function handleRowClick(event: GridRowClickEvent) {
    onSelectedServiceEventChange(event.dataItem as ProcessingGridRecord);
  }

  function ExpandCell(props: GridCellProps) {
    const row = props.dataItem as ProcessingGridRecord;
    const id = rowId(schema, row);
    const expandable = hasChildren(row);
    return <td className="k-table-td processing-expand-cell"><Button className="compact-button processing-expand-button" type="button" fillMode="flat" disabled={!expandable} onClick={(event) => { event.stopPropagation(); setExpandedEventId((current) => current === id ? null : id); onSelectedServiceEventChange(row); }}>{expandedEventId === id ? <ChevronDown /> : <ChevronRight />}{expandable ? 'Children' : '—'}</Button></td>;
  }

  function StatusCell(props: GridCellProps) {
    const value = recordValue(props.dataItem as ProcessingGridRecord, String(props.field ?? serviceEventStatusField(schema)));
    return <td className="k-table-td"><span className={`processing-status-pill ${statusTone(value)}`}>{String(value ?? 'Unknown')}</span></td>;
  }

  const expandedRow = expandedEventId ? rows.find((row) => rowId(schema, row) === expandedEventId) ?? null : null;

  if (!selectedWorkflowEvent || !serviceIdentifier) {
    return <article className="panel processing-trigger-panel processing-service-panel"><div className="processing-grid-toolbar"><div className="processing-grid-toolbar-summary"><strong>Service Events</strong><span>Select a workflow event with a service identifier to load service events.</span></div></div><section className="processing-selection-strip"><strong>No workflow event selected</strong><span>Service events are lazy-loaded only after workflow-event selection.</span></section></article>;
  }

  return <article className="panel processing-trigger-panel processing-service-panel">
    <div className="processing-grid-toolbar">
      <div className="processing-grid-toolbar-summary"><strong>{String(serviceIdentifier).toUpperCase()} Service Events</strong><span>{total.toLocaleString()} matching rows · workflow event {String(workflowEventId ?? 'unknown')} · parent rows only</span></div>
      <label className="processing-inline-filter"><span>Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setState((current) => ({ ...current, skip: 0 })); }} placeholder="Workflow, trigger, event, service, job, status" /></label>
      <Button className="compact-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}><RotateCw /> Refresh Service Events</Button>
    </div>
    {schemaError && <p className="panel-copy warning">{schemaError}</p>}
    {error && <p className="panel-copy warning">{error}</p>}
    <div className="processing-grid-scroll">
      {loading && <div className="cms-loading-overlay grid-loading-overlay" role="status" aria-live="polite"><LoaderCircle className="cms-loading-spinner" /><span>Loading service event page…</span></div>}
      <Grid
        className="cms-kendo-grid processing-kendo-grid processing-service-grid"
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
        dataItemKey={serviceEventIdField(schema)}
        selectable={{ enabled: true, mode: 'single' }}
        onRowClick={handleRowClick}
        onDataStateChange={(event: GridDataStateChangeEvent) => setState({ skip: event.dataState.skip ?? 0, take: event.dataState.take ?? 50, sort: event.dataState.sort ?? [], filter: event.dataState.filter })}
      >
        <GridColumn title="Expand" width={120} filterable={false} sortable={false} cells={{ data: ExpandCell }} />
        {columns.map((column) => <GridColumn key={String(column.field)} {...column} cells={String(column.field) === serviceEventStatusField(schema) ? { data: StatusCell } : column.cells} />)}
      </Grid>
    </div>
    <section className="processing-selection-strip" aria-live="polite"><strong>Selected service event</strong><span>{selectedServiceEvent ? `${rowId(schema, selectedServiceEvent)} · ${String(recordValue(selectedServiceEvent, serviceEventStatusField(schema)) ?? 'Unknown')}` : 'Select a service event row to prepare event details.'}</span></section>
    {expandedRow && <ChildServiceEventGrid instanceId={instanceId} serviceIdentifier={String(serviceIdentifier)} token={token} schema={schema} parent={expandedRow} />}
  </article>;
}
