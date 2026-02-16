const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

// Initialize Oracle Client for Thick Mode
try {
    if (process.platform === 'win32') {
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
    }
} catch (err) {
    console.error('Oracle Client init failed:', err);
    process.exit(1);
}

const DATA_GROUPS = [
    {
        name: 'Workforce Management',
        objects: [
            { id: 'EMPLOYEE_MASTER', table: 'MSAI_HR_EMPLOYEE_MASTER' },
            { id: 'ASSIGNMENT', table: 'MSAI_HR_ASSIGNMENTS' },
            { id: 'PAYROLL', table: 'FIN_PAYROLL_RUN' }
        ]
    },
    {
        name: 'Accounts Payable',
        objects: [
            { id: 'INVOICE_HEADER', table: 'AP_INVOICE_HEADERS' },
            { id: 'INVOICE_LINES', table: 'AP_INVOICE_LINES' }
        ]
    },
    {
        name: 'Vendor Relations',
        objects: [
            { id: 'SUPPLIER_HEADER', table: 'PUR_SUPPLIERS' },
            { id: 'SUPPLIER_SITES', table: 'PUR_VENDOR_SITES' },
            { id: 'SUPPLIER_TAX', table: 'PUR_VENDOR_TAX_PROFILES' }
        ]
    }
];

async function fixModules() {
    let connection;
    try {
        const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
        const dbConfig = {
            user: process.env.DB_USER,
            password: password,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        };
        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to DB');

        // Clear existing modules and dependencies
        console.log('Clearing dependent tables...');
        await connection.execute(`DELETE FROM MSAI_REGISTRY_MODULES`);

        console.log('Clearing MSAI_MODULES...');
        await connection.execute(`DELETE FROM MSAI_MODULES`);

        // Insert correct modules
        console.log('Inserting correct module definitions...');
        for (const group of DATA_GROUPS) {
            for (const obj of group.objects) {
                const moduleId = `MOD_${group.name.substring(0, 3).toUpperCase()}_${obj.id}`;
                console.log(`Inserting: ${group.name} - ${obj.id} -> ${obj.table}`);

                await connection.execute(
                    `INSERT INTO MSAI_MODULES (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME) 
                 VALUES (:mid, :mname, :oname, :tname)`,
                    {
                        mid: moduleId,
                        mname: group.name,
                        oname: obj.id,
                        tname: obj.table
                    },
                    { autoCommit: false }
                );
            }
        }

        await connection.commit();
        console.log('Successfully updated MSAI_MODULES.');

        // Verify
        const verify = await connection.execute(`SELECT * FROM MSAI_MODULES`);
        console.log('Verification Data:', JSON.stringify(verify.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) { }
        }
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}

fixModules();
