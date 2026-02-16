const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

// Initialize Oracle Client
try {
    if (process.platform === 'win32') {
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
    }
} catch (err) {
    console.error('Oracle Client init failed:', err);
    process.exit(1);
}

// Logic to link registries to modules based on name/group
const GROUP_MAPPING = {
    'workforce': ['EMPLOYEE_MASTER', 'ASSIGNMENT', 'PAYROLL'],
    'payables': ['INVOICE_HEADER', 'INVOICE_LINES'],
    'suppliers': ['SUPPLIER_HEADER', 'SUPPLIER_SITES', 'SUPPLIER_TAX']
};

async function restoreLinks() {
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

        // 1. Get all Registry Headers
        const registries = await connection.execute(
            `SELECT REGISTRY_ID, REGISTRY_NAME, MODULE_NAME FROM MSAI_REGISTRY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log(`Found ${registries.rows.length} registries.`);

        // 2. Loop through each and re-create links
        for (const reg of registries.rows) {
            let groupId = 'workforce';

            // Simple heuristic to fix group ID if possible (assuming module_name stores the group name)
            if (reg.MODULE_NAME.toLowerCase().includes('payable')) groupId = 'payables';
            else if (reg.MODULE_NAME.toLowerCase().includes('vendor') || reg.MODULE_NAME.toLowerCase().includes('supplier')) groupId = 'suppliers';

            const objects = GROUP_MAPPING[groupId];
            if (!objects) continue;

            console.log(`Restoring links for Registry: "${reg.REGISTRY_NAME}" (Group: ${groupId})`);

            for (const obj of objects) {
                // Find correct module ID from our newly fixed table
                const modResult = await connection.execute(
                    `SELECT MODULE_ID FROM MSAI_MODULES WHERE OBJECT_NAME = :obj`,
                    [obj],
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );

                if (modResult.rows.length > 0) {
                    const moduleId = modResult.rows[0].MODULE_ID;
                    const linkId = String(Math.floor(Math.random() * 100000000));

                    await connection.execute(
                        `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID) VALUES (:lid, :rid, :mid)`,
                        { lid: linkId, rid: reg.REGISTRY_ID, mid: moduleId },
                        { autoCommit: false }
                    );
                    console.log(`  Linked -> ${moduleId} (${obj})`);
                }
            }
        }

        await connection.commit();
        console.log('Successfully restored registry links.');

    } catch (err) {
        console.error('Error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) { }
        }
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}

restoreLinks();
