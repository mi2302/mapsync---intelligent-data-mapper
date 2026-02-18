require('dotenv').config();
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');

// Configure oracledb to fetch CLOBs as strings
oracledb.fetchAsString = [oracledb.CLOB];

const app = express();
const PORT = 3005;

// Middleware (Increased limits for bulk sync)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable Thick mode manually
try {
    oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
} catch (err) {
    console.error('Failed to initialize Oracle Client:', err);
    process.exit(1);
}

// Helper to get DB config consistently
function getDbConfig() {
    const user = (process.env.DB_USER || '').trim();
    const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
    const host = (process.env.DB_HOST || '').trim();
    const port = (process.env.DB_PORT || '').trim();
    const service = (process.env.DB_SERVICE_NAME || '').trim();

    if (!user || !password || !host || !port || !service) {
        throw new Error('Missing required database configuration variables (DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_SERVICE_NAME).');
    }

    const connectString = `${host}:${port}/${service}`;
    return { user, password, connectString };
}

async function initializeDatabase() {
    let connection;
    try {
        const dbConfig = getDbConfig();
        const { user, connectString } = dbConfig;
        console.log('Attempting connection with:', { user, connectString });
        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to Oracle Database');

        // Robust check for ICON column in MSAI_MODULES
        try {
            const colCheck = await connection.execute(
                `SELECT count(*) FROM user_tab_columns WHERE table_name = 'MSAI_MODULES' AND column_name = 'ICON'`
            );
            if (colCheck.rows[0][0] === 0) {
                console.log('修复数据库: Adding ICON column to MSAI_MODULES');
                await connection.execute(`ALTER TABLE MSAI_MODULES ADD (ICON VARCHAR2(100))`);
                await connection.commit();
            }
        } catch (e) {
            console.log('Note: MSAI_MODULES column check skipped (possibly table missing yet)');
        }

        console.log('Database initialization complete.');
    } catch (err) {
        console.error('Oracle DB Initialization Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error('Error closing connection:', err); }
        }
    }
}

// Initialize DB on startup
initializeDatabase();

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', datetime: new Date().toISOString() });
});

app.get('/api/relationships', async (req, res) => {
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            `SELECT SOURCE_SCHEMA, SOURCE_FIELD, TARGET_SCHEMA, TARGET_FIELD, RELATION_TYPE FROM MSAI_RELATIONSHIPS`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const relationships = result.rows.map(row => ({
            sourceSchemaId: row.SOURCE_SCHEMA,
            sourceFieldId: row.SOURCE_FIELD,
            targetSchemaId: row.TARGET_SCHEMA,
            targetFieldId: row.TARGET_FIELD,
            type: row.RELATION_TYPE
        }));

        res.json(relationships);
    } catch (err) {
        console.error('Error fetching relationships:', err);
        // Return empty array on error (e.g. table missing) to avoid breaking UI
        res.json([]);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
});

