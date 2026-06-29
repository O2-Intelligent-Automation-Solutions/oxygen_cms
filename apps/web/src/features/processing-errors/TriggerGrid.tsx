import { useEffect, useMemo, useState } from 'react';
import { type GridCellProps, type GridRowClickEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { Ban, RotateCw } from 'lucide-react';
import { ProcessingRowActionMenu } from './ProcessingRowActionMenu';
import type { ProcessingFilterPreset, ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { cancelTrigger, getTriggerGrid, recordValue } from './api';
import { schemaColumns, triggerIdField, triggerStatusField } from './schemaColumns';
import { ProcessingServerGrid } from './ProcessingServerGrid';


type TriggerGridProps = {
  instanceId: string;
  token: string;
  schema: ProcessingSchema | null;
  selectedTrigger: ProcessingGridRecord | null;
  canCancelTrigger: boolean;
  onSelectedTriggerChange: (trigger: ProcessingGridRecord | null) => void;
  onLoaded: (timestamp: string) => void;
  initialSearch?: string;
  initialSelectedTriggerId?: string;
};

function rowId(schema: ProcessingSchema | null, row: ProcessingGridRecord) {
  const id = recordValue(row, triggerIdField(schema));
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

export function TriggerGrid({ instanceId, token, schema, selectedTrigger, canCancelTrigger, onSelectedTriggerChange, onLoaded, initialSearch = '', initialSelectedTriggerId }: TriggerGridProps) {
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [] });
  const [preset, setPreset] = useState<ProcessingFilterPreset>('active-failed-recovery');
  const [search, setSearch] = useState(initialSearch);
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const columns = useMemo(() => schemaColumns(schema, 'Parent'), [schema]);
  const selectedId = selectedTrigger ? rowId(schema, selectedTrigger) : null;

  useEffect(() => {
    setSearch(initialSearch);
    setState((current) => ({ ...current, skip: 0 }));
  }, [initialSearch]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTriggerGrid(instanceId, token, { state, preset, search }, controller.signal)
      .then((response) => {
        setRows(response.data);
        setTotal(response.total);
        onLoaded(new Date().toISOString());
        if (initialSelectedTriggerId && selectedId !== initialSelectedTriggerId) {
          const match = response.data.find((row) => rowId(schema, row) === initialSelectedTriggerId);
          if (match) {
            onSelectedTriggerChange(match);
            return;
          }
        }
        if (selectedId && !response.data.some((row) => rowId(schema, row) === selectedId)) onSelectedTriggerChange(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Trigger grid request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [initialSelectedTriggerId, instanceId, onLoaded, onSelectedTriggerChange, preset, refreshKey, schema, search, selectedId, state, token]);

  function handleRowClick(event: GridRowClickEvent) {
    onSelectedTriggerChange(event.dataItem as ProcessingGridRecord);
  }

  async function handleCancel(row: ProcessingGridRecord) {
    const id = rowId(schema, row);
    const isParent = Boolean(row.IsParent ?? row.isParent);
    if (!window.confirm(`Cancel trigger ${id}? This forwards a server-side OxyGen mutation for this one visible instance only.`)) return;
    setActionBusyId(id);
    setActionMessage(null);
    setError(null);
    try {
      const response = await cancelTrigger(instanceId, id, token, isParent);
      setActionMessage(actionResultMessage(response.result, `Trigger ${id} canceled.`));
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel trigger failed.');
    } finally {
      setActionBusyId(null);
    }
  }


  function ActionCell(props: GridCellProps) {
    const row = props.dataItem as ProcessingGridRecord;
    const id = rowId(schema, row);
    const status = String(recordValue(row, triggerStatusField(schema)) ?? '').toLowerCase();
    const disabledByStatus = status.includes('cancel') || status.includes('complete') || status.includes('success');
    return <td className="k-table-td processing-action-cell"><ProcessingRowActionMenu label={`Actions for trigger ${id}`}>{(close) => <Button className="compact-button" type="button" fillMode="flat" disabled={!canCancelTrigger || disabledByStatus || actionBusyId === id} title={canCancelTrigger ? 'Cancel Trigger' : 'Permission required'} onClick={() => { close(); void handleCancel(row); }}><Ban /> Cancel</Button>}</ProcessingRowActionMenu></td>;
  }

  function StatusCell(props: GridCellProps) {
    const value = recordValue(props.dataItem as ProcessingGridRecord, String(props.field ?? triggerStatusField(schema)));
    return <td className="k-table-td"><span className={`processing-status-pill ${statusTone(value)}`}>{String(value ?? 'Unknown')}</span></td>;
  }

  return <article className="panel processing-trigger-panel">
    <ProcessingServerGrid
      gridKey="processing-triggers"
      title="Workflow Triggers"
      summary={`${total.toLocaleString()} matching rows · server-paged`}
      rows={rows}
      total={total}
      state={state}
      onStateChange={setState}
      columns={columns}
      dataItemKey={triggerIdField(schema)}
      loading={loading}
      loadingLabel="Loading Processing Errors trigger page…"
      actionCell={ActionCell}
      statusField={triggerStatusField(schema)}
      statusCell={StatusCell}
      onRowClick={handleRowClick}
      toolbar={<><label className="processing-inline-filter"><span>Status scope</span><select value={preset} onChange={(event) => { setPreset(event.target.value as ProcessingFilterPreset); setState((current) => ({ ...current, skip: 0 })); }}><option value="active-failed-recovery">Active / Failed / Recovery</option><option value="recent">Recent records</option><option value="all-visible">All visible parents</option></select></label><label className="processing-inline-filter"><span>Search</span><input value={search} onChange={(event) => { setSearch(event.target.value); setState((current) => ({ ...current, skip: 0 })); }} placeholder="Workflow, trigger, service, job, status" /></label><Button className="compact-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}><RotateCw /> Refresh</Button></>}
    />
    {actionMessage && <p className="panel-copy success">{actionMessage}</p>}
    {error && <p className="panel-copy warning">{error}</p>}
    <section className="processing-selection-strip" aria-live="polite"><strong>Selected trigger</strong><span>{selectedTrigger ? `${rowId(schema, selectedTrigger)} · ${String(recordValue(selectedTrigger, triggerStatusField(schema)) ?? 'Unknown')}` : 'Select a trigger row to drive downstream Processing Errors panes.'}</span></section>
  </article>;
}
