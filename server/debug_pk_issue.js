const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkPK() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        // Test with MSAI_SITE_ASSIGNMENTS
        const tableName = 'MSAI_SITE_ASSIGNMENTS';

        console.log(`Checking PK for ${tableName}...`);

        // Query 1: Check Constraints directly
        const q1 = await connection.execute(
            `SELECT constraint_name, constraint_type 
             FROM all_constraints 
             WHERE table_name = :tname AND constraint_type = 'P'`,
            [tableName]
        );
        console.log('Constraints found:', q1.rows);

        if (q1.rows.length > 0) {
            const constraintName = q1.rows[0][0];
            // Query 2: Check columns for that constraint
            const q2 = await connection.execute(
                `SELECT column_name, position 
                 FROM all_cons_columns 
                 WHERE constraint_name = :cname
                 ORDER BY position`,
                [constraintName]
            );
            console.log('Columns in PK:', q2.rows);
        } else {
            // Query 3: Check DDL to see if it was created correctly
            // user_constraints vs all_constraints?
            // Try user_constraints
            const q3 = await connection.execute(
                `SELECT constraint_name 
                 FROM user_constraints 
                 WHERE table_name = :tname AND constraint_type = 'P'`,
                [tableName]
            );
            console.log('User Constraints found:', q3.rows);
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

checkPK();
