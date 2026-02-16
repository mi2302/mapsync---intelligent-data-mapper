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

        console.log('1. Fixing MSAI_MODULES Schema...');
        try {
            await connection.execute(`ALTER TABLE MSAI_MODULES ADD (ICON VARCHAR2(50))`);
        } catch (e) {
            console.log('   Note: ICON column already exists or ALTER failed:', e.message);
        }

        console.log('2. Updating Icons for Built-in Modules...');
        const updates = [
            { name: 'Workforce Management', icon: '👥' },
            { name: 'Accounts Payable', icon: '🧾' },
            { name: 'Vendor Relations', icon: '🏭' }
        ];

        for (const up of updates) {
            await connection.execute(
                `UPDATE MSAI_MODULES SET ICON = :icon WHERE MODULE_NAME = :name`,
                [up.icon, up.name]
            );
        }

        console.log('3. Repairing Missing Registry Links...');
        // Find registries that have no links in MSAI_REGISTRY_MODULES
        const orphanRegs = await connection.execute(
            `SELECT REGISTRY_ID, MODULE_NAME FROM MSAI_REGISTRY 
             WHERE REGISTRY_ID NOT IN (SELECT REGISTRY_ID FROM MSAI_REGISTRY_MODULES)`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log(`   Found ${orphanRegs.rows.length} orphaned registries.`);

        for (const reg of orphanRegs.rows) {
            console.log(`   Repairing Registry ID: ${reg.REGISTRY_ID} (Module: ${reg.MODULE_NAME})`);
            // Find objects belonging to this module in MSAI_MODULES
            const objects = await connection.execute(
                `SELECT MODULE_ID FROM MSAI_MODULES WHERE MODULE_NAME = :name`,
                [reg.MODULE_NAME], { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            for (const obj of objects.rows) {
                const linkId = `LINK_${reg.REGISTRY_ID}_${obj.MODULE_ID}`.substring(0, 100);
                try {
                    await connection.execute(
                        `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID) 
                         VALUES (:lid, :rid, :mid)`,
                        [linkId, reg.REGISTRY_ID, obj.MODULE_ID]
                    );
                } catch (e) {
                    console.log(`   Warning: Link already exists or failed for ${linkId}`);
                }
            }
        }

        await connection.commit();
        console.log('Repair Complete.');

    } catch (err) {
        console.error('Repair failed:', err);
    } finally {
        if (connection) await connection.close();
    }
}
run();
