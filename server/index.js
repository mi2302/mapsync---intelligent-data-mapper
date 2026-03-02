require('dotenv').config();
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Configure oracledb to fetch CLOBs as strings
oracledb.fetchAsString = [oracledb.CLOB];

const app = express();
const PORT = 3005;

// Middleware (Increased limits for bulk sync)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable Thick mode manually (Optional: Set ORACLE_THIN_MODE=true to skip this in Docker)
if (process.env.ORACLE_THIN_MODE !== 'true') {
    try {
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
        console.log('✅ Oracle Thick Mode initialized');
    } catch (err) {
        console.error('Failed to initialize Oracle Client (Thick Mode):', err);
        console.log('💡 Tip: If you are in Docker, set ORACLE_THIN_MODE=true to use Thin mode.');
        process.exit(1);
    }
} else {
    console.log('🚀 Oracle Thin Mode enabled (No Instant Client required)');
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
    return {
        user,
        password,
        connectString,
        poolMin: 0, // Relax min pool to avoid startup pressure
        poolMax: 10,
        poolIncrement: 1,
        poolTimeout: 60,
        poolPingInterval: 30 // Keep connections alive
    };
}

let poolPromise;

async function getPool() {
    if (!poolPromise) {
        poolPromise = oracledb.createPool(getDbConfig());
    }
    return poolPromise;
}

