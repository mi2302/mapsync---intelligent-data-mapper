const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

async function checkSourceModules() {
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

        console.log('--- SOURCES ---');
        const sources = await connection.execute(`SELECT SOURCE_ID, SOURCE_NAME, PROJECT_ID FROM MSAI_SOURCES ORDER BY CREATED_AT DESC`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.table(sources.rows);

        console.log('\n--- MODULES ASSIGNED TO SOURCES ---');
        const assignments = await connection.execute(
            `SELECT sm.SOURCE_ID, s.SOURCE_NAME, sm.MODULE_ID, m.MODULE_NAME
             FROM MSAI_SOURCE_MODULES sm
             JOIN MSAI_SOURCES s ON sm.SOURCE_ID = s.SOURCE_ID
             JOIN MSAI_MODULES m ON sm.MODULE_ID = m.MODULE_ID
             ORDER BY sm.SOURCE_ID DESC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.table(assignments.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

checkSourceModules();
