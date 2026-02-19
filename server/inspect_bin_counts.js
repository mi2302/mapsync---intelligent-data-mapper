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

async function inspectRecycleBin() {
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

        const tables = ['MSAI_REGISTRY', 'MSAI_MAPPING_METADATA', 'MSAI_MODULES', 'MSAI_REGISTRY_MODULES'];

        for (const t of tables) {
            console.log(`\n--- Inspecting versions of ${t} ---`);
            const result = await connection.execute(
                `SELECT object_name, original_name, droptime FROM user_recyclebin 
                 WHERE original_name = :name ORDER BY droptime DESC`,
                [t]
            );

            for (const row of result.rows) {
                const binName = row[0]; // BIN$....
                const dropTime = row[2];
                try {
                    // Query the BIN table directly
                    const countRes = await connection.execute(`SELECT count(*) FROM "${binName}"`);
                    console.log(`Time: ${dropTime} | Name: ${binName} | Rows: ${countRes.rows[0][0]}`);
                } catch (e) {
                    console.log(`Time: ${dropTime} | Name: ${binName} | Error querying: ${e.message}`);
                }
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

inspectRecycleBin();
