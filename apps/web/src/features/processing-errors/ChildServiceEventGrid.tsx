import { useEffect, useMemo, useState } from 'react';
import { Grid, GridColumn, type GridDataStateChangeEvent } from '@progress/kendo-react-grid';
import { Button } from '@progress/kendo-react-buttons';
import { LoaderCircle, RotateCw } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingGridState, ProcessingSchema } from './types';
import { getChildServiceEventGrid, recordValue } from './api';
import { schemaColumns, serviceEventIdField } from './schemaColumns';

type ChildServiceEventGridProps = {
  instanceId: string;
  serviceIdentifier: string;
  token: string;
  schema: ProcessingSchema | null;
  parent: ProcessingGridRecord;
};

export function ChildServiceEventGrid({ instanceId, serviceIdentifier, token, schema, parent }: ChildServiceEventGridProps) {
  const [state, setState] = useState<ProcessingGridState>({ skip: 0, take: 50, sort: [] });
  const [rows, setRows] = useState<ProcessingGridRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parentId = recordValue(parent, serviceEventIdField(schema));
  const columns = useMemo(() => schemaColumns(schema, 'ServiceEvent'), [schema]);

  useEffect(() => {
    if (parentId === null || parentId === undefined) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getChildServiceEventGrid(instanceId, serviceIdentifier, String(parentId), token, state, controller.signal)
      .then((response) => {
        setRows(response.data);
        setTotal(response.total);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Child service event request failed.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [instanceId, parentId, serviceIdentifier, state, token]);

  return <section className="processing-child-grid" aria-label={`Child service events for ${String(parentId ?? 'selected service event')}`}>
    <header className="processing-child-grid-head"><div><p className="eyebrow small">Child Service Events</p><strong>Parent {String(parentId ?? 'unknown')}</strong></div><Button className="compact-button" type="button" fillMode="flat" onClick={() => setState((current) => ({ ...current }))}><RotateCw /> Refresh Children</Button></header>
    {error && <p className="panel-copy warning">{error}</p>}
    <div className="processing-grid-scroll child">
      {loading && <div className="cms-loading-overlay grid-loading-overlay"><LoaderCircle className="cms-loading-spinner" /><span>Loading child service events…</span></div>}
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
        onDataStateChange={(event: GridDataStateChangeEvent) => setState({ skip: event.dataState.skip ?? 0, take: event.dataState.take ?? 50, sort: event.dataState.sort ?? [], filter: event.dataState.filter })}
      >
        {columns.map((column) => <GridColumn key={String(column.field)} {...column} />)}
      </Grid>
    </div>
  </section>;
}
