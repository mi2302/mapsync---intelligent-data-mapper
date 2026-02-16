const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

async function run() {
    let connection;
    try {
        const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: password,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        console.log('--- MSAI_MODULES ---');
        const modules = await connection.execute('SELECT * FROM MSAI_MODULES', [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log(JSON.stringify(modules.rows, null, 2));

        console.log('--- MSAI_REGISTRY ---');
        const registry = await connection.execute('SELECT * FROM MSAI_REGISTRY', [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log(JSON.stringify(registry.rows, null, 2));

        console.log('--- MSAI_MAPPING_METADATA Sample ---');
        const mapping = await connection.execute('SELECT DISTINCT MODULE_NAME, REGISTRY_ID FROM MSAI_MAPPING_METADATA', [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log(JSON.stringify(mapping.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) await connection.close();
    }
}
run();
