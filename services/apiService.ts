
import { SchemaType, SchemaDefinition, DataGroup, FieldMapping, SavedConfiguration } from '../types';
import { SCHEMAS, DATA_GROUPS } from '../constants';

const STORAGE_KEY = 'mapsync_group_configs';

// Backend API URL
const API_URL = 'http://localhost:3005/api';

export const apiService = {
  fetchDataGroups: async (): Promise<DataGroup[]> => {
    try {
      const response = await fetch(`${API_URL}/modules`);
      if (!response.ok) return DATA_GROUPS;
      const groups = await response.json();
      // Merge with static ones if needed, or just use dynamic
      return groups.length > 0 ? groups : DATA_GROUPS;
    } catch (error) {
      console.error('Fetch Modules Failed:', error);
      return DATA_GROUPS;
    }
  },

  saveModuleDefinitions: async (moduleName: string, icon: string, objects: { id: string, table: string }[]): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleName, icon, objects })
      });
      return response.ok;
    } catch (error) {
      console.error('Save Module Definitions Failed:', error);
      return false;
    }
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
      // Use human-readable group name as moduleName
      const normalizedGroupId = config.groupId.toLowerCase().replace(/_management$/, '').replace(/_payable$/, 's');
      const groupName = DATA_GROUPS.find(g => {
        const standardGid = g.id.toLowerCase().replace(/_management$/, '').replace(/_payable$/, 's');
        return standardGid === normalizedGroupId || g.id === config.groupId;
      })?.name || config.groupId;
      const payload = {
        registryId: config.id || Math.floor(Math.random() * 1000000),
        registryName: config.name,
        moduleName: groupName,
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

  fetchAllConfigs: async (): Promise<SavedConfiguration[]> => {
    try {
      const response = await fetch(`${API_URL}/registry`);
      if (!response.ok) return [];
      const configs = await response.json();
      return configs.map((c: any) => ({
        id: c.id,
        name: c.name,
        groupId: c.groupId,
        objectMappings: c.objectMappings || {},
        createdAt: c.createdAt || new Date().toISOString()
      }));
    } catch (error) {
      console.error('Fetch All Configs Failed:', error);
      return [];
    }
  },

  fetchConfigsByGroup: async (groupId: string): Promise<SavedConfiguration[]> => {
    try {
      const response = await fetch(`${API_URL}/modules/${groupId}/registries`);
      if (!response.ok) return [];
      const configs = await response.json();
      return configs.map((c: any) => ({
        id: c.id,
        name: c.name,
        groupId: c.groupId,
        objectMappings: c.objectMappings || {},
        createdAt: c.createdAt || new Date().toISOString()
      }));
    } catch (error) {
      console.error(`Fetch Configs for ${groupId} Failed:`, error);
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

  syncData: async (tableName: string, columns: string[], rows: any[], dryRun?: boolean): Promise<{ success: boolean; rowsAffected?: number; message?: string; query?: string; sample?: any }> => {
    try {
      const response = await fetch(`${API_URL}/sync-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tableName, columns, rows, dryRun })
      });

      const result = await response.json();
      // Even on error (500), result contains useful info like SQL query
      return result;
    } catch (error: any) {
      console.error('Sync Error:', error);
      return { success: false, message: error.message };
    }
  },

  fetchTableMetadata: async (tableNames: string[]): Promise<Record<string, any>> => {
    try {
      const response = await fetch(`${API_URL}/table-metadata?tables=${tableNames.join(',')}`);
      if (!response.ok) throw new Error('Failed to fetch table metadata');
      return await response.json();
    } catch (error) {
      console.error('Fetch Table Metadata Failed:', error);
      return {};
    }
  },

  listDatabaseTables: async (): Promise<string[]> => {
    try {
      const response = await fetch(`${API_URL}/list-tables`);
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error('List Tables Failed:', error);
      return [];
    }
  },

  createDynamicTable: async (tableName: string, columns: any[]): Promise<{ success: boolean; tableName?: string; message?: string }> => {
    try {
      const response = await fetch(`${API_URL}/create-dynamic-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName, columns })
      });
      return await response.json();
    } catch (error: any) {
      console.error('Create Dynamic Table Failed:', error);
      return { success: false, message: error.message };
    }
  },

  getRelationships: async (): Promise<any[]> => {
    try {
      const response = await fetch(`${API_URL}/relationships`);
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error('Fetch Relationships Failed:', error);
      return [];
    }
  }
};
