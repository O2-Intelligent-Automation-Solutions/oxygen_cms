import { useEffect, useMemo, useState } from 'react';
import { Grid, GridColumn, type GridCellProps, type GridDataStateChangeEvent, type GridRowClickEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { ChevronDown, ChevronRight, LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingFilterPreset, ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { getTriggerGrid, recordValue } from './api';
import { schemaColumns, triggerIdField, triggerStatusField } from './schemaColumns';
import { ChildTriggerGrid } from './ChildTriggerGrid';

type TriggerGridProps = {
  instanceId: string;
  token: string;
  schema: ProcessingSchema | null;
  selectedTrigger: ProcessingGridRecord | null;
  onSelectedTriggerChange: (trigger: ProcessingGridRecord | null) => void;
  onLoaded: (timestamp: string) => void;
};

function rowId(schema: ProcessingSchema | null, row: ProcessingGridRecord) {
  const id = recordValue(row, triggerIdField(schema));
  return id === null || id === undefined ? JSON.stringify(row) : String(id);
}

function hasChildren(row: ProcessingGridRecord) {
  const childTriggers = row.ChildTriggers ?? row.childTriggers;
  return Boolean((row.IsParent ?? row.isParent) && (childTriggers === true || Number(childTriggers) > 0));
}

function statusTone(status: unknown) {
  const value = String(status ?? '').toLowerCase();
  if (value.includes('error') || value.includes('fail') || value.includes('cancel')) return 'issue';
  if (value.includes('recover') || value.includes('retry') || value.includes('pending') || value.includes('running')) return 'warning';
  if (value.includes('complete') || value.includes('success')) return 'ok';
  return 'unknown';
}

export function TriggerGrid({ instanceId, token, schema, selectedTrigger, onSelectedTriggerChange, onLoaded }: TriggerGridProps) {
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [] });
  const [preset, setPreset] = useState<ProcessingFilterPreset>('active-errors');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedTriggerId, setExpandedTriggerId] = useState<string | null>(null);
  const columns = useMemo(() => schemaColumns(schema, 'Parent'), [schema]);
  const selectedId = selectedTrigger ? rowId(schema, selectedTrigger) : null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTriggerGrid(instanceId, token, { state, preset, search }, controller.signal)
      .then((response) => {
        setRows(response.data);
        setTotal(response.total);
        onLoaded(new Date().toISOString());
        if (selectedId && !response.data.some((row) => rowId(schema, row) === selectedId)) onSelectedTriggerChange(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Trigger grid request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [instanceId, onLoaded, onSelectedTriggerChange, preset, refreshKey, schema, search, selectedId, state, token]);

  function handleRowClick(event: GridRowClickEvent) {
    onSelectedTriggerChange(event.dataItem as ProcessingGridRecord);
  }

  function ExpandCell(props: GridCellProps) {
    const row = props.dataItem as ProcessingGridRecord;
    const id = rowId(schema, row);
    const expandable = hasChildren(row);
    return <td className="k-table-td processing-expand-cell">
      <Button className="compact-button processing-expand-button" type="button" fillMode="flat" disabled={!expandable} onClick={(event) => { event.stopPropagation(); setExpandedTriggerId((current) => current === id ? null : id); onSelectedTriggerChange(row); }}>
        {expandedTriggerId === id ? <ChevronDown /> : <ChevronRight />}{expandable ? 'Children' : '—'}
      </Button>
    </td>;
  }

  function StatusCell(props: GridCellProps) {
    const value = recordValue(props.dataItem as ProcessingGridRecord, String(props.field ?? triggerStatusField(schema)));
    return <td className="k-table-td"><span className={`processing-status-pill ${statusTone(value)}`}>{String(value ?? 'Unknown')}</span></td>;
  }

  const expandedRow = expandedTriggerId ? rows.find((row) => rowId(schema, row) === expandedTriggerId) ?? null : null;

  return <article className="panel processing-trigger-panel">
    <div className="processing-grid-toolbar">
      <div className="processing-grid-toolbar-summary"><strong>Workflow Triggers</strong><span>{total.toLocaleString()} matching rows · server-paged</span></div>
      <label className="processing-inline-filter"><span>Default scope</span><select value={preset} onChange={(event) => { setPreset(event.target.value as ProcessingFilterPreset); setState((current) => ({ ...current, skip: 0 })); }}><option value="active-errors">Active / Error / Recovery</option><option value="recent">Recent records</option><option value="all-visible">All visible parents</option></select></label>
      <label className="processing-inline-filter"><span>Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setState((current) => ({ ...current, skip: 0 })); }} placeholder="Workflow, trigger, service, job, status" /></label>
      <Button className="compact-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}><RotateCw /> Refresh</Button>
    </div>
    {error && <p className="panel-copy warning">{error}</p>}
    <div className="processing-grid-scroll">
      {loading && <div className="cms-loading-overlay grid-loading-overlay" role="status" aria-live="polite"><LoaderCircle className="cms-loading-spinner" /><span>Loading Processing Errors trigger page…</span></div>}
      <Grid
        className="cms-kendo-grid processing-kendo-grid"
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
        dataItemKey={triggerIdField(schema)}
        selectable={{ enabled: true, mode: 'single' }}
        onRowClick={handleRowClick}
        onDataStateChange={(event: GridDataStateChangeEvent) => setState({ skip: event.dataState.skip ?? 0, take: event.dataState.take ?? 50, sort: event.dataState.sort ?? [], filter: event.dataState.filter })}
      >
        <GridColumn title="Expand" width={120} filterable={false} sortable={false} cells={{ data: ExpandCell }} />
        {columns.map((column) => <GridColumn key={String(column.field)} {...column} cells={String(column.field) === triggerStatusField(schema) ? { data: StatusCell } : column.cells} />)}
      </Grid>
    </div>
    <section className="processing-selection-strip" aria-live="polite"><strong>Selected trigger</strong><span>{selectedTrigger ? `${rowId(schema, selectedTrigger)} · ${String(recordValue(selectedTrigger, triggerStatusField(schema)) ?? 'Unknown')}` : 'Select a trigger row to drive downstream Processing Errors panes.'}</span></section>
    {expandedRow && <ChildTriggerGrid instanceId={instanceId} token={token} schema={schema} parent={expandedRow} />}
  </article>;
}
