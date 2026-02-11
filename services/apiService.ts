
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

  // Save Mapping Configuration
  saveMappingConfiguration: async (
    config: Omit<SavedConfiguration, 'id' | 'createdAt'> & { id?: string }
  ): Promise<{ success: boolean; config: SavedConfiguration }> => {
    try {
      // Backend expects: registryId, registryName, moduleName, objectMappings
      const payload = {
        registryId: config.id || Math.floor(Math.random() * 1000000), // Generate numeric ID if new
        registryName: config.name,
        moduleName: 'Workforce Management', // Derived from groupId usually
        objectMappings: config.objectMappings
      };

      const response = await fetch(`${API_URL}/registry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message);

      return { success: true, config: { ...config, id: String(payload.registryId), createdAt: new Date().toISOString() } };
    } catch (error) {
      console.error('Save Config Failed:', error);
      return { success: false, config: config as SavedConfiguration };
    }
  },

  fetchConfigsByGroup: async (groupId: string): Promise<SavedConfiguration[]> => {
    try {
      const response = await fetch(`${API_URL}/registry`);
      if (!response.ok) return [];
      const configs = await response.json();
      // Filter by group on client side since backend returns all for now
      // This maps the backend structure back to frontend 'SavedConfiguration'
      return configs.map((c: any) => ({
        id: c.id,
        name: c.name,
        groupId: 'workforce', // Hardcoded for this demo scope as requested
        objectMappings: c.objectMappings || {},
        createdAt: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Fetch Configs Failed:', error);
      return [];
    }
  },

  deleteConfiguration: async (configId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/registry/${configId}`, { method: 'DELETE' });
      return response.ok;
    } catch (error) {
      console.error('Delete Failed:', error);
      return false;
    }
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
