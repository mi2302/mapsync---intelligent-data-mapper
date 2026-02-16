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

        const res = await connection.execute('SELECT * FROM MSAI_MODULES', [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log('--- DATA ---');
        console.log(JSON.stringify(res.rows, null, 2));

        const cols = await connection.execute("SELECT column_name FROM user_tab_columns WHERE table_name = 'MSAI_MODULES'");
        console.log('--- COLUMNS ---');
        console.log(JSON.stringify(cols.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) await connection.close();
    }
}
run();
