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

        const res = await connection.execute(`SELECT table_name FROM user_tables WHERE table_name LIKE 'MSAI%'`);
        console.log('--- Tables Starting with MSAI ---');
        console.log(res.rows);

        const res2 = await connection.execute(`
            SELECT table_name, column_name, data_type 
            FROM user_tab_columns 
            WHERE UPPER(table_name) = 'MSAI_HR_EMPLOYEE_MASTER'
        `, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log('--- MSAI_HR_EMPLOYEE_MASTER Structure ---');
        console.log(res2.rows);

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) await connection.close();
    }
}
check();
