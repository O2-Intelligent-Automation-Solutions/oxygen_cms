import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Grid, GridColumn, type GridCellProps, type GridColumnProps, type GridColumnsStateChangeEvent, type GridDataStateChangeEvent, type GridRowClickEvent } from '@progress/kendo-react-grid';
import { Columns3, LoaderCircle } from 'lucide-react';
import type { ProcessingGridRecord, ProcessingGridState } from './types';

type ProcessingColumnPreference = {
  field: string;
  title: string;
  visible: boolean;
  order: number;
  width?: GridColumnProps['width'];
};

type ProcessingServerGridProps = {
  gridKey: string;
  title: string;
  summary: string;
  rows: ProcessingGridRecord[];
  total: number;
  state: ProcessingGridState;
  onStateChange: (state: ProcessingGridState) => void;
  columns: GridColumnProps[];
  dataItemKey: string;
  loading: boolean;
  loadingLabel: string;
  toolbar?: ReactNode;
  actionCell?: (props: GridCellProps) => ReactNode;
  actionWidth?: number;
  statusField?: string;
  statusCell?: (props: GridCellProps) => ReactNode;
  onRowClick?: (event: GridRowClickEvent) => void;
};

function columnField(column: GridColumnProps) {
  return typeof column.field === 'string' && column.field.trim() ? column.field : String(column.title ?? 'column');
}

function defaultPreferences(columns: GridColumnProps[]): ProcessingColumnPreference[] {
  return columns.map((column, index) => ({
    field: columnField(column),
    title: String(column.title ?? columnField(column)),
    visible: !column.hidden,
    order: index,
    width: column.width
  }));
}

function mergePreferences(columns: GridColumnProps[], saved: ProcessingColumnPreference[] | null) {
  const defaults = defaultPreferences(columns);
  if (!saved?.length) return defaults;
  const savedByField = new Map(saved.map((column) => [column.field, column]));
  return defaults
    .map((column) => ({ ...column, ...savedByField.get(column.field), title: column.title }))
    .sort((left, right) => left.order - right.order)
    .map((column, index) => ({ ...column, order: index }));
}

function preferenceKey(gridKey: string) {
  return `oxygen-cms:processing-grid:${gridKey}:columns`;
}

