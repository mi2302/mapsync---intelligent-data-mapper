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

        console.log('Populating icons in MSAI_MODULES...');

        // Icon mapping based on module names
        const iconMapping = {
            'Workforce Management': '\u{1F465}',  // 👥
            'Accounts Payable': '\u{1F9FE}',      // 🧾
            'Vendor Relations': '\u{1F3ED}'       // 🏭
        };

        for (const [moduleName, icon] of Object.entries(iconMapping)) {
            const result = await connection.execute(
                `UPDATE MSAI_MODULES 
                 SET ICON = :icon 
                 WHERE MODULE_NAME = :name`,
                { icon, name: moduleName }
            );
            console.log(`Updated ${result.rowsAffected} rows for "${moduleName}" with icon: ${icon}`);
        }

        await connection.commit();
        console.log('\n✅ Icon population complete!');

        // Verify the update
        console.log('\n--- Verification ---');
        const verify = await connection.execute(
            `SELECT DISTINCT MODULE_NAME, ICON FROM MSAI_MODULES ORDER BY MODULE_NAME`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        verify.rows.forEach(row => {
            console.log(`Module: ${row.MODULE_NAME}, Icon: ${row.ICON || '(null)'}`);
        });

    } catch (err) {
        console.error('Error:', err);
        if (connection) {
            try {
                await connection.rollback();
            } catch (rbErr) {
                console.error('Rollback error:', rbErr);
            }
        }
    } finally {
        if (connection) await connection.close();
    }
}
run();
