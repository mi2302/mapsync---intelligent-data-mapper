const oracledb = require('oracledb');
require('dotenv').config({ path: './.env' });
async function run() {
    let connection;
    try {
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_SERVICE_NAME
        };
        oracledb.initOracleClient({ libDir: './instantclient_19_19' });
        connection = await oracledb.getConnection(config);

        try {
            await connection.execute(`ALTER TABLE MSAI_USERS ADD ROLE VARCHAR2(50) DEFAULT 'USER'`);
            console.log('Added ROLE to MSAI_USERS');
        } catch (e) { console.log('ROLE might already exist in MSAI_USERS'); }

        try {
            await connection.execute(`ALTER TABLE MSAI_PROJECTS ADD CREATED_BY VARCHAR2(255)`);
            console.log('Added CREATED_BY to MSAI_PROJECTS');
        } catch (e) { console.log('CREATED_BY might already exist in MSAI_PROJECTS'); }

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}
run();
