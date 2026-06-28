import type { GridColumnProps } from '@progress/kendo-react-grid';
import type { ProcessingSchema, ProcessingSchemaField } from './types';

const FALLBACK_PARENT_COLUMNS = ['Id', 'WorkflowId', 'WorkflowTriggerId', 'WorkflowName', 'SourceIdentifier', 'ServiceIdentifier', 'JobId', 'Status', 'StatusInfo', 'TriggerDate', 'CompleteDate', 'HasErrors', 'ChildTriggers'];
const FALLBACK_CHILD_COLUMNS = ['Id', 'TriggerGroupId', 'WorkflowId', 'WorkflowTriggerId', 'WorkflowName', 'SourceIdentifier', 'ServiceIdentifier', 'JobId', 'Status', 'StatusInfo', 'TriggerDate', 'CompleteDate', 'HasErrors'];

function widthFor(field: ProcessingSchemaField) {
  if (field.Width) return field.Width;
  if (field.Type === 'DateTime') return 190;
  if (field.Type === 'Boolean') return 130;
  if (field.Key.toLowerCase().includes('identifier')) return 220;
  if (field.Key.toLowerCase().includes('error') || field.Key.toLowerCase().includes('info')) return 260;
  if (field.Key.toLowerCase().includes('id')) return 150;
  return 180;
}

function filterFor(type: ProcessingSchemaField['Type']): GridColumnProps['filter'] {
  if (type === 'Number') return 'numeric';
  if (type === 'Boolean') return 'boolean';
  if (type === 'DateTime') return 'date';
  return 'text';
}

function fieldMap(schema: ProcessingSchema) {
  return new Map((schema.Fields ?? []).map((field) => [field.Key, field]));
}

function fallbackField(key: string): ProcessingSchemaField {
  return { Key: key, Label: key.replace(/([a-z0-9])([A-Z])/g, '$1 $2'), Type: key.toLowerCase().endsWith('id') ? 'Number' : 'String', IsVisible: true, Sortable: true, Filterable: true };
}

export function schemaColumns(schema: ProcessingSchema | null, grid: 'Parent' | 'Child'): GridColumnProps[] {
  const fields = schema ? fieldMap(schema) : new Map<string, ProcessingSchemaField>();
  const schemaGridFields = grid === 'Parent' ? schema?.Grids?.Parent : schema?.Grids?.Child;
  const keys = schemaGridFields?.length ? schemaGridFields : grid === 'Parent' ? FALLBACK_PARENT_COLUMNS : FALLBACK_CHILD_COLUMNS;
  return keys
    .map((key) => fields.get(key) ?? fallbackField(key))
    .filter((field) => field.IsVisible ?? true)
    .map((field) => ({
      field: field.Key,
      title: field.Label || field.Key,
      width: widthFor(field),
      filter: filterFor(field.Type),
      sortable: field.Sortable ?? true,
      filterable: field.Filterable ?? true
    }));
}

export function triggerIdField(schema: ProcessingSchema | null) {
  return schema?.IdColumns?.IdField || 'Id';
}

export function triggerStatusField(schema: ProcessingSchema | null) {
  return schema?.IdColumns?.StatusField || 'Status';
}