export function ProcessingServerGrid({ gridKey, title, summary, rows, total, state, onStateChange, columns, dataItemKey, loading, loadingLabel, toolbar, actionCell, actionWidth = 88, statusField, statusCell, onRowClick }: ProcessingServerGridProps) {
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columnPrefs, setColumnPrefs] = useState<ProcessingColumnPreference[]>(() => defaultPreferences(columns));

  useEffect(() => {
    let saved: ProcessingColumnPreference[] | null = null;
    try {
      const raw = window.localStorage.getItem(preferenceKey(gridKey));
      if (raw) saved = JSON.parse(raw) as ProcessingColumnPreference[];
    } catch {
      saved = null;
    }
    setColumnPrefs(mergePreferences(columns, saved));
  }, [columns, gridKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(preferenceKey(gridKey), JSON.stringify(columnPrefs));
    } catch {
      // Local persistence is best-effort only.
    }
  }, [columnPrefs, gridKey]);

  const columnsByField = useMemo(() => new Map(columns.map((column) => [columnField(column), column])), [columns]);
  const visibleColumns = useMemo(() => [...columnPrefs].sort((left, right) => left.order - right.order).filter((column) => column.visible && columnsByField.has(column.field)), [columnPrefs, columnsByField]);

  function setColumnVisible(field: string, visible: boolean) {
    setColumnPrefs((current) => current.map((column) => column.field === field ? { ...column, visible } : column));
  }

  function handleColumnsStateChange(event: GridColumnsStateChangeEvent) {
    const gridColumns = event.columnsState.filter((column) => column.field);
    setColumnPrefs((current) => current.map((preference) => {
      const gridColumn = gridColumns.find((column) => column.field === preference.field || column.id === preference.field);
      if (!gridColumn) return preference;
      return {
        ...preference,
        width: gridColumn.width ?? preference.width,
        order: typeof gridColumn.orderIndex === 'number' ? gridColumn.orderIndex : preference.order,
        visible: gridColumn.hidden === undefined ? preference.visible : !gridColumn.hidden
      };
    }).sort((left, right) => left.order - right.order).map((column, index) => ({ ...column, order: index })));
  }

  function handleDataStateChange(event: GridDataStateChangeEvent) {
    const nextState: ProcessingGridState = {
      skip: event.dataState.skip ?? 0,
      take: event.dataState.take ?? state.take,
      sort: event.dataState.sort ?? [],
      filter: filtersVisible ? event.dataState.filter : undefined,
      group: event.dataState.group ?? []
    };
    onStateChange(nextState);
  }

  function toggleFiltersVisible() {
    setFiltersVisible((current) => {
      if (current) onStateChange({ ...state, filter: undefined, skip: 0 });
      return !current;
    });
  }

  return <article className="panel processing-trigger-panel processing-server-grid-panel">
    <div className="processing-grid-toolbar processing-standard-toolbar">
      <div className="processing-grid-toolbar-summary"><strong>{title}</strong><span>{summary}</span></div>
      <div className="processing-grid-toolbar-actions">
        {toolbar}
        <div className="processing-column-selector-wrap">
          <Button className="btn-grid-tool" type="button" fillMode="flat" onClick={() => setColumnsOpen((value) => !value)}><Columns3 /> Show Columns</Button>
          {columnsOpen && <div className="processing-column-selector-popover">
            {[...columnPrefs].sort((left, right) => left.order - right.order).map((column) => <label className="checkbox-label column-checkbox-label" key={column.field}>
              <input type="checkbox" checked={column.visible} onChange={(event) => setColumnVisible(column.field, event.target.checked)} />
              <span>{column.title}</span>
            </label>)}
          </div>}
        </div>
        <Button className="btn-grid-tool" type="button" fillMode="flat" onClick={toggleFiltersVisible}>{filtersVisible ? 'Hide Filters' : 'Show Filters'}</Button>
      </div>
    </div>
    <div className="processing-grid-scroll processing-server-grid-scroll">
      {loading && <div className="cms-loading-overlay grid-loading-overlay" role="status" aria-live="polite"><LoaderCircle className="cms-loading-spinner" /><span>{loadingLabel}</span></div>}
      <Grid
        className="cms-kendo-grid processing-kendo-grid"
        data={{ data: rows, total }}
        skip={state.skip}
        take={state.take}
        total={total}
        pageable={{ buttonCount: 5, pageSizes: [25, 50, 100, 250] }}
        sortable
        sort={state.sort}
        filterable={filtersVisible}
        filter={filtersVisible ? state.filter : undefined}
        groupable
        group={state.group}
        scrollable="scrollable"
        dataItemKey={dataItemKey}
        selectable={{ enabled: true, mode: 'single' }}
        reorderable
        resizable
        onColumnsStateChange={handleColumnsStateChange}
        onRowClick={onRowClick}
        onDataStateChange={handleDataStateChange}
      >
        {actionCell && <GridColumn id={`${gridKey}-actions`} title="Actions" width={actionWidth} filterable={false} sortable={false} groupable={false} reorderable={false} resizable={false} cells={{ data: actionCell }} />}
        {visibleColumns.map((preference) => {
          const column = columnsByField.get(preference.field)!;
          return <GridColumn
            key={preference.field}
            id={preference.field}
            {...column}
            field={preference.field}
            title={preference.title}
            width={preference.width ?? column.width}
            orderIndex={preference.order + 1}
            cells={statusField && preference.field === statusField && statusCell ? { data: statusCell } : column.cells}
          />;
        })}
      </Grid>
    </div>
  </article>;
}
