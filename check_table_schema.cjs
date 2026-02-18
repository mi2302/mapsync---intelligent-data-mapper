const oracledb = require('./server/node_modules/oracledb');
const path = require('path');
const dotenv = require('./server/node_modules/dotenv');

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

async function run() {
    let connection;
    try {
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'server', 'instantclient_19_19') });
        const conn = await oracledb.getConnection({
            user: process.env.DB_USER.trim(),
            password: process.env.DB_PASSWORD.trim().replace(/^"|"$/g, ''),
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        const res = await conn.execute(`SELECT column_name, nullable FROM user_tab_columns WHERE table_name = 'MSAI_MODULES'`);
        console.log(JSON.stringify(res.rows, null, 2));

        const data = await conn.execute(`SELECT * FROM MSAI_MODULES WHERE ROWNUM = 1`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log("Sample row:", JSON.stringify(data.rows, null, 2));

        await conn.close();
    } catch (e) {
        console.error(e);
    }
}
run();
