
import { SchemaType, SchemaDefinition, DataGroup, FieldMapping, SavedConfiguration } from '../types';
import { SCHEMAS, DATA_GROUPS } from '../constants';

const STORAGE_KEY = 'mapsync_group_configs';

// Backend API URL
const API_URL = 'http://localhost:3005/api';

export const apiService = {
  fetchDataGroups: async (): Promise<DataGroup[]> => {
    return new Promise((resolve) => {
      // Keep using constants for now as backend doesn't serve this yet
      setTimeout(() => resolve(DATA_GROUPS), 400);
    });
  },

  fetchSchemaDefinition: async (id: SchemaType): Promise<SchemaDefinition> => {
    return new Promise((resolve) => {
      setTimeout(() => resolve(SCHEMAS[id]), 200);
    });
  },

  // Check DB Connection
  checkDbConnection: async (): Promise<{ status: string; database?: string }> => {
    try {
      const response = await fetch(`${API_URL}/db-check`);
      return await response.json();
    } catch (error) {
      console.error('DB Check Failed:', error);
      return { status: 'error' };
    }
  },

  // Save Mapping Configuration (Updated to support backend if implemented later)
  saveMappingConfiguration: async (
    config: Omit<SavedConfiguration, 'id' | 'createdAt'> & { id?: string }
  ): Promise<{ success: boolean; config: SavedConfiguration }> => {
    // For now, keep local storage logic but log intention
    console.log('Saving config (mock):', config);
    return new Promise((resolve) => {
      setTimeout(() => {
        let saved: SavedConfiguration[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        let finalConfig: SavedConfiguration;

        if (config.id) {
          const index = saved.findIndex(c => c.id === config.id);
          if (index !== -1) {
            finalConfig = { ...saved[index], ...config, id: config.id, createdAt: saved[index].createdAt };
            saved[index] = finalConfig;
          } else {
            finalConfig = { ...config, id: `cfg_${Math.random().toString(36).substr(2, 9)}`, createdAt: new Date().toISOString() } as SavedConfiguration;
            saved.push(finalConfig);
          }
        } else {
          const existingByNameIndex = saved.findIndex(c => c.name === config.name && c.groupId === config.groupId);
          if (existingByNameIndex !== -1) {
            finalConfig = { ...saved[existingByNameIndex], ...config, createdAt: saved[existingByNameIndex].createdAt } as SavedConfiguration;
            saved[existingByNameIndex] = finalConfig;
          } else {
            finalConfig = { ...config, id: `cfg_${Math.random().toString(36).substr(2, 9)}`, createdAt: new Date().toISOString() } as SavedConfiguration;
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
      const saved: SavedConfiguration[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      resolve(saved.filter(c => c.groupId === groupId));
    });
  },

  deleteConfiguration: async (configId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const saved: SavedConfiguration[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const filtered = saved.filter(c => c.id !== configId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      resolve(true);
    });
  },

  syncData: async (tableName: string, columns: string[], rows: any[]): Promise<{ success: boolean; rowsAffected?: number; message?: string }> => {
    try {
      const response = await fetch(`${API_URL}/sync-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tableName, columns, rows })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || 'Sync failed');
      }
      return result;
    } catch (error: any) {
      console.error('Sync Error:', error);
      return { success: false, message: error.message };
    }
  }
};
