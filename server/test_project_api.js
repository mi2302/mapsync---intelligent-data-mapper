const oracledb = require('oracledb');
const path = require('path');
const http = require('http');
require('dotenv').config();

async function simulateProjectCreation() {
    console.log('--- Simulating Project Creation API Call ---');

    const postData = JSON.stringify({
        name: 'Automated Test Project',
        description: 'Testing module insertion',
        moduleIds: [201, 202, 203] // Workforce, Payables, Suppliers
    });

    const options = {
        hostname: 'localhost',
        port: 3005,
        path: '/api/projects',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log('API Response:', data);
                resolve(JSON.parse(data));
            });
        });

        req.on('error', (e) => {
            console.error('API Error:', e);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

async function verifyInDB(projectId) {
    console.log(`\n--- Verifying Project ${projectId} in DB ---`);
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

        const result = await connection.execute(
            `SELECT * FROM MSAI_PROJECT_MODULES WHERE PROJECT_ID = :id`,
            [projectId],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log('Database Rows Found:', JSON.stringify(result.rows, null, 2));

    } catch (err) {
        console.error('DB Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

async function runTest() {
    try {
        const response = await simulateProjectCreation();
        if (response.success && response.projectId) {
            await verifyInDB(response.projectId);
        } else {
            console.log('Failed to create project via API');
        }
    } catch (e) {
        console.error('Test failed', e);
    }
}

runTest();
