import { useEffect, useMemo, useState } from 'react';
import { Grid, GridColumn, type GridDataStateChangeEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { getChildTriggerGrid, recordValue } from './api';
import { schemaColumns, triggerIdField } from './schemaColumns';

type ChildTriggerGridProps = {
  instanceId: string;
  token: string;
  schema: ProcessingSchema | null;
  parent: ProcessingGridRecord;
};

export function ChildTriggerGrid({ instanceId, token, schema, parent }: ChildTriggerGridProps) {
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [] });
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parentId = recordValue(parent, triggerIdField(schema));
  const columns = useMemo(() => schemaColumns(schema, 'Child'), [schema]);

  useEffect(() => {
    if (parentId === null || parentId === undefined) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getChildTriggerGrid(instanceId, String(parentId), token, state, controller.signal)
      .then((response) => {
        setRows(response.data);
        setTotal(response.total);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Child trigger request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [instanceId, parentId, state, token]);

  return <section className="processing-child-grid" aria-label={`Child triggers for ${String(parentId ?? 'selected trigger')}`}>
    <header className="processing-child-grid-head"><div><p className="eyebrow small">Child Triggers</p><strong>Parent {String(parentId ?? 'unknown')}</strong></div><Button className="compact-button" type="button" fillMode="flat" onClick={() => setState((current) => ({ ...current }))}><RotateCw /> Refresh Children</Button></header>
    {error && <p className="panel-copy warning">{error}</p>}
    <div className="processing-grid-scroll child">
      {loading && <div className="cms-loading-overlay grid-loading-overlay"><LoaderCircle className="cms-loading-spinner" /><span>Loading child triggers…</span></div>}
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
        onDataStateChange={(event: GridDataStateChangeEvent) => setState({ skip: event.dataState.skip ?? 0, take: event.dataState.take ?? 50, sort: event.dataState.sort ?? [], filter: event.dataState.filter })}
      >
        {columns.map((column) => <GridColumn key={String(column.field)} {...column} />)}
      </Grid>
    </div>
  </section>;
}
