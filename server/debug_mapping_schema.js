require('dotenv').config();
const oracledb = require('oracledb');

async function check() {
    let connection;
    try {
        const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: password,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        const res = await connection.execute(`
            SELECT column_name, data_type 
            FROM user_tab_columns 
            WHERE table_name = 'MSAI_MAPPING_METADATA'
            ORDER BY column_id
        `);
        console.log('--- MSAI_MAPPING_METADATA Columns ---');
        console.log(res.rows.map(r => `${r[0]} (${r[1]})`).join(', '));

        const data = await connection.execute(`SELECT * FROM MSAI_MAPPING_METADATA FETCH FIRST 5 ROWS ONLY`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log('--- Sample Data ---');
        console.log(JSON.stringify(data.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) await connection.close();
    }
}
check();
