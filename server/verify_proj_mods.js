const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

async function checkProjectModules() {
    let connection;
    try {
        const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
        const dbConfig = {
            user: process.env.DB_USER,
            password: password,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        };

        if (process.platform === 'win32') {
            oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
        }

        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to DB');

        console.log('--- PROJECTS ---');
        const projects = await connection.execute(`SELECT PROJECT_ID, PROJECT_NAME FROM MSAI_PROJECTS ORDER BY CREATED_AT DESC`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log(projects.rows);

        console.log('\n--- MODULES ASSIGNED TO PROJECTS ---');
        const assignments = await connection.execute(`SELECT * FROM MSAI_PROJECT_MODULES`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log(assignments.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

checkProjectModules();
