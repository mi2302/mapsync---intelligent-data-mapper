const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

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

async function rebuild() {
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

        // 1. Drop Old Tables/Sequences
        console.log('Dropping existing schema objects...');
        const tables = ['MSAI_REGISTRY_MODULES', 'MSAI_MAPPING_METADATA', 'MSAI_REGISTRY', 'MSAI_MODULES'];
        for (const t of tables) {
            try { await connection.execute(`DROP TABLE ${t} CASCADE CONSTRAINTS`); } catch (e) { }
        }
        const seqs = ['MSAI_MODULE_SEQ', 'MSAI_REGISTRY_SEQ', 'MSAI_LINK_SEQ', 'MSAI_MAPPING_SEQ'];
        for (const s of seqs) {
            try { await connection.execute(`DROP SEQUENCE ${s}`); } catch (e) { }
        }

        // 2. Create Tables (NUMBER IDs)
        console.log('Creating tables with NUMBER IDs...');

        await connection.execute(`
            CREATE TABLE MSAI_MODULES (
                MODULE_ID NUMBER PRIMARY KEY,
                MODULE_NAME VARCHAR2(255),
                OBJECT_NAME VARCHAR2(255),
                TARGET_TABLE_NAME VARCHAR2(255),
                ICON VARCHAR2(100)
            )
        `);

        await connection.execute(`
            CREATE TABLE MSAI_REGISTRY (
                REGISTRY_ID NUMBER PRIMARY KEY,
                REGISTRY_NAME VARCHAR2(255),
                MODULE_NAME VARCHAR2(255)
            )
        `);

        await connection.execute(`
            CREATE TABLE MSAI_REGISTRY_MODULES (
                LINK_ID NUMBER PRIMARY KEY,
                REGISTRY_ID NUMBER,
                MODULE_ID NUMBER
            )
        `);

        await connection.execute(`
            CREATE TABLE MSAI_MAPPING_METADATA (
                MAPPING_ID NUMBER PRIMARY KEY,
                REGISTRY_ID NUMBER,
                REGISTRY_NAME VARCHAR2(255),
                OBJECT_NAME VARCHAR2(255),
                SOURCE_ATTRIBUTE_HEADER VARCHAR2(255),
                MAPPING_ATTRIBUTE_COLUMN VARCHAR2(255),
                ADDITION_LOGIC CLOB
            )
        `);

        // 3. Seed Modules
        console.log('Seeding core modules...');
        let mid = 100;
        for (const group of DATA_GROUPS) {
            for (const obj of group.objects) {
                mid++;
                await connection.execute(
                    `INSERT INTO MSAI_MODULES (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON)
                     VALUES (:id, :mname, :oname, :tname, :icon)`,
                    {
                        id: mid,
                        mname: group.name,
                        oname: obj.id,
                        tname: obj.table,
                        icon: '📦'
                    },
                    { autoCommit: false }
                );
            }
        }
        await connection.commit();

        // 4. Create Sequences
        console.log('Creating sequences...');
        await connection.execute(`CREATE SEQUENCE MSAI_MODULE_SEQ START WITH ${mid + 1} INCREMENT BY 1 NOCACHE NOCYCLE`);
        await connection.execute(`CREATE SEQUENCE MSAI_REGISTRY_SEQ START WITH 1000 INCREMENT BY 1 NOCACHE NOCYCLE`);
        await connection.execute(`CREATE SEQUENCE MSAI_LINK_SEQ START WITH 5000 INCREMENT BY 1 NOCACHE NOCYCLE`);
        await connection.execute(`CREATE SEQUENCE MSAI_MAPPING_SEQ START WITH 10000 INCREMENT BY 1 NOCACHE NOCYCLE`);

        console.log('Schema Rebuild Complete.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

rebuild();