app.get('/api/db-check', async (req, res) => {
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute('SELECT 1 FROM DUAL');
        res.json({ status: 'connected', database: 'oracle', result: result.rows[0][0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

app.get('/api/table-metadata', async (req, res) => {
    const { tables } = req.query;
    if (!tables) return res.status(400).json({ error: 'Tables parameter required' });

    const tableList = tables.split(',').map(t => t.trim().toUpperCase());
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        const metadata = {};
        for (const rawTableName of tableList) {
            const tableName = rawTableName.toUpperCase();
            // console.log(`Fetching metadata for table: ${tableName}`);

            // Fetch PK Info
            let pkCols = [];
            try {
                const pkResult = await connection.execute(
                    `SELECT cols.column_name 
                     FROM all_constraints cons
                     JOIN all_cons_columns cols 
                       ON cons.constraint_name = cols.constraint_name 
                       AND cons.owner = cols.owner
                     WHERE cons.table_name = :tname 
                       AND cons.constraint_type = 'P'`,
                    [tableName],
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                pkCols = pkResult.rows.map(r => r.COLUMN_NAME);
            } catch (pkErr) {
                console.warn(`Failed to fetch PK for ${tableName}`, pkErr);
            }

            const result = await connection.execute(
                `SELECT column_name, data_type, nullable 
                 FROM all_tab_columns 
                 WHERE table_name = :tname 
                 ORDER BY column_id`,
                [tableName],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            metadata[tableName] = result.rows.map(col => {
                let type = 'VARCHAR';
                const oraType = col.DATA_TYPE ? col.DATA_TYPE.toUpperCase() : '';

                if (oraType.includes('NUMBER') || oraType.includes('FLOAT') || oraType.includes('DOUBLE')) {
                    type = 'NUMERIC';
                } else if (oraType.includes('DATE') || oraType.includes('TIMESTAMP')) {
                    type = 'TIMESTAMP';
                } else if (oraType.includes('BOOL')) {
                    type = 'BOOLEAN';
                }

                // console.log(`  Col: ${col.COLUMN_NAME}, OracleType: ${oraType} -> Mapped: ${type}`);

                return {
                    id: col.COLUMN_NAME,
                    column_name: col.COLUMN_NAME,
                    label: col.COLUMN_NAME.replace(/_/g, ' ').split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
                    type: type,
                    required: col.NULLABLE === 'N',
                    is_primary: pkCols.includes(col.COLUMN_NAME),
                    description: `Database source: ${tableName}`
                };
            });
        }

        res.json(metadata);
    } catch (err) {
        console.error('Fetch Metadata Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

app.get('/api/list-tables', async (req, res) => {
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT table_name 
             FROM all_tables 
             WHERE owner NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN', 'DBSNMP', 'APPQOSSYS') 
             ORDER BY table_name`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows.map(r => r.TABLE_NAME || r.table_name));
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

app.post('/api/create-dynamic-table', async (req, res) => {
    const { tableName, columns } = req.body;
    if (!tableName || !columns || !Array.isArray(columns)) {
        return res.status(400).json({ error: 'Invalid payload. Required: tableName, columns[]' });
    }

    const safeTableName = tableName.toUpperCase().startsWith('MSAI_')
        ? tableName.toUpperCase()
        : `MSAI_${tableName.toUpperCase()}`;

    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        const columnDefs = columns.map(col => {
            let typeStr = 'VARCHAR2(4000)';
            if (col.type === 'NUMERIC') typeStr = 'NUMBER';
            if (col.type === 'TIMESTAMP') typeStr = 'TIMESTAMP(6)';

            return `"${col.name.toUpperCase()}" ${typeStr}${col.required || col.isPk ? ' NOT NULL' : ''}`;
        }).join(', ');

        const pkCols = columns.filter(c => c.isPk).map(c => `"${c.name.toUpperCase()}"`);
        const pkConstraint = pkCols.length > 0 ? `, CONSTRAINT PK_${safeTableName.substring(0, 20)} PRIMARY KEY (${pkCols.join(', ')})` : '';

        const sql = `CREATE TABLE ${safeTableName} (${columnDefs}${pkConstraint})`;
        console.log('🚀 Creating Physical Table:', sql);

        await connection.execute(sql);
        res.json({ success: true, tableName: safeTableName });
    } catch (err) {
        console.error('Table Creation Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

// Helper to keep IDs consistent
function nameToId(name) {
    if (!name) return 'unknown';
    let gid = name.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '');
    // Mapping legacy IDs to new standardized ones
    if (gid === 'workforce' || gid === 'workforce_management') return 'workforce_management';
    if (gid === 'payables' || gid === 'accounts_payable') return 'accounts_payable';
    // if (gid === 'suppliers' || gid === 'vendor_relations') return 'vendor_relations'; // Identifying them separately now
    return gid;
}

app.get('/api/modules', async (req, res) => {
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        const result = await connection.execute(
            `SELECT MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, 
                    (SELECT ICON FROM (SELECT ICON, MODULE_NAME as mname FROM MSAI_MODULES) WHERE mname = row_alias.MODULE_NAME AND ROWNUM = 1) as ICON_VAL
             FROM MSAI_MODULES row_alias`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Group by MODULE_NAME
        const groups = {};

        result.rows.forEach(row => {
            const gid = nameToId(row.MODULE_NAME);
            if (!groups[gid]) {
                groups[gid] = {
                    id: gid,
                    name: row.MODULE_NAME,
                    icon: row.ICON_VAL || '\u{1F4E6}', // Generic package icon as fallback
                    objects: []
                };
            }
            groups[gid].objects.push({
                id: row.OBJECT_NAME,
                name: row.OBJECT_NAME.replace(/_/g, ' '), // Friendly name
                table: row.TARGET_TABLE_NAME
            });
        });

        res.json(Object.values(groups));
    } catch (err) {
        console.error('Fetch Modules Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

app.post('/api/modules', async (req, res) => {
    const { moduleName, icon, objects } = req.body;
    if (!moduleName || !objects || !Array.isArray(objects)) {
        return res.status(400).json({ error: 'Invalid payload. Required: moduleName, objects[]' });
    }

    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        for (const obj of objects) {
            const moduleId = `MOD_${moduleName.substring(0, 3).toUpperCase()}_${obj.id.toUpperCase()}`;
            await connection.execute(
                `MERGE INTO MSAI_MODULES t
                 USING (SELECT :mid as mid, :mname as mname, :oname as oname, :tname as tname, :icon as icon FROM DUAL) s
                 ON (t.MODULE_NAME = s.mname AND t.OBJECT_NAME = s.oname)
                 WHEN MATCHED THEN
                     UPDATE SET t.TARGET_TABLE_NAME = s.tname, t.ICON = s.icon
                 WHEN NOT MATCHED THEN
                     INSERT (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON)
                     VALUES (s.mid, s.mname, s.oname, s.tname, s.icon)`,
                {
                    mid: moduleId,
                    mname: moduleName,
                    oname: obj.id,
                    tname: obj.table,
                    icon: icon || '📦'
                }
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        console.error('Module Registration Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// Save Registry Configuration (Full Hierarchy)
app.post('/api/registry', async (req, res) => {
    const { registryId, registryName, moduleName, objectMappings } = req.body;
    console.log(`Saving Registry: ${registryName} (ID: ${registryId})`);

    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        // 1. Upsert Registry Header (Using MERGE to avoid "new records" if exists)
        await connection.execute(
            `MERGE INTO MSAI_REGISTRY t
             USING (SELECT :id as rid, :name as rname, :mod as mname FROM DUAL) s
             ON (t.REGISTRY_ID = s.rid)
             WHEN MATCHED THEN
                 UPDATE SET t.REGISTRY_NAME = s.rname, t.MODULE_NAME = s.mname
             WHEN NOT MATCHED THEN
                 INSERT (REGISTRY_ID, REGISTRY_NAME, MODULE_NAME)
                 VALUES (s.rid, s.rname, s.mname)`,
            { id: registryId, name: registryName, mod: moduleName },
            { autoCommit: false }
        );

        // 2. Clear old links (We keep mappings but refresh relations)
        await connection.execute(`DELETE FROM MSAI_REGISTRY_MODULES WHERE REGISTRY_ID = :id`, [registryId], { autoCommit: false });

        // 3. Process Modules and Links
        for (const [schemaId, mappings] of Object.entries(objectMappings)) {
            const objectName = schemaId;
            // A. Find Module Definition in MSAI_MODULES (Case Insensitive)
            const checkModule = await connection.execute(
                `SELECT MODULE_ID FROM MSAI_MODULES 
                 WHERE UPPER(MODULE_NAME) = UPPER(:mname) 
                   AND UPPER(OBJECT_NAME) = UPPER(:oname)`,
                [moduleName, objectName]
            );

            if (checkModule.rows.length === 0) {
                // Debugging: Fetch all to see what's available
                const allMods = await connection.execute(`SELECT MODULE_NAME, OBJECT_NAME FROM MSAI_MODULES`);
                console.log('DEBUG: Available Modules in DB:', allMods.rows);

                throw new Error(`Critical: Module definition not found for [${moduleName}] / [${objectName}]. Available: ${JSON.stringify(allMods.rows)}`);
            }
            const moduleId = checkModule.rows[0][0];

            // B. Link Registry to Module in MSAI_REGISTRY_MODULES
            const linkId = String(Math.floor(Math.random() * 10000000));
            await connection.execute(
                `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID) VALUES (:lid, :rid, :mid)`,
                { lid: linkId, rid: registryId, mid: moduleId },
                { autoCommit: false }
            );

            // C. Refresh Mappings (MSAI_MAPPING_METADATA)
            // 1. CLEAR existing mappings for this object to ensure removed fields are deleted
            await connection.execute(
                `DELETE FROM MSAI_MAPPING_METADATA 
                 WHERE REGISTRY_ID = :rid AND MODULE_NAME = :oname`,
                [registryId, objectName],
                { autoCommit: false }
            );

            // 2. INSERT current valid mappings
            for (const map of mappings) {
                if (map.sourceHeader) {
                    await connection.execute(
                        `INSERT INTO MSAI_MAPPING_METADATA 
                         (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                         VALUES (:mapid, :rid, :rname, :oname, :src, :tgt, :logic)`,
                        {
                            mapid: String(Math.floor(Math.random() * 1000000000)),
                            rid: registryId,
                            rname: registryName,
                            oname: objectName,
                            src: map.sourceHeader,
                            tgt: map.targetFieldId,
                            logic: JSON.stringify(map.transformations || [])
                        },
                        { autoCommit: false }
                    );
                }
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'Registry saved successfully' });
    } catch (err) {
        console.error('Save Registry Error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (rbErr) { console.error('Rollback Error:', rbErr); }
        }
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

// Fetch All Registries
// Helper to build registry response
async function buildRegistryConfigs(connection, regRows) {
    const configs = [];
    for (const row of regRows) {
        const regId = row.REGISTRY_ID;
        const objectMappings = {};

        // Get Linked Modules
        const modulesResult = await connection.execute(
            `SELECT m.MODULE_ID, m.OBJECT_NAME, m.MODULE_NAME
             FROM MSAI_REGISTRY_MODULES rm
             JOIN MSAI_MODULES m ON rm.MODULE_ID = m.MODULE_ID
             WHERE rm.REGISTRY_ID = :rid`,
            [regId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Fetch Mappings
        const mapResult = await connection.execute(
            `SELECT MODULE_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC
              FROM MSAI_MAPPING_METADATA
              WHERE REGISTRY_ID = :rid`,
            [regId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        for (const mod of modulesResult.rows) {
            const schemaId = mod.OBJECT_NAME;
            // Filter mappings belonging to THIS specific object
            objectMappings[schemaId] = mapResult.rows
                .filter(m => m.MODULE_NAME === schemaId)
                .map(m => ({
                    sourceHeader: m.SOURCE_ATTRIBUTE_HEADER,
                    targetFieldId: m.MAPPING_ATTRIBUTE_COLUMN,
                    transformations: m.ADDITION_LOGIC ? JSON.parse(m.ADDITION_LOGIC) : []
                }));
        }

        // Map stored Module Name back to Frontend Group ID
        let groupId = nameToId(row.MODULE_NAME);

        configs.push({
            id: String(row.REGISTRY_ID),
            name: row.REGISTRY_NAME,
            groupId: groupId,
            objectMappings: objectMappings
        });
    }
    return configs;
}

// Fetch All Registries
app.get('/api/registry', async (req, res) => {
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        const regResult = await connection.execute(
            `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME FROM MSAI_REGISTRY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const configs = await buildRegistryConfigs(connection, regResult.rows);
        res.json(configs);
    } catch (err) {
        console.error('Fetch Registry Error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

// Fetch Registries by Module (Group)
app.get('/api/modules/:moduleName/registries', async (req, res) => {
    const { moduleName } = req.params;
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        // Find match in MSAI_MODULES to get more names
        const findNames = await connection.execute(
            `SELECT DISTINCT MODULE_NAME FROM MSAI_MODULES`
        );

        const searchNames = [moduleName];
        findNames.rows.forEach(r => {
            if (nameToId(r[0]) === moduleName.toLowerCase()) {
                searchNames.push(r[0]);
            }
        });

        const regResult = await connection.execute(
            `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME 
             FROM MSAI_REGISTRY 
             WHERE UPPER(MODULE_NAME) IN (${searchNames.map((_, i) => `:mod${i}`).join(',')})`,
            searchNames.reduce((acc, name, i) => ({ ...acc, [`mod${i}`]: name.toUpperCase() }), {}),
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const configs = await buildRegistryConfigs(connection, regResult.rows);
        res.json(configs);
    } catch (err) {
        console.error('Fetch Module Registry Error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

// Delete Registry
app.delete('/api/registry/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);
        await connection.execute(`DELETE FROM MSAI_MAPPING_METADATA WHERE REGISTRY_ID = :id`, [id], { autoCommit: false });
        await connection.execute(`DELETE FROM MSAI_REGISTRY_MODULES WHERE REGISTRY_ID = :id`, [id], { autoCommit: false });
        await connection.execute(`DELETE FROM MSAI_REGISTRY WHERE REGISTRY_ID = :id`, [id], { autoCommit: false });
        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Registry Error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (rbErr) { console.error(rbErr); }
        }
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

app.post('/api/sync-data', async (req, res) => {
    const { tableName, columns, rows, dryRun } = req.body;

    if (!tableName || !columns || !rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Invalid payload. Required: tableName, columns, rows[]' });
    }

    // Server-Side Duplicate Validation
    console.log(`[DEBUG] Syncing Table: ${tableName}`);
    console.log(`[DEBUG] Received Columns: ${JSON.stringify(columns)}`);

    // Heuristic check removed. Using DB query for strict validation.

    let connection;
    let sql;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        // 1. Fetch Primary Keys for the table to enable MERGE (UPSERT)
        const pkResult = await connection.execute(
            `SELECT cols.column_name 
             FROM all_constraints cons, all_cons_columns cols 
             WHERE cons.constraint_type = 'P' 
               AND cons.constraint_name = cols.constraint_name 
               AND cons.owner = cols.owner 
               AND cons.table_name = :tname`,
            [tableName.toUpperCase()],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const primaryKeys = pkResult.rows.map(r => r.COLUMN_NAME.toUpperCase());
        console.log(`Primary Keys detected for ${tableName}:`, primaryKeys);

        // STRICT PK Validation based on Database Constraints
        const relevantPKs = primaryKeys.filter(pk => columns.some(c => c.toUpperCase() === pk));

        if (relevantPKs.length > 0) {
            console.log(`[DB Validation] Checking duplicates on DB Keys: ${relevantPKs.join(', ')}`);
            const seen = new Set();
            for (const row of rows) {
                const key = relevantPKs.map(pk => {
                    // Find actual input column name (case-insensitive match to PK)
                    const inputCol = columns.find(c => c.toUpperCase() === pk);
                    if (!inputCol) return '';

                    // Robust lookup for value
                    const val = row[inputCol] || row[inputCol.toLowerCase()] || row[Object.keys(row).find(k => k.toUpperCase() === inputCol.toUpperCase())];
                    return String(val || '').trim();
                }).join('|');

                // Only validate if we have a key (and ignore purely empty keys if generated)
                if (key && key !== '' && seen.has(key)) {
                    console.warn(`[DB Validation] Duplicate found: ${key} in ${tableName}`);
                    return res.status(400).json({
                        success: false,
                        message: `Validation Error: Duplicate Primary Key detected for Database Constraint (${relevantPKs.join(', ')}). Value: '${key}'. Please remove duplicates.`
                    });
                }
                seen.add(key);
            }
        }

        // Construct SQL with safe internal bind names (B1, B2, ...)
        const bindMapping = columns.map((c, i) => ({
            column: c.toUpperCase(),
            bindName: `B${i + 1}`
        }));

        const colStr = bindMapping.map(m => `"${m.column}"`).join(', ');
        const valStr = bindMapping.map(m => `:${m.bindName}`).join(', ');

        if (primaryKeys.length > 0) {
            // Build Robust MERGE Statement
            const pkMatches = bindMapping
                .filter(m => primaryKeys.includes(m.column))
                .map(m => `t."${m.column}" = s."${m.column}"`)
                .join(' AND ');

            const updateSet = bindMapping
                .filter(m => !primaryKeys.includes(m.column))
                .map(m => `t."${m.column}" = s."${m.column}"`)
                .join(', ');

            const insertCols = bindMapping.map(m => `"${m.column}"`).join(', ');
            const insertVals = bindMapping.map(m => `s."${m.column}"`).join(', ');

            const dualSelect = bindMapping.map(m => `:${m.bindName} as "${m.column}"`).join(', ');

            sql = `
                MERGE INTO ${tableName} t
                USING (SELECT ${dualSelect} FROM DUAL) s
                ON (${pkMatches || '1=0'})
                WHEN MATCHED THEN
                    UPDATE SET ${updateSet || 't."' + primaryKeys[0] + '" = t."' + primaryKeys[0] + '"'}
                WHEN NOT MATCHED THEN
                    INSERT (${insertCols})
                    VALUES (${insertVals})
            `;
        } else {
            // Fallback to standard INSERT if no PK found
            sql = `INSERT INTO ${tableName} (${colStr}) VALUES (${valStr})`;
        }

        console.log(`\n� SYNC START: ${tableName}`);
        console.log(`📝 Rows to process: ${rows.length}`);

        // Map rows to the safe bind names
        const bindData = rows.map((row) => {
            const rowObj = {};
            bindMapping.forEach(m => {
                const val = row[m.column] || row[m.column.toLowerCase()] || row[columns.find(c => c.toUpperCase() === m.column)];

                if (val === undefined || val === null || val === '') {
                    rowObj[m.bindName] = null;
                } else if (typeof val === 'object' && val instanceof Date) {
                    rowObj[m.bindName] = val; // Pass native Date object
                } else {
                    let strVal = String(val);

                    // Robust Date Parsing:
                    // 1. Must parse successfully as a date
                    // 2. Must contain typical date separators (- or /) to avoid converting plain years ("2023") or other numbers
                    const timestamp = Date.parse(strVal);

                    if (!isNaN(timestamp) && (strVal.includes('-') || strVal.includes('/'))) {
                        rowObj[m.bindName] = new Date(timestamp);
                    } else {
                        rowObj[m.bindName] = strVal;
                    }
                }
            });
            return rowObj;
        });

        if (dryRun) {
            console.log(`[Preview] Only generating SQL for ${tableName}`);
            await connection.rollback();
            res.json({
                success: true,
                rowsAffected: 0,
                query: sql,
                sample: bindData.length > 0 ? bindData[0] : null
            });
            return;
        }

        const result = await connection.executeMany(sql, bindData, {
            autoCommit: true,
        });

        console.log('🎉 SYNC COMPLETE. Result:', result);

        // Explicit commit
        await connection.commit();

        res.json({ success: true, rowsAffected: result.rowsAffected, query: sql });

    } catch (err) {
        console.error('Bulk Sync Error:', err);
        res.status(500).json({
            status: 'error',
            message: err.message,
            sqlError: err.offset ? `Error at pos ${err.offset}` : undefined,
            query: sql
        });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error('Error closing connection:', err); }
        }
    }
});

// Start Server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
