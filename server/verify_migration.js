const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

try {
    if (process.platform === 'win32') {
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
    }
} catch (err) {
    console.error('Oracle Client init failed:', err);
    process.exit(1);
}

async function verify() {
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

        const tables = ['MSAI_REGISTRY', 'MSAI_MODULES', 'MSAI_MAPPING_METADATA'];
        for (const t of tables) {
            const res = await connection.execute(`SELECT count(*) FROM ${t}`);
            console.log(`${t}: ${res.rows[0][0]} rows`);
        }

        const reg = await connection.execute(`SELECT REGISTRY_ID, REGISTRY_NAME FROM MSAI_REGISTRY FETCH FIRST 5 ROWS ONLY`);
        console.log('Sample Registries:', reg.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

verify();
