const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

async function inspectRegistries() {
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

        // Check columns in MSAI_REGISTRY
        const colsResult = await connection.execute(
            `SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'MSAI_REGISTRY'`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log('MSAI_REGISTRY Columns:', JSON.stringify(colsResult.rows, null, 2));

        // Check data in MSAI_REGISTRY
        const dataResult = await connection.execute(
            `SELECT * FROM MSAI_REGISTRY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log('MSAI_REGISTRY Data:', JSON.stringify(dataResult.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

inspectRegistries();
