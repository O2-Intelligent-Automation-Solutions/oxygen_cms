import type { GridPreference, GridPreferenceInput, GridPreferenceRepository } from './types.js';

function nowIso() {
  return new Date().toISOString();
}

function cloneInput(input: GridPreferenceInput): GridPreferenceInput {
  return JSON.parse(JSON.stringify(input)) as GridPreferenceInput;
}

function keyFor(userId: string, gridKey: string) {
  return `${userId}:${gridKey}`;
}

export function createInMemoryGridPreferenceRepository(): GridPreferenceRepository {
  const preferences = new Map<string, GridPreference>();

  return {
    async getPreference(userId, gridKey) {
      const preference = preferences.get(keyFor(userId, gridKey));
      return preference ? JSON.parse(JSON.stringify(preference)) as GridPreference : null;
    },

    async savePreference(userId, gridKey, input) {
      const existing = preferences.get(keyFor(userId, gridKey));
      const timestamp = nowIso();
      const preference: GridPreference = {
        ...cloneInput(input),
        userId,
        gridKey,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
      };
      preferences.set(keyFor(userId, gridKey), preference);
      return JSON.parse(JSON.stringify(preference)) as GridPreference;
    }
  };
}
