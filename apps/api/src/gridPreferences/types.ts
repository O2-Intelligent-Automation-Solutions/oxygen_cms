export type GridColumnPreference = {
  key: string;
  title: string;
  visible: boolean;
  order: number;
  width?: number | string;
};

export type GridSortPreference = {
  field: string;
  dir: 'asc' | 'desc';
};

export type GridGroupPreference = {
  field: string;
};

export type GridPreferenceInput = {
  columns: GridColumnPreference[];
  sort: GridSortPreference[];
  group: GridGroupPreference[];
  filter: unknown | null;
  filtersVisible: boolean;
};

export type GridPreference = GridPreferenceInput & {
  userId: string;
  gridKey: string;
  createdAt: string;
  updatedAt: string;
};

export type GridPreferenceRepository = {
  getPreference(userId: string, gridKey: string): Promise<GridPreference | null>;
  savePreference(userId: string, gridKey: string, input: GridPreferenceInput): Promise<GridPreference>;
};
