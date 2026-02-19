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

async function restore() {
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

        // Restore tables from recycle bin to temporary names to avoid conflict with new tables
        // We look for the most recent drop (MAX droptime)
        const restoreMap = {
            'MSAI_REGISTRY': 'BIN$Sxd+KQGh0RXgYxsAAAqIng==$0',
            'MSAI_MODULES': 'BIN$Sxd+KQGm0RXgYxsAAAqIng==$0',
            'MSAI_MAPPING_METADATA': 'BIN$Sxd+KQGd0RXgYxsAAAqIng==$0',
            'MSAI_REGISTRY_MODULES': 'BIN$Sxd+KQGX0RXgYxsAAAqIng==$0'
        };

        for (const [t, binName] of Object.entries(restoreMap)) {
            const restoreName = `${t}_RESTORED`;
            console.log(`Restoring ${t} (BIN name: ${binName}) to ${restoreName}...`);

            // Drop if RESTORED table already exists
            try { await connection.execute(`DROP TABLE ${restoreName}`); } catch (e) { }

            // Flashback
            try {
                await connection.execute(`FLASHBACK TABLE "${binName}" TO BEFORE DROP RENAME TO ${restoreName}`);
                console.log(`Success: ${t} restored as ${restoreName}`);
            } catch (e) {
                console.log(`Error restoring ${binName}: ${e.message}`);
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

restore();
