require('dotenv').config();
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');

// Configure oracledb to fetch CLOBs as strings
oracledb.fetchAsString = [oracledb.CLOB];

const app = express();
const PORT = 3005;

// Middleware
app.use(cors());
app.use(express.json());

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
        const { user, password, connectString } = dbConfig;

        console.log('Attempting connection with:', { user, connectString });
        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to Oracle Database');

        // --- SCHEMA MIGRATION: Drop old table if requested ---
        try {
            const checkOld = await connection.execute(`SELECT count(*) FROM user_tables WHERE table_name = 'MSAI_MODULE_OBJECTS'`);
            if (checkOld.rows[0][0] > 0) {
                console.log('Dropping legacy table MSAI_MODULE_OBJECTS...');
                await connection.execute(`DROP TABLE MSAI_MODULE_OBJECTS PURGE`);
            }
        } catch (e) {
            console.log('Note: MSAI_MODULE_OBJECTS drop skipped or failed', e.message);
        }

        console.log('Database initialization complete (No Data Seeding).');

        await connection.commit();
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
            // A. Find Module Definition in MSAI_MODULES (Fixed as per User)
            const checkModule = await connection.execute(
                `SELECT MODULE_ID FROM MSAI_MODULES WHERE MODULE_NAME = :mname AND OBJECT_NAME = :oname`,
                [moduleName, objectName]
            );

            if (checkModule.rows.length === 0) {
                throw new Error(`Critical: Module definition not found for ${moduleName} / ${objectName}. Please ensure the module exists in MSAI_MODULES.`);
            }
            const moduleId = checkModule.rows[0][0];

            // B. Link Registry to Module in MSAI_REGISTRY_MODULES
            const linkId = String(Math.floor(Math.random() * 10000000));
            await connection.execute(
                `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID) VALUES (:lid, :rid, :mid)`,
                { lid: linkId, rid: registryId, mid: moduleId },
                { autoCommit: false }
            );

            // C. Upsert Mappings (MSAI_MAPPING_METADATA)
            // Using MERGE based on (Registry + Object + Column) to update rather than create new
            for (const map of mappings) {
                if (map.sourceHeader) {
                    await connection.execute(
                        `MERGE INTO MSAI_MAPPING_METADATA t
                         USING (SELECT :rid as rid, :oname as oname, :tgt as tgt FROM DUAL) s
                         ON (t.REGISTRY_ID = s.rid AND t.MODULE_NAME = s.oname AND t.MAPPING_ATTRIBUTE_COLUMN = s.tgt)
                         WHEN MATCHED THEN
                             UPDATE SET t.SOURCE_ATTRIBUTE_HEADER = :src, t.ADDITION_LOGIC = :logic, t.REGISTRY_NAME = :rname
                         WHEN NOT MATCHED THEN
                             INSERT (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                             VALUES (:mapid, :rid, :rname, :oname, :src, :tgt, :logic)`,
                        {
                            mapid: String(Math.floor(Math.random() * 10000000)),
                            rid: registryId,
                            rname: registryName,
                            oname: objectName, // Link to specific schema object
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
        let groupId = 'workforce';
        if (row.MODULE_NAME === 'Accounts Payable') groupId = 'payables';
        else if (row.MODULE_NAME === 'Vendor Relations' || row.MODULE_NAME === 'suppliers') groupId = 'suppliers';
        else if (row.MODULE_NAME === 'Workforce Management' || row.MODULE_NAME === 'workforce') groupId = 'workforce';
        else groupId = row.MODULE_NAME; // Fallback to raw value if it's already an ID

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

        // Map ID to Name for Query
        let searchNames = [moduleName];
        if (moduleName === 'workforce') searchNames.push('Workforce Management');
        if (moduleName === 'payables') searchNames.push('Accounts Payable');
        if (moduleName === 'suppliers') searchNames.push('Vendor Relations');

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
    const { tableName, columns, rows } = req.body;

    if (!tableName || !columns || !rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Invalid payload. Required: tableName, columns, rows[]' });
    }

    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        // Construct dynamic INSERT statement
        const columnNames = columns.map(c => `"${c.toUpperCase()}"`).join(', '); // Quote identifiers
        const bindNames = columns.map(c => `:${c}`).join(', ');

        const sql = `INSERT INTO ${tableName} (${columnNames}) VALUES (${bindNames})`;

        console.log('Executing Bulk Insert:', sql);
        console.log('Rows count:', rows.length);
        if (rows.length > 0) {
            console.log('Sample Row Data:', JSON.stringify(rows[0]));
        }

        const result = await connection.executeMany(sql, rows, {
            autoCommit: true,
            bindDefs: columns.reduce((acc, col) => {
                acc[col] = { type: oracledb.STRING, maxSize: 2000 };
                return acc;
            }, {})
        });

        // Explicit commit
        await connection.commit();

        console.log('Bulk Insert Result:', result);
        res.json({ success: true, rowsAffected: result.rowsAffected });

    } catch (err) {
        console.error('Bulk Insert Error:', err);
        res.status(500).json({
            status: 'error',
            message: err.message,
            sqlError: err.offset ? `Error at pos ${err.offset}` : undefined
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing connection:', err);
            }
        }
    }
});

// Start Server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
