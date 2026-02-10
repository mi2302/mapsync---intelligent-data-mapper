
import { SchemaType, SchemaDefinition, DataGroup, FieldMapping, SavedConfiguration } from '../types';
import { SCHEMAS, DATA_GROUPS } from '../constants';

const STORAGE_KEY = 'mapsync_group_configs';

export const apiService = {
  fetchDataGroups: async (): Promise<DataGroup[]> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve(DATA_GROUPS), 400);
    });
  },

  fetchSchemaDefinition: async (id: SchemaType): Promise<SchemaDefinition> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve(SCHEMAS[id]), 200);
    });
  },

  saveMappingConfiguration: async (
    config: Omit<SavedConfiguration, 'id' | 'createdAt'> & { id?: string }
  ): Promise<{ success: boolean; config: SavedConfiguration }> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        let saved: SavedConfiguration[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        let finalConfig: SavedConfiguration;

        if (config.id) {
          // Update existing
          const index = saved.findIndex(c => c.id === config.id);
          if (index !== -1) {
            finalConfig = {
              ...saved[index],
              ...config,
              id: config.id, // Ensure ID persists
              createdAt: saved[index].createdAt // Preserve original creation date
            };
            saved[index] = finalConfig;
          } else {
            // Fallback to create if ID not found for some reason
            finalConfig = {
              ...config,
              id: `cfg_${Math.random().toString(36).substr(2, 9)}`,
              createdAt: new Date().toISOString()
            } as SavedConfiguration;
            saved.push(finalConfig);
          }
        } else {
          // Check for name collision in the same group to satisfy "same name overwrites"
          const existingByNameIndex = saved.findIndex(c => c.name === config.name && c.groupId === config.groupId);
          if (existingByNameIndex !== -1) {
            finalConfig = {
              ...saved[existingByNameIndex],
              ...config,
              createdAt: saved[existingByNameIndex].createdAt
            } as SavedConfiguration;
            saved[existingByNameIndex] = finalConfig;
          } else {
            // New entry
            finalConfig = {
              ...config,
              id: `cfg_${Math.random().toString(36).substr(2, 9)}`,
              createdAt: new Date().toISOString()
            } as SavedConfiguration;
            saved.push(finalConfig);
          }
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        resolve({ success: true, config: finalConfig });
      }, 800);
    });
  },

  fetchConfigsByGroup: async (groupId: string): Promise<SavedConfiguration[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const saved: SavedConfiguration[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        resolve(saved.filter(c => c.groupId === groupId));
      }, 300);
    });
  },

  deleteConfiguration: async (configId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const saved: SavedConfiguration[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const filtered = saved.filter(c => c.id !== configId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        resolve(true);
      }, 300);
    });
  }
};
