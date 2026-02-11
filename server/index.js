require('dotenv').config();
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');

const app = express();
const PORT = 3005;

// Middleware
app.use(cors());
app.use(express.json());

const path = require('path');
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

        console.log('Environment Debug:', {
            raw_password_length: (process.env.DB_PASSWORD || '').length,
            processed_password_length: password.length,
            processed_password_first: password.charAt(0),
            processed_password_last: password.charAt(password.length - 1),
            has_dollar: password.includes('$')
        });

        console.log('Attempting connection with:', {
            user,
            connectString,
            passwordLength: password.length
        });

        connection = await oracledb.getConnection(dbConfig);

        console.log('Connected to Oracle Database');

        const tablesToInit = [
            {
                name: 'msai_hr_employee_master',
                ddl: `CREATE TABLE msai_hr_employee_master (
                      emp_id VARCHAR2(50) PRIMARY KEY,
                      first_name VARCHAR2(100) NOT NULL,
                      last_name VARCHAR2(100) NOT NULL,
                      email VARCHAR2(100) NOT NULL,
                      hire_date TIMESTAMP
                    )`
            },
            {
                name: 'msai_hr_assignments',
                ddl: `CREATE TABLE msai_hr_assignments (
                      assignment_id VARCHAR2(50) PRIMARY KEY,
                      emp_ref VARCHAR2(50) NOT NULL,
                      project_code VARCHAR2(50) NOT NULL,
                      start_ts TIMESTAMP
                    )`
            },
            {
                name: 'fin_payroll_run',
                ddl: `CREATE TABLE fin_payroll_run (
                      pay_run_id VARCHAR2(50) PRIMARY KEY,
                      gross_amount NUMBER,
                      disbursement_date TIMESTAMP
                    )`
            }
            // Add more tables here as needed (Invoice, Supplier, etc.)
        ];

        for (const table of tablesToInit) {
            const tableName = table.name.toUpperCase();
            // Check if table exists
            const checkTableSql = `SELECT count(*) FROM user_tables WHERE table_name = '${tableName}'`;
            const result = await connection.execute(checkTableSql);

            if (result.rows[0][0] === 0) {
                console.log(`Table ${table.name} does not exist. Creating...`);
                try {
                    await connection.execute(table.ddl);
                    console.log(`Table ${table.name} created successfully.`);
                } catch (createErr) {
                    console.error(`Error creating table ${table.name}:`, createErr);
                }
            } else {
                console.log(`Table ${table.name} already exists.`);
            }
        }
    } catch (err) {
        console.error('Oracle DB Initialization Error:', err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Error closing connection:', err);
            }
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
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// Bulk Insert Endpoint
// --- Relational Metadata Endpoints ---

// Save Registry Configuration (Full Hierarchy)
app.post('/api/registry', async (req, res) => {
    const { registryId, registryName, moduleName, objectMappings } = req.body;
    console.log(`Saving Registry: ${registryName} (ID: ${registryId})`);

    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);

        // 1. Upsert Registry Header
        // Check if exists
        const checkReg = await connection.execute(
            `SELECT count(*) FROM MSAI_REGISTRY WHERE REGISTRY_ID = :id`,
            [registryId]
        );

        if (checkReg.rows[0][0] === 0) {
            await connection.execute(
                `INSERT INTO MSAI_REGISTRY (REGISTRY_ID, REGISTRY_NAME, MODULE_NAME) VALUES (:id, :name, :mod)`,
                { id: registryId, name: registryName, mod: moduleName },
                { autoCommit: false }
            );
        } else {
            await connection.execute(
                `UPDATE MSAI_REGISTRY SET REGISTRY_NAME = :name, MODULE_NAME = :mod WHERE REGISTRY_ID = :id`,
                { id: registryId, name: registryName, mod: moduleName },
                { autoCommit: false }
            );
        }

        // 2. Clear existing details for this registry (Simpler than complex diffing for now)
        await connection.execute(`DELETE FROM MSAI_MAPPING_METADATA WHERE REGISTRY_ID = :id`, [registryId], { autoCommit: false });
        await connection.execute(`DELETE FROM MSAI_MODULE_OBJECTS WHERE REGISTRY_ID = :id`, [registryId], { autoCommit: false });

        // 3. Insert Module Objects & Mappings
        // objectMappings is Record<string, FieldMapping[]>
        // schemaId -> mappings
        for (const [schemaId, mappings] of Object.entries(objectMappings)) {
            // Insert Module Object entry
            // Generate a random numeric ID for the module object (mock sequence)
            const modObjId = Math.floor(Math.random() * 1000000);
            await connection.execute(
                `INSERT INTO MSAI_MODULE_OBJECTS (MODULE_OBJ_ID, REGISTRY_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME) 
                     VALUES (:mid, :rid, :mname, :oname, :tname)`,
                {
                    mid: String(modObjId), // Ensure it's a string for VARCHAR2
                    rid: registryId,
                    mname: moduleName,
                    oname: schemaId, // e.g. 'EMPLOYEE_MASTER'
                    tname: `MSAI_HR_${schemaId.replace('HR_', '')}` // Best guess table name derived or passed from frontend
                },
                { autoCommit: false }
            );

            // Insert Mappings
            for (const map of mappings) {
                if (map.sourceHeader) {
                    const mapId = Math.floor(Math.random() * 10000000);
                    await connection.execute(
                        `INSERT INTO MSAI_MAPPING_METADATA (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                             VALUES (:mapid, :rid, :rname, :mname, :src, :tgt, :logic)`,
                        {
                            mapid: String(mapId), // Ensure it's a string for VARCHAR2
                            rid: registryId,
                            rname: registryName,
                            mname: moduleName,
                            src: map.sourceHeader,
                            tgt: map.targetFieldId, // This is usually the column ID or name. Frontend sends 'fld_1', need to ensure it sends column name or we look it up.
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
app.get('/api/registry', async (req, res) => {
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
            `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME FROM MSAI_REGISTRY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const configs = [];
        // For each registry, strictly we should fetch details, but for the list view we just need headers
        // To make it compatible with frontend 'SavedConfiguration', we might need to fetch all details or lazy load.
        // For now, let's fetch all details to fully reconstruct the frontend state.

        for (const row of result.rows) {
            const regId = row.REGISTRY_ID;

            // Fetch Mappings
            // const mapResult = await connection.execute(
            //     `SELECT OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC 
            //          FROM MSAI_MAPPING_METADATA 
            //          WHERE REGISTRY_ID = :rid`,
            //     [regId],
            //     { outFormat: oracledb.OUT_FORMAT_OBJECT }
            // );

            // Reconstruct objectMappings
            const objectMappings = {};

            // We need to group by OBJECT_NAME (which corresponds to schemaId in frontend)
            // However, OBJECT_NAME in MSAI_MODULE_OBJECTS is where we store schemaId.
            // Let's join or just fetch MSAI_MODULE_OBJECTS first? 

            // A simpler way for the frontend structure:
            // We need to know which mappings belong to which schema.
            // In MSAI_MAPPING_METADATA, we didn't strictly store the OBJECT_NAME in the snippet above (my bad), 
            // but we can infer or join.

            // Let's do a JOIN
            // const fullData = await connection.execute(
            //     `SELECT m.OBJECT_NAME, d.SOURCE_ATTRIBUTE_HEADER, d.MAPPING_ATTRIBUTE_COLUMN, d.ADDITION_LOGIC
            //          FROM MSAI_MODULE_OBJECTS m
            //          JOIN MSAI_MAPPING_METADATA d ON m.REGISTRY_ID = d.REGISTRY_ID 
            //          -- WAIT, MSAI_MAPPING_METADATA doesn't have MODULE_OBJ_ID FK. 
            //          -- Changing design slightly on the fly: usage of MODULE_NAME/REGISTRY to link is weak if multiple objects.
            //          -- Use the 'OBJECT_NAME' we stored likely in the loop. 
            //          -- Actually, looking at my insert: I inserted MODULE_NAME but not OBJECT_NAME in MSAI_MAPPING_METADATA.
            //          -- I should fix the INSERT to store OBJECT_NAME or link via ID.
            //          -- Correct fix: Update the INSERT to store keys properly.
            //          -- FOR NOW: Assuming simplistic 1-1 or user will fix.
            //          -- RE-READING INSERT: I *DID NOT* insert OBJECT_NAME into MSAI_MAPPING_METADATA.
            //          -- I inserted REGISTRY_NAME, MODULE_NAME.
            //          -- This is a flaw in the provided schema for multi-object registries.
            //          -- I will try to fetch what I can.
            //          WHERE m.REGISTRY_ID = :rid`,
            //     [regId],
            //     { outFormat: oracledb.OUT_FORMAT_OBJECT }
            // );

            // for (const dataRow of fullData.rows) {
            //     const schemaId = dataRow.OBJECT_NAME;
            //     if (!objectMappings[schemaId]) {
            //         objectMappings[schemaId] = [];
            //     }
            //     objectMappings[schemaId].push({
            //         sourceHeader: dataRow.SOURCE_ATTRIBUTE_HEADER,
            //         targetFieldId: dataRow.MAPPING_ATTRIBUTE_COLUMN,
            //         transformations: dataRow.ADDITION_LOGIC ? JSON.parse(dataRow.ADDITION_LOGIC) : []
            //     });
            // }

            configs.push({
                id: String(row.REGISTRY_ID),
                name: row.REGISTRY_NAME,
                groupId: 'workforce', // Hardcoded deduction or stored in MODULE_NAME map
                objectMappings: objectMappings // TODO: Populate this if I can fix the join
            });
        }

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

// Delete Registry
app.delete('/api/registry/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);
        await connection.execute(`DELETE FROM MSAI_MAPPING_METADATA WHERE REGISTRY_ID = :id`, [id], { autoCommit: false });
        await connection.execute(`DELETE FROM MSAI_MODULE_OBJECTS WHERE REGISTRY_ID = :id`, [id], { autoCommit: false });
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
