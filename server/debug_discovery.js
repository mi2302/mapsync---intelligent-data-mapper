
const oracledb = require('oracledb');
require('dotenv').config({ path: '../.env' });

async function checkTables() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        console.log('Connected to Oracle.');

        console.log('\n--- Checking user_tables ---');
        const userRes = await connection.execute(`SELECT table_name FROM user_tables ORDER BY table_name`);
        console.log('Count:', userRes.rows.length);
        userRes.rows.slice(0, 10).forEach(r => console.log(' -', r[0]));

        console.log('\n--- Checking all_tables (Filtered by MSAI/FIN/AP/PUR) ---');
        const allRes = await connection.execute(`
            SELECT table_name, owner 
            FROM all_tables 
            WHERE table_name LIKE 'MSAI_%' 
               OR table_name LIKE 'FIN_%' 
               OR table_name LIKE 'AP_%' 
               OR table_name LIKE 'PUR_%'
            ORDER BY table_name
        `);
        console.log('Count:', allRes.rows.length);
        allRes.rows.slice(0, 10).forEach(r => console.log(` - ${r[0]} (Owner: ${r[1]})`));

    } catch (err) {
        console.error(err);
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

checkTables();
