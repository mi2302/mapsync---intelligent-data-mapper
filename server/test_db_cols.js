const oracledb = require('oracledb');
require('dotenv').config();

(async function () {
    try {
        oracledb.initOracleClient({ libDir: 'instantclient_19_19' });
        const conn = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_SERVICE_NAME
        });

        // Check registry layout
        const res = await conn.execute(`SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'MSAI_REGISTRY'`);
        console.log("MSAI_REGISTRY cols:", res.rows);

        const res2 = await conn.execute(`SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'MSAI_SOURCES'`);
        console.log("MSAI_SOURCES cols:", res2.rows);

        await conn.close();
    } catch (e) {
        console.error(e);
    }
})();
