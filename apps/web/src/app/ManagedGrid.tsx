import { Button } from '@progress/kendo-react-buttons';
import { Grid, GridColumn, type GridColumnsStateChangeEvent, type GridCustomCellProps, type GridDataStateChangeEvent } from '@progress/kendo-react-grid';
import { LoaderCircle } from 'lucide-react';
import { process, type State } from '@progress/kendo-data-query';
import { GripVertical } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

export type ManagedGridColumn<T> = {
  key: Extract<keyof T, string>;
  title: string;
  width?: number | string;
  defaultVisible?: boolean;
  filter?: 'text' | 'numeric' | 'boolean' | 'date';
};

type ColumnPreference = {
  key: string;
  title: string;
  visible: boolean;
  order: number;
  width?: number | string;
};

type GridPreference = {
  columns: ColumnPreference[];
  sort: NonNullable<State['sort']>;
  group: NonNullable<State['group']>;
  filter: State['filter'] | null;
  filtersVisible: boolean;
};

type ManagedGridProps<T extends { id: string }> = {
  gridKey: string;
  token: string;
  rows: T[];
  columns: ManagedGridColumn<T>[];
  toolbar?: ReactNode;
  actionCell?: (props: GridCustomCellProps) => ReactNode;
  actionWidth?: number | string;
  mobileActions?: (row: T) => ReactNode;
  loading?: boolean;
  loadingLabel?: string;
};

type ManagedGridStyle = CSSProperties & { '--cms-grid-min-width': string };

function columnWidthValue(width?: number | string, fallback = 280) {
  if (typeof width === 'number') return width;
  if (typeof width === 'string') {
    const parsed = Number.parseFloat(width);
    if (Number.isFinite(parsed) && width.trim().endsWith('px')) return parsed;
  }
  return fallback;
}

async function gridPreferenceApi<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error || `Grid preference request failed with status ${response.status}`));
  return body as T;
}

function defaultPreferences<T extends { id: string }>(columns: ManagedGridColumn<T>[]): ColumnPreference[] {
  return columns.map((column, index) => ({
    key: column.key,
    title: column.title,
    visible: column.defaultVisible ?? true,
    order: index,
    width: column.width
  }));
}

function mergeColumns<T extends { id: string }>(columns: ManagedGridColumn<T>[], saved?: ColumnPreference[] | null) {
  const defaults = defaultPreferences(columns);
  if (!saved?.length) return defaults;
  const savedByKey = new Map(saved.map((column) => [column.key, column]));
  return defaults
    .map((column) => ({ ...column, ...savedByKey.get(column.key), title: column.title }))
    .sort((left, right) => left.order - right.order)
    .map((column, index) => ({ ...column, order: index }));
}

