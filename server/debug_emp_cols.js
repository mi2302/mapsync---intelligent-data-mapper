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

async function check() {
    let connection;
    try {
        const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
        const dbConfig = {
            user: process.env.DB_USER,
            password: password,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        };
        connection = await oracledb.getConnection(dbConfig);

        console.log('--- Checking MSAI_HR_EMPLOYEE_MASTER Columns ---');
        const desc = await connection.execute(
            `SELECT column_name, data_type 
       FROM user_tab_columns 
       WHERE table_name = 'MSAI_HR_EMPLOYEE_MASTER'
       ORDER BY column_id`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log(JSON.stringify(desc.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}
check();
