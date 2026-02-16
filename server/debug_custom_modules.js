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

        console.log('=== ALL MODULES ===');
        const modules = await connection.execute(
            'SELECT MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME FROM MSAI_MODULES ORDER BY MODULE_NAME',
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        console.log(JSON.stringify(modules.rows, null, 2));

        console.log('\n=== TABLE METADATA FOR CUSTOM MODULES ===');
        const customModules = modules.rows.filter(m =>
            !['Workforce Management', 'Accounts Payable', 'Vendor Relations'].includes(m.MODULE_NAME)
        );

        for (const mod of customModules) {
            console.log(`\nTable: ${mod.TARGET_TABLE_NAME}`);
            try {
                const cols = await connection.execute(
                    `SELECT column_name, data_type, nullable 
                     FROM user_tab_columns 
                     WHERE table_name = :t 
                     ORDER BY column_id`,
                    [mod.TARGET_TABLE_NAME],
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                console.log(JSON.stringify(cols.rows, null, 2));
            } catch (e) {
                console.log(`Error: ${e.message}`);
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) await connection.close();
    }
}
run();
