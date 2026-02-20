const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

async function checkProjectModules() {
    let connection;
    try {
        const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
        const dbConfig = {
            user: process.env.DB_USER,
            password: password,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        };

        if (process.platform === 'win32') {
            oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
        }

        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to DB');

        const result = await connection.execute(
            `SELECT pm.*, m.MODULE_NAME 
             FROM MSAI_PROJECT_MODULES pm
             JOIN MSAI_MODULES m ON pm.MODULE_ID = m.MODULE_ID
             WHERE pm.PROJECT_ID = 1`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('Project 1 Modules:', JSON.stringify(result.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

checkProjectModules();