async function initializeDatabase() {
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection(); // Get from pool
        console.log('Connected to Oracle Database via Pool');

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

// User Registration
app.post('/api/signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    let connection;
    try {
        const hash = await bcrypt.hash(password, 10);
        const pool = await getPool();
        connection = await pool.getConnection();
        await connection.execute(
            `INSERT INTO MSAI_USERS (EMAIL, PASSWORD_HASH) VALUES (:email, :hash)`,
            { email, hash },
            { autoCommit: true }
        );
        res.json({ success: true, message: 'Account created successfully' });
    } catch (err) {
        if (err.message.includes('ORA-00001')) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();
        const result = await connection.execute(
            `SELECT PASSWORD_HASH, ROLE FROM MSAI_USERS WHERE EMAIL = :email`,
            { email },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const match = await bcrypt.compare(password, result.rows[0].PASSWORD_HASH);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ success: true, email: email, role: result.rows[0].ROLE || 'USER', token: 'fake-refresh-token' }); // In a real app, generate JWT here
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

app.get('/api/relationships', async (req, res) => {
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

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
        // Table might be missing initially - return empty array
        res.json([]);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

// Check Database Connection (Restored legacy endpoint name)
app.get('/api/db-check', async (req, res) => {
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();
        await connection.execute('SELECT 1 FROM DUAL');
        res.json({ status: 'connected', database: 'oracle', success: true }); // Return compatibility format
    } catch (err) {
        console.error('DB Check Error:', err);
        res.status(500).json({ status: 'error', message: err.message, success: false });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
});

// Alias for consistency
app.get('/api/check-db', async (req, res) => {
    res.redirect('/api/db-check');
});

// Fetch Table Metadata (Primary Logic)
app.post('/api/fetch-metadata', async (req, res) => {
    const { tableNames } = req.body;
    if (!tableNames || !Array.isArray(tableNames)) {
        return res.status(400).json({ error: 'Invalid payload. Expecting { tableNames: [] }' });
    }

    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();
        const metadata = {};

        for (const rawTableName of tableNames) {
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
        const pool = await getPool();
        connection = await pool.getConnection();
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
        const pool = await getPool();
        connection = await pool.getConnection();

        const columnDefs = columns.map(col => {
            let typeStr = 'VARCHAR2(4000)';
            if (col.type === 'NUMERIC') typeStr = 'NUMBER';
            if (col.type === 'TIMESTAMP') typeStr = 'TIMESTAMP(6)';

            return `"${col.name.toUpperCase()}" ${typeStr}${col.required || col.isPk ? ' NOT NULL' : ''}`;
        }).join(', ');

        const pkCols = columns.filter(c => c.isPk).map(c => `"${c.name.toUpperCase()}"`);

        // Generate a more unique constraint name to avoid ORA-02264
        // Oracle limits: 30 chars for legacy, 128 for modern. We'll target 30 for safety.
        // Format: PK_[truncated_name]_[hash]
        const tableHash = Buffer.from(safeTableName).toString('hex').substring(0, 4).toUpperCase();
        const baseName = safeTableName.replace('MSAI_', '').substring(0, 18);
        const pkConstraintName = `PK_${baseName}_${tableHash}`;

        const pkConstraint = pkCols.length > 0 ? `, CONSTRAINT ${pkConstraintName} PRIMARY KEY (${pkCols.join(', ')})` : '';

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
    // Reverted the merging of suppliers and vendor_relations
    return gid;
}

// Fetch all registered modules with their real database columns for searching
app.get('/api/legacy-universe', async (req, res) => {
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        // 1. Fetch modules
        const modulesResult = await connection.execute(
            `SELECT MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON 
             FROM MSAI_MODULES`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (modulesResult.rows.length === 0) return res.json({});

        // 2. Fetch all columns for all registered tables in one go for efficiency
        const tableNames = modulesResult.rows.map(m => (m.TARGET_TABLE_NAME || '').toUpperCase());
        const resultSchema = {};

        // Batch fetching columns if there are many tables
        const colBatchSize = 30;
        for (let i = 0; i < tableNames.length; i += colBatchSize) {
            const batch = tableNames.slice(i, i + colBatchSize);
            const placeholders = batch.map((_, idx) => `:t${idx}`).join(',');
            const bindParams = {};
            batch.forEach((tn, idx) => bindParams[`t${idx}`] = tn);

            const colsResult = await connection.execute(
                `SELECT table_name, column_name, data_type, nullable
                 FROM all_tab_columns
                 WHERE table_name IN (${placeholders})
                 ORDER BY table_name, column_id`,
                bindParams,
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            colsResult.rows.forEach(col => {
                const tn = col.TABLE_NAME;
                if (!resultSchema[tn]) resultSchema[tn] = [];

                let type = 'VARCHAR';
                const oraType = col.DATA_TYPE ? col.DATA_TYPE.toUpperCase() : '';
                if (oraType.includes('NUMBER')) type = 'NUMERIC';
                else if (oraType.includes('DATE') || oraType.includes('TIMESTAMP')) type = 'TIMESTAMP';
                else if (oraType.includes('BOOL')) type = 'BOOLEAN';

                resultSchema[tn].push({
                    id: col.COLUMN_NAME,
                    column_name: col.COLUMN_NAME,
                    label: col.COLUMN_NAME.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
                    type: type,
                    required: col.NULLABLE === 'N'
                });
            });
        }

        // 3. Combine into SchemaDefinition objects
        const universe = {};
        modulesResult.rows.forEach(m => {
            const tn = (m.TARGET_TABLE_NAME || '').toUpperCase();
            universe[m.OBJECT_NAME] = {
                id: m.OBJECT_NAME,
                name: m.OBJECT_NAME.replace(/_/g, ' '),
                icon: m.ICON || '📦',
                table_name: m.TARGET_TABLE_NAME,
                moduleName: m.MODULE_NAME,
                fields: resultSchema[tn] || []
            };
        });

        res.json(universe);
    } catch (err) {
        console.error('Fetch Legacy Universe Error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

app.get('/api/modules', async (req, res) => {
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        const result = await connection.execute(
            `SELECT MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, 
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
                table: row.TARGET_TABLE_NAME,
                moduleId: row.MODULE_ID // Added for linking
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
        const pool = await getPool();
        connection = await pool.getConnection();

        for (const obj of objects) {
            // Check if exists
            const check = await connection.execute(
                `SELECT MODULE_ID FROM MSAI_MODULES 
                 WHERE MODULE_NAME = :mname AND OBJECT_NAME = :oname`,
                [moduleName, obj.id.toUpperCase()]
            );

            if (check.rows.length > 0) {
                // Update
                await connection.execute(
                    `UPDATE MSAI_MODULES SET TARGET_TABLE_NAME = :tname, ICON = :icon 
                     WHERE MODULE_ID = :mid`,
                    { tname: obj.table, icon: icon || '📦', mid: check.rows[0][0] }
                );
            } else {
                // Insert with Sequence
                await connection.execute(
                    `INSERT INTO MSAI_MODULES (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON)
                     VALUES (MSAI_MODULE_SEQ.NEXTVAL, :mname, :oname, :tname, :icon)`,
                    { mname: moduleName, oname: obj.id.toUpperCase(), tname: obj.table, icon: icon || '📦' }
                );
            }
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
    let { registryId, registryName, moduleName, objectMappings, sourceId } = req.body;

    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        if (registryId === 'undefined' || registryId === 'null') registryId = null;

        // 1. Handle Registry ID (Insert or Update)
        let finalRegistryId = registryId;

        if (!registryId) {
            // New Registry - Get Sequence
            const seqResult = await connection.execute(`SELECT MSAI_REGISTRY_SEQ.NEXTVAL FROM DUAL`);
            // Ensure we handle both Array and Object output formats safely
            if (Array.isArray(seqResult.rows[0])) {
                finalRegistryId = seqResult.rows[0][0];
            } else {
                // If named, it's likely NEXTVAL
                finalRegistryId = seqResult.rows[0].NEXTVAL;
            }
            console.log('Generated New Registry ID:', finalRegistryId);

            if (!finalRegistryId) throw new Error('Failed to generate Registry ID from Sequence');

            await connection.execute(
                `INSERT INTO MSAI_REGISTRY (REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ID)
                 VALUES (:id, :name, :mod, :sid)`,
                { id: finalRegistryId, name: registryName, mod: moduleName, sid: sourceId || null },
                { autoCommit: false }
            );
        } else {
            // Existing - Update
            await connection.execute(
                `UPDATE MSAI_REGISTRY SET REGISTRY_NAME = :name, MODULE_NAME = :mod, SOURCE_ID = :sid WHERE REGISTRY_ID = :id`,
                { name: registryName, mod: moduleName, sid: sourceId || null, id: registryId },
                { autoCommit: false }
            );
        }

        console.log(`Saving Registry: ${registryName} (ID: ${finalRegistryId})`);

        // 2. Clear old links (We keep mappings but refresh relations)
        await connection.execute(`DELETE FROM MSAI_REGISTRY_MODULES WHERE REGISTRY_ID = :id`, [finalRegistryId], { autoCommit: false });

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

            // B. Link Registry to Module in MSAI_REGISTRY_MODULES using Sequence
            await connection.execute(
                `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID) 
                 VALUES (MSAI_LINK_SEQ.NEXTVAL, :rid, :mid)`,
                { rid: finalRegistryId, mid: moduleId },
                { autoCommit: false }
            );

            // C. Refresh Mappings (MSAI_MAPPING_METADATA)
            // 1. CLEAR existing mappings for this object to ensure removed fields are deleted
            await connection.execute(
                `DELETE FROM MSAI_MAPPING_METADATA 
                 WHERE REGISTRY_ID = :rid AND OBJECT_NAME = :oname`,
                [finalRegistryId, objectName],
                { autoCommit: false }
            );

            // 2. INSERT current valid mappings using Sequence
            for (const map of mappings) {
                if (map.sourceHeader) {
                    await connection.execute(
                        `INSERT INTO MSAI_MAPPING_METADATA 
                         (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                         VALUES (MSAI_MAPPING_SEQ.NEXTVAL, :rid, :rname, :oname, :src, :tgt, :logic)`,
                        {
                            rid: finalRegistryId,
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
        // Return success with the NEW ID so frontend can update state
        res.json({ success: true, message: 'Registry saved successfully', registryId: finalRegistryId });
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
            `SELECT OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC
              FROM MSAI_MAPPING_METADATA
              WHERE REGISTRY_ID = :rid`,
            [regId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const mappingsByObject = {};
        for (const m of mapResult.rows) {
            const objName = m.OBJECT_NAME;
            if (!mappingsByObject[objName]) mappingsByObject[objName] = [];
            mappingsByObject[objName].push({
                sourceHeader: m.SOURCE_ATTRIBUTE_HEADER,
                targetFieldId: m.MAPPING_ATTRIBUTE_COLUMN,
                transformations: m.ADDITION_LOGIC ? JSON.parse(m.ADDITION_LOGIC) : []
            });
        }

        // Assign to schemaIds
        for (const mod of modulesResult.rows) {
            const schemaId = mod.OBJECT_NAME;
            // Get mappings specifically for this object
            objectMappings[schemaId] = mappingsByObject[schemaId] || [];
        }

        // Map stored Module Name back to Frontend Group ID
        let groupId = nameToId(row.MODULE_NAME);

        configs.push({
            id: String(row.REGISTRY_ID),
            name: row.REGISTRY_NAME,
            groupId: groupId,
            objectMappings: objectMappings,
            sourceId: row.SOURCE_ID ? String(row.SOURCE_ID) : undefined
        });
    }
    return configs;
}

// Fetch All Registries
app.get('/api/registry', async (req, res) => {
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        const regResult = await connection.execute(
            `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ID FROM MSAI_REGISTRY`,
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
    const { sourceId } = req.query;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        // Find match in MSAI_MODULES to get more names
        const findNames = await connection.execute(
            `SELECT DISTINCT MODULE_NAME FROM MSAI_MODULES`
        );

        const searchNames = [moduleName];
        findNames.rows.forEach(r => {
            const mname = typeof r[0] === 'string' ? r[0] : (r.MODULE_NAME || '');
            if (nameToId(mname) === moduleName.toLowerCase()) {
                searchNames.push(mname);
            }
        });

        const bindVars = {};
        searchNames.forEach((name, i) => {
            bindVars[`mod${i}`] = name.toUpperCase();
        });

        let query = `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ID 
                     FROM MSAI_REGISTRY 
                     WHERE UPPER(MODULE_NAME) IN (${searchNames.map((_, i) => `:mod${i}`).join(',')})`;

        if (sourceId && sourceId !== 'undefined' && sourceId !== 'null') {
            query += ` AND SOURCE_ID = :sid`;
            bindVars['sid'] = sourceId;
        }

        const regResult = await connection.execute(query, bindVars, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const configs = await buildRegistryConfigs(connection, regResult.rows);
        res.json(configs);
    } catch (err) {
        console.error('Fetch Registry by Group Error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// --- PROJECT MANAGEMENT APIs ---

// 1. Get All Projects
app.get('/api/projects', async (req, res) => {
    const { email, role } = req.query;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        const baseQuery = `
            SELECT p.*,
                   (SELECT COUNT(*) FROM MSAI_PROJECT_MODULES pm WHERE pm.PROJECT_ID = p.PROJECT_ID) as MODULE_COUNT
            FROM MSAI_PROJECTS p
        `;

        let result;
        if (role && role.toUpperCase() === 'ADMIN') {
            result = await connection.execute(
                `${baseQuery} ORDER BY p.CREATED_AT DESC`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
        } else {
            result = await connection.execute(
                `${baseQuery} WHERE p.CREATED_BY = :email ORDER BY p.CREATED_AT DESC`,
                { email: email || '' },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
        }
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 2. Create Project
app.post('/api/projects', async (req, res) => {
    const { name, description, moduleIds, email } = req.body;
    console.log('[DEBUG] Create Project Request:', { name, description, moduleIds, email });
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        const result = await connection.execute(
            `INSERT INTO MSAI_PROJECTS (PROJECT_ID, PROJECT_NAME, DESCRIPTION, CREATED_BY) 
             VALUES (MSAI_PROJECT_SEQ.NEXTVAL, :p_name, :p_desc, :p_email) RETURNING PROJECT_ID INTO :p_id`,
            {
                p_name: name,
                p_desc: description,
                p_email: email || null,
                p_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            },
            { autoCommit: false }
        );

        const projectId = result.outBinds.p_id[0];
        console.log('[DEBUG] Project Created with ID:', projectId);

        // Insert modules if provided
        if (moduleIds && moduleIds.length > 0) {
            console.log('[DEBUG] Inserting modules for project:', moduleIds);
            for (const mid of moduleIds) {
                await connection.execute(
                    `INSERT INTO MSAI_PROJECT_MODULES (PROJECT_ID, MODULE_ID) VALUES (:pid, :mid)`,
                    { pid: projectId, mid: mid },
                    { autoCommit: false }
                );
            }
        } else {
            console.log('[DEBUG] No moduleIds provided in request body');
        }

        await connection.commit();
        res.json({ success: true, projectId: projectId });
    } catch (err) {
        console.error('[ERROR] Project Creation Failed:', err);
        if (connection) await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 3. Get Project Details (with Modules)
app.get('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        const projResult = await connection.execute(
            `SELECT * FROM MSAI_PROJECTS WHERE PROJECT_ID = :id`,
            [id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (projResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

        const modsResult = await connection.execute(
            `SELECT m.* 
             FROM MSAI_MODULES m
             JOIN MSAI_PROJECT_MODULES pm ON m.MODULE_ID = pm.MODULE_ID
             WHERE pm.PROJECT_ID = :id`,
            [id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // Group modules for cleaner frontend consumption (similar to /api/modules)
        const groups = {};
        modsResult.rows.forEach(row => {
            const gid = nameToId(row.MODULE_NAME);
            if (!groups[gid]) {
                groups[gid] = {
                    id: gid,
                    name: row.MODULE_NAME,
                    icon: row.ICON || '\u{1F4E6}',
                    objects: []
                };
            }
            groups[gid].objects.push({
                id: row.OBJECT_NAME,
                name: row.OBJECT_NAME.replace(/_/g, ' '),
                table: row.TARGET_TABLE_NAME,
                moduleId: row.MODULE_ID // Important for linking
            });
        });

        res.json({
            project: projResult.rows[0],
            modules: Object.values(groups)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 4. Add Modules to Project
app.post('/api/projects/:id/modules', async (req, res) => {
    const { id } = req.params;
    const { moduleIds } = req.body; // Array of MODULE_ID
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        // Clear existing (optional, or merge) - let's merge or precise set
        // User asked "select modules... to work on". Simple approach: Delete all for project and re-insert.
        await connection.execute(`DELETE FROM MSAI_PROJECT_MODULES WHERE PROJECT_ID = :id`, [id], { autoCommit: false });

        if (moduleIds && moduleIds.length > 0) {
            for (const mid of moduleIds) {
                await connection.execute(
                    `INSERT INTO MSAI_PROJECT_MODULES (PROJECT_ID, MODULE_ID) VALUES (:pid, :mid)`,
                    { pid: id, mid: mid },
                    { autoCommit: false }
                );
            }
        }
        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 5. Duplicate Project
app.post('/api/projects/:id/copy', async (req, res) => {
    const { id } = req.params;
    const { name, description, email, copyModules, selectedSourceIds } = req.body;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        // Create Project
        const pResult = await connection.execute(
            `INSERT INTO MSAI_PROJECTS (PROJECT_ID, PROJECT_NAME, DESCRIPTION, CREATED_BY) 
             VALUES (MSAI_PROJECT_SEQ.NEXTVAL, :pname, :pdesc, :pemail) RETURNING PROJECT_ID INTO :pid`,
            { pname: name, pdesc: description, pemail: email || null, pid: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
            { autoCommit: false }
        );
        const newProjectId = pResult.outBinds.pid[0];

        if (copyModules) {
            await connection.execute(
                `INSERT INTO MSAI_PROJECT_MODULES (PROJECT_ID, MODULE_ID)
                 SELECT :newId, MODULE_ID FROM MSAI_PROJECT_MODULES WHERE PROJECT_ID = :oldId`,
                { newId: newProjectId, oldId: id }, { autoCommit: false }
            );
        }

        if (selectedSourceIds && selectedSourceIds.length > 0) {
            for (const sourceId of selectedSourceIds) {
                const sInfo = await connection.execute(`SELECT SOURCE_NAME, DESCRIPTION FROM MSAI_SOURCES WHERE SOURCE_ID = :sid`, { sid: sourceId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                if (sInfo.rows.length === 0) continue;

                const sResult = await connection.execute(
                    `INSERT INTO MSAI_SOURCES (SOURCE_ID, PROJECT_ID, SOURCE_NAME, DESCRIPTION)
                     VALUES (MSAI_SOURCE_SEQ.NEXTVAL, :pid, :sname, :sdesc) RETURNING SOURCE_ID INTO :sid`,
                    { pid: newProjectId, sname: sInfo.rows[0].SOURCE_NAME, sdesc: sInfo.rows[0].DESCRIPTION, sid: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
                    { autoCommit: false }
                );
                const newSourceId = sResult.outBinds.sid[0];

                await connection.execute(
                    `INSERT INTO MSAI_SOURCE_MODULES (SOURCE_ID, MODULE_ID)
                     SELECT :newId, MODULE_ID FROM MSAI_SOURCE_MODULES WHERE SOURCE_ID = :oldId`,
                    { newId: newSourceId, oldId: sourceId }, { autoCommit: false }
                );

                const regs = await connection.execute(
                    `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME FROM MSAI_REGISTRY WHERE SOURCE_ID = :oldId`,
                    { oldId: sourceId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                for (const reg of regs.rows) {
                    const rResult = await connection.execute(
                        `INSERT INTO MSAI_REGISTRY (REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ID)
                         VALUES (MSAI_REGISTRY_SEQ.NEXTVAL, :rname, :mname, :sid) RETURNING REGISTRY_ID INTO :rid`,
                        { rname: reg.REGISTRY_NAME, mname: reg.MODULE_NAME, sid: newSourceId, rid: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
                        { autoCommit: false }
                    );
                    const newRegId = rResult.outBinds.rid[0];

                    await connection.execute(
                        `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID)
                         SELECT MSAI_LINK_SEQ.NEXTVAL, :newRegId, MODULE_ID FROM MSAI_REGISTRY_MODULES WHERE REGISTRY_ID = :oldRegId`,
                        { newRegId: newRegId, oldRegId: reg.REGISTRY_ID }, { autoCommit: false }
                    );

                    await connection.execute(
                        `INSERT INTO MSAI_MAPPING_METADATA (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                         SELECT MSAI_MAPPING_SEQ.NEXTVAL, :newRegId, :rname, OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC
                         FROM MSAI_MAPPING_METADATA WHERE REGISTRY_ID = :oldRegId`,
                        { newRegId: newRegId, rname: reg.REGISTRY_NAME, oldRegId: reg.REGISTRY_ID }, { autoCommit: false }
                    );
                }
            }
        }
        await connection.commit();
        res.json({ success: true, newProjectId });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 6. Duplicate Source
app.post('/api/projects/:id/sources/:sourceId/copy', async (req, res) => {
    const { id, sourceId } = req.params;
    const { name } = req.body;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        const sInfo = await connection.execute(`SELECT SOURCE_NAME, DESCRIPTION FROM MSAI_SOURCES WHERE SOURCE_ID = :sid`, { sid: sourceId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (sInfo.rows.length === 0) return res.status(404).json({ error: "Source not found" });

        const newName = name || `${sInfo.rows[0].SOURCE_NAME} (Copy)`;

        const sResult = await connection.execute(
            `INSERT INTO MSAI_SOURCES (SOURCE_ID, PROJECT_ID, SOURCE_NAME, DESCRIPTION)
             VALUES (MSAI_SOURCE_SEQ.NEXTVAL, :pid, :sname, :sdesc) RETURNING SOURCE_ID INTO :sid`,
            { pid: id, sname: newName, sdesc: sInfo.rows[0].DESCRIPTION, sid: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
            { autoCommit: false }
        );
        const newSourceId = sResult.outBinds.sid[0];

        await connection.execute(
            `INSERT INTO MSAI_SOURCE_MODULES (SOURCE_ID, MODULE_ID)
             SELECT :newId, MODULE_ID FROM MSAI_SOURCE_MODULES WHERE SOURCE_ID = :oldId`,
            { newId: newSourceId, oldId: sourceId }, { autoCommit: false }
        );

        const regs = await connection.execute(
            `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME FROM MSAI_REGISTRY WHERE SOURCE_ID = :oldId`,
            { oldId: sourceId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        for (const reg of regs.rows) {
            const rResult = await connection.execute(
                `INSERT INTO MSAI_REGISTRY (REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ID)
                 VALUES (MSAI_REGISTRY_SEQ.NEXTVAL, :rname, :mname, :sid) RETURNING REGISTRY_ID INTO :rid`,
                { rname: reg.REGISTRY_NAME, mname: reg.MODULE_NAME, sid: newSourceId, rid: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
                { autoCommit: false }
            );
            const newRegId = rResult.outBinds.rid[0];

            await connection.execute(
                `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID)
                 SELECT MSAI_LINK_SEQ.NEXTVAL, :newRegId, MODULE_ID FROM MSAI_REGISTRY_MODULES WHERE REGISTRY_ID = :oldRegId`,
                { newRegId: newRegId, oldRegId: reg.REGISTRY_ID }, { autoCommit: false }
            );

            await connection.execute(
                `INSERT INTO MSAI_MAPPING_METADATA (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                 SELECT MSAI_MAPPING_SEQ.NEXTVAL, :newRegId, :rname, OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC
                 FROM MSAI_MAPPING_METADATA WHERE REGISTRY_ID = :oldRegId`,
                { newRegId: newRegId, rname: reg.REGISTRY_NAME, oldRegId: reg.REGISTRY_ID }, { autoCommit: false }
            );
        }
        await connection.commit();
        res.json({ success: true, sourceId: newSourceId });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 7. Get Sources in Project
app.get('/api/projects/:id/sources', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        const result = await connection.execute(
            `SELECT s.*, 
                    (SELECT COUNT(*) FROM MSAI_SOURCE_MODULES sm WHERE sm.SOURCE_ID = s.SOURCE_ID) as MODULE_COUNT
             FROM MSAI_SOURCES s 
             WHERE s.PROJECT_ID = :id 
             ORDER BY s.CREATED_AT DESC`,
            [id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 8. Create Source in Project
app.post('/api/projects/:id/sources', async (req, res) => {
    const { id } = req.params;
    const { name, description, moduleIds } = req.body;
    console.log('[DEBUG] Create Source Request for Project:', id, { name, description, moduleIds });
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        // Create Source
        const result = await connection.execute(
            `INSERT INTO MSAI_SOURCES (SOURCE_ID, SOURCE_NAME, PROJECT_ID, DESCRIPTION) 
             VALUES (MSAI_SOURCE_SEQ.NEXTVAL, :p_name, :p_pid, :p_desc) RETURNING SOURCE_ID INTO :p_sid`,
            {
                p_name: name,
                p_pid: id,
                p_desc: description,
                p_sid: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            },
            { autoCommit: false }
        );

        const sourceId = result.outBinds.p_sid[0];
        console.log('[DEBUG] Source Created with ID:', sourceId);

        // Insert modules if provided
        if (moduleIds && moduleIds.length > 0) {
            console.log('[DEBUG] Inserting modules for source:', moduleIds);
            for (const mid of moduleIds) {
                await connection.execute(
                    `INSERT INTO MSAI_SOURCE_MODULES (SOURCE_ID, MODULE_ID) VALUES (:sid, :mid)`,
                    { sid: sourceId, mid: mid },
                    { autoCommit: false }
                );
            }
        } else {
            console.log('[DEBUG] No moduleIds provided for source');
        }

        await connection.commit();
        res.json({ success: true, sourceId: sourceId });
    } catch (err) {
        console.error('[ERROR] Source Creation Failed:', err);
        if (connection) await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 7. Get Selected Modules for Source
app.get('/api/sources/:id/modules', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        // Get modules assigned to this specific source
        const result = await connection.execute(
            `SELECT MODULE_ID FROM MSAI_SOURCE_MODULES WHERE SOURCE_ID = :id`,
            [id]
        );

        res.json({
            sourceId: id,
            selectedModuleIds: result.rows.map(r => r[0])
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// 8. Update Selected Modules for Source
app.post('/api/sources/:id/modules', async (req, res) => {
    const { id } = req.params;
    const { moduleIds } = req.body; // Array of IDs
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

        // Remove old selections for this source
        await connection.execute(
            `DELETE FROM MSAI_SOURCE_MODULES WHERE SOURCE_ID = :id`,
            [id],
            { autoCommit: false }
        );

        // Insert new selections
        for (const mid of moduleIds) {
            await connection.execute(
                `INSERT INTO MSAI_SOURCE_MODULES (SOURCE_ID, MODULE_ID) VALUES (:sid, :mid)`,
                [id, mid],
                { autoCommit: false }
            );
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        if (connection) await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        if (connection) await connection.close();
    }
});

// Delete Registry
app.delete('/api/registry/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        const pool = await getPool();
        connection = await pool.getConnection();

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
        const pool = await getPool();
        connection = await pool.getConnection();

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
            bindMapping.forEach((m, idx) => {
                const colName = columns[idx]; // original column name from request
                // Try multiple casing strategies to find the value in the row object
                let val = row[colName] ?? row[colName.toLowerCase()] ?? row[colName.toUpperCase()];

                // If still undefined, search case-insensitively
                if (val === undefined) {
                    const key = Object.keys(row).find(k => k.toLowerCase() === colName.toLowerCase());
                    if (key) val = row[key];
                }

                if (val === undefined || val === null || val === '') {
                    rowObj[m.bindName] = null;
                } else if (typeof val === 'object' && val instanceof Date) {
                    rowObj[m.bindName] = val; // Pass native Date object
                } else {
                    let strVal = String(val);
                    // Simple date heuristic check
                    const timestamp = Date.parse(strVal);
                    if (!isNaN(timestamp) && (strVal.includes('-') || strVal.includes('/')) && strVal.length > 5) {
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
            await connection.rollback(); // Just to be safe
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

        console.log(`🎉 SYNC COMPLETE for ${tableName}. Rows affected: ${result.rowsAffected}`);
        res.json({ success: true, rowsAffected: result.rowsAffected });

    } catch (err) {
        console.error('Bulk Sync Error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (rbErr) { console.error('Rollback Error:', rbErr); }
        }
        res.status(500).json({
            status: 'error',
            message: err.message,
            sqlError: err.offset ? `Error at pos ${err.offset}` : undefined
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
