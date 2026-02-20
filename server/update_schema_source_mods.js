const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

async function updateSchema() {
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

        // 1. Create MSAI_SOURCE_MODULES table
        console.log('Creating MSAI_SOURCE_MODULES table...');
        try {
            await connection.execute(`
                CREATE TABLE MSAI_SOURCE_MODULES (
                    SOURCE_ID NUMBER,
                    MODULE_ID NUMBER,
                    PRIMARY KEY (SOURCE_ID, MODULE_ID)
                )
            `);
            console.log('Table created.');
        } catch (e) {
            if (e.errorNum === 955) {
                console.log('Table already exists.');
            } else {
                throw e;
            }
        }

        await connection.commit();
        console.log('Schema update complete.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

updateSchema();
