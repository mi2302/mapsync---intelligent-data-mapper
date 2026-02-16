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

        const tables = ['MSAI_HR_EMPLOYEE_MASTER', 'MSAI_HR_ASSIGNMENTS', 'FIN_PAYROLL_RUN'];
        for (const t of tables) {
            console.log(`Checking PK for ${t}...`);
            const res = await connection.execute(
                `SELECT cols.column_name
                 FROM all_constraints cons, all_cons_columns cols
                 WHERE cols.table_name = :t
                   AND cons.constraint_type = 'P'
                   AND cons.constraint_name = cols.constraint_name
                   AND cons.owner = cols.owner`,
                [t]
            );
            console.log(JSON.stringify(res.rows, null, 2));
        }

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) await connection.close();
    }
}
run();
