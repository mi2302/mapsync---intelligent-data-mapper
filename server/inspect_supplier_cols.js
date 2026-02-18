const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function inspectCols() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        const tables = [
            'MSAI_SUPPLIER_HEADERS',
            'MSAI_SUPPLIER_SITES',
            'MSAI_SUPPLIER_ADDRESSES',
            'MSAI_SUPPLIER_CONTACTS',
            'MSAI_SITE_ASSIGNMENTS'
        ];

        for (const table of tables) {
            console.log(`\n--- ${table} ---`);
            const result = await connection.execute(
                `SELECT column_name, data_type FROM all_tab_columns WHERE table_name = :tname ORDER BY column_id`,
                [table]
            );
            if (result.rows.length === 0) {
                console.log("No columns found (Table might not exist)");
            } else {
                result.rows.forEach(r => console.log(r[0]));
            }
        }

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

inspectCols();
