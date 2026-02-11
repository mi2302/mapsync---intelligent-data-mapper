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
