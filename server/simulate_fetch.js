const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

// Re-implementing backend logic to see what it returns
function nameToId(name) {
    if (!name) return 'unknown';
    let gid = name.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '');
    if (gid === 'workforce' || gid === 'workforce_management') return 'workforce_management';
    if (gid === 'payables' || gid === 'accounts_payable') return 'accounts_payable';
    return gid;
}

async function simulateFrontendFetch() {
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

        // 1. Get Project Modules (Simulating /api/projects/1)
        const modsResult = await connection.execute(
            `SELECT m.MODULE_NAME FROM MSAI_MODULES m
             JOIN MSAI_PROJECT_MODULES pm ON m.MODULE_ID = pm.MODULE_ID
             WHERE pm.PROJECT_ID = 1`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const groupIds = Array.from(new Set(modsResult.rows.map(r => nameToId(r.MODULE_NAME))));
        console.log('Frontend Group IDs:', groupIds);

        // 2. Fetch Configs for each Group
        for (const gid of groupIds) {
            console.log(`--- Fetching for Group: ${gid} ---`);

            const searchNames = [gid];
            // Find aliases (simulating backend logic)
            const findNames = await connection.execute(`SELECT DISTINCT MODULE_NAME FROM MSAI_MODULES`);
            findNames.rows.forEach(r => {
                if (nameToId(r[0]) === gid.toLowerCase()) {
                    searchNames.push(r[0]);
                }
            });

            const regResult = await connection.execute(
                `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ID 
                 FROM MSAI_REGISTRY 
                 WHERE UPPER(MODULE_NAME) IN (${searchNames.map((_, i) => `'${searchNames[i].toUpperCase()}'`).join(',')})`,
                [],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            console.log(`Found ${regResult.rows.length} registries for ${gid}`);
            regResult.rows.forEach(r => {
                console.log(`  - Registry: ${r.REGISTRY_NAME}, SOURCE_ID: ${r.SOURCE_ID}, Computed GID: ${nameToId(r.MODULE_NAME)}`);
            });
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

simulateFrontendFetch();
