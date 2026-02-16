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

        console.log('Clearing ICONS in DB to allow code fallback...');
        await connection.execute('UPDATE MSAI_MODULES SET ICON = NULL');
        await connection.commit();
        console.log('Update Complete.');

    } catch (err) {
        console.error('Update failed:', err);
    } finally {
        if (connection) await connection.close();
    }
}
run();
