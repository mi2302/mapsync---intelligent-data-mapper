const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

// Initialize Oracle Client for Thick Mode
try {
    oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
} catch (err) {
    console.error('Whoops! Oracle Client init failed:', err);
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

        console.log('--- Checking MSAI_MODULES Structure ---');
        const desc = await connection.execute(
            `SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'MSAI_MODULES'`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log(JSON.stringify(desc.rows, null, 2));

        console.log('--- Checking MSAI_MODULES Content ---');
        const data = await connection.execute(
            `SELECT * FROM MSAI_MODULES`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log(JSON.stringify(data.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}
check();
