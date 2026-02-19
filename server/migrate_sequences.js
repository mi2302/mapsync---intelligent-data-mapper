const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

// Initialize Oracle Client
try {
    if (process.platform === 'win32') {
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
    }
} catch (err) {
    console.error('Oracle Client init failed:', err);
    process.exit(1);
}

async function migrate() {
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

        // 1. Fetch Existing Data
        console.log('Fetching existing data...');
        const modules = await connection.execute(`SELECT * FROM MSAI_MODULES`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const registries = await connection.execute(`SELECT * FROM MSAI_REGISTRY`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const links = await connection.execute(`SELECT * FROM MSAI_REGISTRY_MODULES`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const mappings = await connection.execute(`SELECT * FROM MSAI_MAPPING_METADATA`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        console.log(`Found: ${modules.rows.length} modules, ${registries.rows.length} registries, ${links.rows.length} links, ${mappings.rows.length} mappings`);

        // 2. Map IDs
        const modMap = {}; // oldId -> newId (Number)
        let nextModId = 100;
        modules.rows.forEach(r => {
            modMap[r.MODULE_ID] = nextModId++;
        });

        const regMap = {}; // oldId -> newId (Number)
        let nextRegId = 1000;
        registries.rows.forEach(r => {
            // handle both string/number input
            regMap[r.REGISTRY_ID] = nextRegId++;
        });

        // 3. Drop Tables
        console.log('Dropping tables...');
        const tables = ['MSAI_REGISTRY_MODULES', 'MSAI_MAPPING_METADATA', 'MSAI_REGISTRY', 'MSAI_MODULES'];
        for (const t of tables) {
            try {
                await connection.execute(`DROP TABLE ${t}`);
            } catch (e) {
                console.log(`Drop ${t} failed (may not exist): ${e.message}`);
            }
        }

        // Drop sequences if exist
        const seqs = ['MSAI_MODULE_SEQ', 'MSAI_REGISTRY_SEQ', 'MSAI_LINK_SEQ', 'MSAI_MAPPING_SEQ'];
        for (const s of seqs) {
            try {
                await connection.execute(`DROP SEQUENCE ${s}`);
            } catch (e) { }
        }

        // 4. Recreate Tables with NUMBER IDs
        console.log('Recreating tables...');

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
                OBJECT_NAME VARCHAR2(255), -- This is ACTUALLY the Object Name (Schema ID)
                SOURCE_ATTRIBUTE_HEADER VARCHAR2(255),
                MAPPING_ATTRIBUTE_COLUMN VARCHAR2(255),
                ADDITION_LOGIC CLOB
            )
        `);

        // 5. Insert Data
        console.log('Migrating data...');

        // Modules
        for (const r of modules.rows) {
            const newId = modMap[r.MODULE_ID];
            await connection.execute(
                `INSERT INTO MSAI_MODULES (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON)
                 VALUES (:id, :mn, :on, :tn, :ic)`,
                { id: newId, mn: r.MODULE_NAME, on: r.OBJECT_NAME, tn: r.TARGET_TABLE_NAME, ic: r.ICON || '📦' },
                { autoCommit: false }
            );
        }

        // Registries
        for (const r of registries.rows) {
            const newId = regMap[r.REGISTRY_ID];
            await connection.execute(
                `INSERT INTO MSAI_REGISTRY (REGISTRY_ID, REGISTRY_NAME, MODULE_NAME)
                 VALUES (:id, :rn, :mn)`,
                { id: newId, rn: r.REGISTRY_NAME, mn: r.MODULE_NAME },
                { autoCommit: false }
            );
        }

        // Links
        let nextLinkId = 5000;
        for (const r of links.rows) {
            const newRegId = regMap[r.REGISTRY_ID];
            const newModId = modMap[r.MODULE_ID];
            if (newRegId && newModId) {
                await connection.execute(
                    `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID)
                     VALUES (:lid, :rid, :mid)`,
                    { lid: ++nextLinkId, rid: newRegId, mid: newModId },
                    { autoCommit: false }
                );
            }
        }

        // Mappings
        let nextMapId = 10000;
        for (const r of mappings.rows) {
            const newRegId = regMap[r.REGISTRY_ID];
            if (newRegId) {
                await connection.execute(
                    `INSERT INTO MSAI_MAPPING_METADATA (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, OBJECT_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                     VALUES (:mid, :rid, :rn, :on, :src, :tgt, :logic)`,
                    {
                        mid: ++nextMapId,
                        rid: newRegId,
                        rn: r.REGISTRY_NAME,
                        on: r.MODULE_NAME, // Map old 'MODULE_NAME' (which was object name) to new 'OBJECT_NAME'
                        src: r.SOURCE_ATTRIBUTE_HEADER,
                        tgt: r.MAPPING_ATTRIBUTE_COLUMN,
                        logic: r.ADDITION_LOGIC
                    },
                    { autoCommit: false }
                );
            }
        }

        await connection.commit();

        // 6. Create Sequences
        console.log('Creating sequences...');
        await connection.execute(`CREATE SEQUENCE MSAI_MODULE_SEQ START WITH ${nextModId + 1} INCREMENT BY 1 NOCACHE NOCYCLE`);
        await connection.execute(`CREATE SEQUENCE MSAI_REGISTRY_SEQ START WITH ${nextRegId + 1} INCREMENT BY 1 NOCACHE NOCYCLE`);
        await connection.execute(`CREATE SEQUENCE MSAI_LINK_SEQ START WITH ${nextLinkId + 1} INCREMENT BY 1 NOCACHE NOCYCLE`);
        await connection.execute(`CREATE SEQUENCE MSAI_MAPPING_SEQ START WITH ${nextMapId + 1} INCREMENT BY 1 NOCACHE NOCYCLE`);

        console.log('Migration Complete.');

    } catch (err) {
        console.error('Migration Error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) { }
        }
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}

migrate();
