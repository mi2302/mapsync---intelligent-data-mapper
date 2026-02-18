const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Configure oracledb
try {
    oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
} catch (err) {
    if (err.message.includes('DPI-1047')) {
        console.log('Use default libDir logic if already init');
    } else {
        console.error('Oracle Client Init Error:', err);
    }
}

// Helper to get DB config
// Helper to get DB config
function getDbConfig() {
    const user = (process.env.DB_USER || '').trim();
    const password = (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, '');
    const host = (process.env.DB_HOST || '').trim();
    const port = (process.env.DB_PORT || '').trim();
    const service = (process.env.DB_SERVICE_NAME || '').trim();

    const connectString = `${host}:${port}/${service}`;
    console.log('Loaded env vars:', Object.keys(process.env).length);
    console.log('Connecting to:', connectString, 'User:', user);
    return { user, password, connectString };
}

async function setupRelationships() {
    let connection;
    try {
        const dbConfig = getDbConfig();
        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to Oracle DB');

        // 1. Create Table if not exists
        await connection.execute(`
            DECLARE
              v_count NUMBER;
            BEGIN
              SELECT count(*) INTO v_count FROM user_tables WHERE table_name = 'MSAI_RELATIONSHIPS';
              IF v_count = 0 THEN
                EXECUTE IMMEDIATE 'CREATE TABLE MSAI_RELATIONSHIPS (
                  ID VARCHAR2(50) PRIMARY KEY,
                  SOURCE_SCHEMA VARCHAR2(100),
                  SOURCE_FIELD VARCHAR2(100),
                  TARGET_SCHEMA VARCHAR2(100),
                  TARGET_FIELD VARCHAR2(100),
                  RELATION_TYPE VARCHAR2(20) DEFAULT ''ONE_TO_MANY''
                )';
              END IF;
            END;
        `);
        console.log('MSAI_RELATIONSHIPS table verified.');

        // 2. Clear existing entries to re-seed (dev mode safety)
        await connection.execute(`DELETE FROM MSAI_RELATIONSHIPS`);

        // 3. Seed Default Relationships
        const seeds = [
            { id: 'rel_assign_emp', src: 'ASSIGNMENT', srcCol: 'employee_id', tgt: 'EMPLOYEE_MASTER', tgtCol: 'employee_id', type: 'ONE_TO_MANY' },
            { id: 'rel_payroll_emp', src: 'PAYROLL', srcCol: 'employee_id', tgt: 'EMPLOYEE_MASTER', tgtCol: 'employee_id', type: 'ONE_TO_MANY' },
            { id: 'rel_invlines_invheader', src: 'INVOICE_LINES', srcCol: 'invoice_id', tgt: 'INVOICE_HEADER', tgtCol: 'invoice_id', type: 'ONE_TO_MANY' },
            { id: 'rel_supsites_supheader', src: 'SUPPLIER_SITES', srcCol: 'vendor_id', tgt: 'SUPPLIER_HEADER', tgtCol: 'vendor_id', type: 'ONE_TO_MANY' },
            { id: 'rel_suptax_supheader', src: 'SUPPLIER_TAX', srcCol: 'vendor_id', tgt: 'SUPPLIER_HEADER', tgtCol: 'vendor_id', type: 'ONE_TO_ONE' },
        ];

        for (const seed of seeds) {
            await connection.execute(
                `INSERT INTO MSAI_RELATIONSHIPS (ID, SOURCE_SCHEMA, SOURCE_FIELD, TARGET_SCHEMA, TARGET_FIELD, RELATION_TYPE)
                 VALUES (:id, :src, :srcCol, :tgt, :tgtCol, :type)`,
                seed,
                { autoCommit: false }
            );
        }

        await connection.commit();
        console.log(`Seeded ${seeds.length} relationships.`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

setupRelationships();