export function ManagedGrid<T extends { id: string }>({ gridKey, token, rows, columns, toolbar, actionCell, actionWidth = 104, mobileActions, loading = false, loadingLabel = 'Loading records…' }: ManagedGridProps<T>) {
  const [columnPrefs, setColumnPrefs] = useState<ColumnPreference[]>(() => defaultPreferences(columns));
  const [gridState, setGridState] = useState<State>({ sort: [] });
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [columnSelectorOpen, setColumnSelectorOpen] = useState(false);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; column: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dragColumnKey, setDragColumnKey] = useState<string | null>(null);
  const didLoadRef = useRef(false);
  const latestPreferenceRef = useRef<GridPreference | null>(null);
  const dirtyPreferenceRef = useRef(false);

  function persistGridPreference() {
    if (!dirtyPreferenceRef.current || !latestPreferenceRef.current) return;
    dirtyPreferenceRef.current = false;
    gridPreferenceApi(`/api/grid-preferences/${gridKey}`, token, { method: 'PUT', body: JSON.stringify(latestPreferenceRef.current) }).catch(() => undefined);
  }

  useEffect(() => {
    let active = true;
    didLoadRef.current = false;
    setLoaded(false);
    setColumnPrefs(defaultPreferences(columns));
    setGridState({ sort: [] });
    setFiltersVisible(false);
    gridPreferenceApi<{ preference: (GridPreference & { gridKey: string }) | null }>(`/api/grid-preferences/${gridKey}`, token)
      .then(({ preference }) => {
        if (!active) return;
        setColumnPrefs(mergeColumns(columns, preference?.columns));
        setGridState({ sort: preference?.sort ?? [], group: preference?.group ?? [], filter: preference?.filter ?? undefined });
        setFiltersVisible(preference?.filtersVisible ?? false);
      })
      .catch(() => {
        if (active) setColumnPrefs(defaultPreferences(columns));
      })
      .finally(() => {
        if (!active) return;
        didLoadRef.current = true;
        setLoaded(true);
      });
    return () => { active = false; };
  }, [gridKey, token, columns]);

  useEffect(() => {
    latestPreferenceRef.current = {
      columns: columnPrefs,
      sort: gridState.sort ?? [],
      group: gridState.group ?? [],
      filter: filtersVisible ? gridState.filter ?? null : null,
      filtersVisible
    };
    if (loaded && didLoadRef.current) dirtyPreferenceRef.current = true;
  }, [columnPrefs, filtersVisible, gridState.filter, gridState.group, gridState.sort]);

  useEffect(() => () => { persistGridPreference(); }, [gridKey, token]);

  useEffect(() => {
    function handleBeforeUnload() { persistGridPreference(); }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [gridKey, token]);

  const effectiveGridState = useMemo<State>(() => filtersVisible ? gridState : { ...gridState, filter: undefined }, [filtersVisible, gridState]);
  const processedRows = useMemo(() => process(rows, effectiveGridState), [rows, effectiveGridState]);
  const columnsByKey = useMemo(() => new Map<string, ManagedGridColumn<T>>(columns.map((column) => [column.key, column])), [columns]);
  const orderedColumns = useMemo(() => [...columnPrefs].sort((left, right) => left.order - right.order), [columnPrefs]);
  const visibleColumns = orderedColumns.filter((column) => column.visible && columnsByKey.has(column.key));
  const gridMinimumWidth = useMemo(() => {
    const actionMinimum = actionCell ? columnWidthValue(actionWidth, 104) : 0;
    const columnsMinimum = visibleColumns.reduce((total, preference) => {
      const definition = columnsByKey.get(preference.key);
      return total + columnWidthValue(preference.width ?? definition?.width, 300);
    }, actionMinimum);
    return Math.max(columnsMinimum, 720);
  }, [actionCell, actionWidth, columnsByKey, visibleColumns]);
  const gridStyle: ManagedGridStyle = { '--cms-grid-min-width': `${Math.ceil(gridMinimumWidth)}px` };

  function setColumnVisible(key: string, visible: boolean) {
    setColumnPrefs((current) => current.map((column) => column.key === key ? { ...column, visible } : column));
  }

  function reorderColumnInSelector(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    setColumnPrefs((current) => {
      const ordered = [...current].sort((left, right) => left.order - right.order);
      const fromIndex = ordered.findIndex((column) => column.key === fromKey);
      const toIndex = ordered.findIndex((column) => column.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return current;
      const [moved] = ordered.splice(fromIndex, 1);
      ordered.splice(toIndex, 0, moved);
      return ordered.map((column, index) => ({ ...column, order: index }));
    });
  }

  function handleColumnsStateChange(event: GridColumnsStateChangeEvent) {
    const gridColumns = event.columnsState.filter((column) => column.field);
    setColumnPrefs((current) => current.map((preference) => {
      const gridColumn = gridColumns.find((column) => column.field === preference.key || column.id === preference.key);
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
    setGridState(filtersVisible ? event.dataState : { ...event.dataState, filter: undefined });
  }

  function toggleFiltersVisible() {
    setFiltersVisible((value) => {
      if (value) setGridState((current) => ({ ...current, filter: undefined }));
      return !value;
    });
  }

  function handleHeaderContextMenu(event: React.MouseEvent<HTMLElement>) {
    const header = (event.target as HTMLElement).closest('th');
    const title = header?.querySelector('.k-column-title')?.textContent?.trim();
    const column = columnPrefs.find((definition) => definition.title === title)?.key;
    if (!column) return;
    event.preventDefault();
    setHeaderMenu({ x: event.clientX, y: event.clientY, column });
  }

  const sortedColumn = headerMenu ? gridState.sort?.find((sort) => sort.field === headerMenu.column) : undefined;
  const mobileRows = useMemo(() => {
    const flatten = (items: unknown[]): T[] => items.flatMap((item) => {
      if (item && typeof item === 'object' && 'items' in item && Array.isArray((item as { items?: unknown[] }).items)) {
        return flatten((item as { items: unknown[] }).items);
      }
      return item && typeof item === 'object' && 'id' in item ? [item as T] : [];
    });
    return flatten(processedRows.data as unknown[]);
  }, [processedRows.data]);

  return <article className="panel data-panel kendo-data-panel">
    {loading && <div className="cms-loading-overlay grid-loading-overlay" role="status" aria-live="polite"><LoaderCircle className="cms-loading-spinner" /><span>{loadingLabel}</span></div>}
    <div className="dp-head instance-grid-toolbar">
      {toolbar}
      <div className="column-selector-wrap">
        <Button className="btn-grid-tool" type="button" fillMode="flat" onClick={() => setColumnSelectorOpen((value) => !value)}>Show Columns</Button>
        {columnSelectorOpen && <div className="column-selector-popover">
          {orderedColumns.map((column) => <label
            key={column.key}
            className="checkbox-label column-checkbox-label"
            draggable
            onDragStart={() => setDragColumnKey(column.key)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => { if (dragColumnKey) reorderColumnInSelector(dragColumnKey, column.key); setDragColumnKey(null); }}
          >
            <GripVertical className="column-drag-handle" aria-hidden />
            <input type="checkbox" checked={column.visible} onChange={(event) => setColumnVisible(column.key, event.target.checked)} />
            <span>{column.title}</span>
          </label>)}
        </div>}
      </div>
      <Button className="btn-grid-tool" type="button" fillMode="flat" onClick={toggleFiltersVisible}>{filtersVisible ? 'Hide Filters' : 'Show Filters'}</Button>
    </div>
    <div className="instance-grid-wrap" onContextMenu={handleHeaderContextMenu} onClick={() => setHeaderMenu(null)}>
      <Grid
        className="cms-kendo-grid"
        data={processedRows}
        scrollable="scrollable"
        style={gridStyle}
        sortable
        filterable={filtersVisible}
        groupable
        reorderable
        resizable
        {...effectiveGridState}
        onDataStateChange={handleDataStateChange}
        onColumnsStateChange={handleColumnsStateChange}
      >
        {actionCell && <GridColumn id={`${gridKey}-actions`} title="Actions" width={actionWidth} filterable={false} sortable={false} groupable={false} reorderable={false} resizable={false} cells={{ data: actionCell }} />}
        {visibleColumns.map((preference) => {
          const column = columnsByKey.get(preference.key)!;
          return <GridColumn
            id={preference.key}
            key={preference.key}
            field={preference.key}
            title={column.title}
            filter={column.filter ?? 'text'}
            width={preference.width ?? column.width}
            orderIndex={preference.order + 1}
          />;
        })}
      </Grid>
    </div>
    <div className="managed-grid-mobile-cards">
      {mobileRows.length === 0 && <div className="mobile-grid-empty">No records available.</div>}
      {mobileRows.map((row) => {
        const [primaryColumn, secondaryColumn] = visibleColumns;
        const primaryValue = primaryColumn ? String(row[primaryColumn.key as keyof T] ?? '') : row.id;
        const secondaryValue = secondaryColumn ? String(row[secondaryColumn.key as keyof T] ?? '') : '';
        return <article className="mobile-grid-card" key={row.id}>
          <div className="mobile-grid-card-head">
            <div>
              <strong>{primaryValue || row.id}</strong>
              {secondaryValue && <span>{secondaryValue}</span>}
            </div>
            {mobileActions && <div className="mobile-grid-card-actions">{mobileActions(row)}</div>}
          </div>
          <dl className="mobile-grid-card-details">
            {visibleColumns.slice(secondaryColumn ? 2 : 1).map((column) => <div key={column.key}>
              <dt>{column.title}</dt>
              <dd>{String(row[column.key as keyof T] ?? '') || '—'}</dd>
            </div>)}
          </dl>
        </article>;
      })}
    </div>
    {headerMenu && <div className="grid-header-context-menu" style={{ left: headerMenu.x, top: headerMenu.y }} onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => { setColumnVisible(headerMenu.column, false); setHeaderMenu(null); }}>Hide Column</button>
      <button type="button" onClick={() => { setColumnSelectorOpen(true); setHeaderMenu(null); }}>Show Columns</button>
      {sortedColumn?.dir !== 'asc' && <button type="button" onClick={() => { setGridState((current) => ({ ...current, sort: [{ field: headerMenu.column, dir: 'asc' }] })); setHeaderMenu(null); }}>Sort Ascending</button>}
      {sortedColumn?.dir !== 'desc' && <button type="button" onClick={() => { setGridState((current) => ({ ...current, sort: [{ field: headerMenu.column, dir: 'desc' }] })); setHeaderMenu(null); }}>Sort Descending</button>}
      {sortedColumn && <button type="button" onClick={() => { setGridState((current) => ({ ...current, sort: (current.sort ?? []).filter((sort) => sort.field !== headerMenu.column) })); setHeaderMenu(null); }}>Remove Sort</button>}
      <button type="button" onClick={() => { setGridState((current) => ({ ...current, group: [{ field: headerMenu.column }] })); setHeaderMenu(null); }}>Group Column</button>
    </div>}
  </article>;
}
