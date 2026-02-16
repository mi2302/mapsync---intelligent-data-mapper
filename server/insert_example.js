const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

// Initialize Oracle Client
try {
    if (process.platform === 'win32') {
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
    }
} catch (err) {
    console.error('Oracle Client init failed:', err);
    process.exit(1);
}

// ---------------------------------------------------------
// CONFIGURATION: Dynamic Data to Insert
// ---------------------------------------------------------
const TARGET_TABLE = 'MSAI_HR_EMPLOYEE_MASTER';

// The columns we want to map/insert into
const COLUMNS = ['EMP_ID', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'HIRE_DATE'];

// The data rows (Matched to the columns above)
// In the real app, this comes from the "MappingInterface" preview data
const DATA_ROWS = [
    {
        EMP_ID: 1001,
        FIRST_NAME: 'John',
        LAST_NAME: 'Doe',
        EMAIL: 'john.doe@example.com',
        HIRE_DATE: new Date('2023-01-15')
    },
    {
        EMP_ID: 1002,
        FIRST_NAME: 'Jane',
        LAST_NAME: 'Smith',
        EMAIL: 'jane.smith@test.com',
        HIRE_DATE: new Date('2023-02-20')
    }
];
// ---------------------------------------------------------

async function runInsert() {
    let connection;
    try {
        const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
        const dbConfig = {
            user: process.env.DB_USER,
            password: password,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        };
        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to DB');

        // 1. Construct the SQL Dynamically
        // We use "Double Quotes" for column names to be safe with Oracle case sensitivity
        const colStr = COLUMNS.map(c => `"${c}"`).join(', ');

        // We use :BindVariables for values to prevent SQL Injection and allow Bulk Insert
        const valStr = COLUMNS.map(c => `:${c}`).join(', ');

        const sql = `INSERT INTO ${TARGET_TABLE} (${colStr}) VALUES (${valStr})`;

        console.log('Generated SQL:', sql);

        // 2. Prepare Bind Definitions (Optional but recommended for performance/types)
        // By default, oracledb infers types, but for Date/Number consistency, explicit binds help.
        // For simplicity in this generic script, we let Oracle infer mostly.

        const options = {
            autoCommit: true,
            bindDefs: {
                EMP_ID: { type: oracledb.NUMBER },
                FIRST_NAME: { type: oracledb.STRING, maxSize: 100 },
                LAST_NAME: { type: oracledb.STRING, maxSize: 100 },
                EMAIL: { type: oracledb.STRING, maxSize: 255 },
                HIRE_DATE: { type: oracledb.DATE }
            }
        };

        // 3. Execute Bulk Insert
        // executeMany takes an array of objects (if using named binds) or array of arrays
        const result = await connection.executeMany(sql, DATA_ROWS, options);

        console.log(`Success! Data populated in ${TARGET_TABLE}`);
        console.log(`Rows Inserted: ${result.rowsAffected}`);

    } catch (err) {
        console.error('Insert Failed:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}

runInsert();
