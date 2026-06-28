import type { CompositeFilterDescriptor, SortDescriptor } from '@progress/kendo-data-query';

export type ProcessingGridRecord = Record<string, unknown>;

export type ProcessingGridResponse<T extends ProcessingGridRecord = ProcessingGridRecord> = {
  data: T[];
  total: number;
  raw?: unknown;
};

export type ProcessingFieldType = 'String' | 'Number' | 'Boolean' | 'DateTime' | 'Object' | 'FileList' | `${string}[]`;

export type ProcessingSchemaField = {
  Key: string;
  Label: string;
  Type: ProcessingFieldType;
  IsVisible?: boolean;
  Sortable?: boolean;
  Filterable?: boolean;
  AutoWidth?: boolean;
  Width?: string;
};

export type ProcessingSchema = {
  Fields?: ProcessingSchemaField[];
  IdColumns?: Partial<{
    IdField: string;
    JobIdField: string;
    WorkflowIdField: string;
    WorkflowTriggerIdField: string;
    WorkflowEventIdField: string;
    StatusField: string;
    JobNameField: string;
    WorkflowNameField: string;
    ServiceIdentifierField: string;
    ProcessingLockField: string;
  }>;
  Groups?: Record<string, string[]>;
  Tags?: Record<string, string[]>;
  Grids?: Partial<{
    Parent: string[];
    Child: string[];
  }>;
};

export type ProcessingGridState = {
  skip: number;
  take: number;
  sort: SortDescriptor[];
  filter?: CompositeFilterDescriptor;
};

export type ProcessingFilterPreset = 'active-errors' | 'recent' | 'all-visible';

export type TriggerGridQuery = {
  state: ProcessingGridState;
  preset: ProcessingFilterPreset;
  search?: string;
};

export type WorkflowEventGridQuery = {
  state: ProcessingGridState;
  workflowTriggerId: string | number;
  search?: string;
};

export type ServiceEventGridQuery = {
  state: ProcessingGridState;
  serviceIdentifier: string;
  workflowEventId: string | number;
  search?: string;
};

export type ProcessingEmailAddress = {
  Name?: string;
  Address?: string;
  IsInvalid?: boolean;
  Message?: string | null;
};

export type ProcessingMessageAttachment = {
  FileName: string;
  ContentType?: string;
  Content: string;
};

export type ProcessingMessageDetails = {
  To?: ProcessingEmailAddress[];
  From?: ProcessingEmailAddress;
  CC?: ProcessingEmailAddress[];
  BCC?: ProcessingEmailAddress[];
  Subject?: string;
  IsPlainText?: boolean;
  Body?: string;
  Attachments?: ProcessingMessageAttachment[] | null;
  SendDeliveryReceipts?: boolean;
  DeliveryReceiptEmail?: string;
  SendReadReceipts?: boolean;
  ReadReceiptEmail?: string;
};

export type ProcessingQueueEntryDetail = ProcessingGridRecord & {
  Message?: ProcessingMessageDetails | null;
  OriginalMessage?: ProcessingMessageDetails | null;
  LastEditDate?: string | null;
  LastEditUser?: ProcessingGridRecord | null;
};
