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
            SELECT column_name, data_type, data_length, data_precision, data_scale
            FROM user_tab_columns 
            WHERE table_name = 'MSAI_HR_EMPLOYEE_MASTER'
            AND column_name = 'EMP_ID'
        `, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        console.log('--- EMP_ID Column Details ---');
        console.log(JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) await connection.close();
    }
}
check();
