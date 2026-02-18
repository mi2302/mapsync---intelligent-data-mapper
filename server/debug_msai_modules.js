const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkModules() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        const result = await connection.execute(
            `SELECT MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME FROM MSAI_MODULES`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log("Current entries in MSAI_MODULES:");
        console.table(result.rows);

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

checkModules();
