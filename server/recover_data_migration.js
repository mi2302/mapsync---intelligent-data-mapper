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

async function migrateRestoredData() {
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

        // 1. Fetch Restored Data (Old IDs)
        console.log('Fetching restored data...');
        const modules = await connection.execute(`SELECT * FROM MSAI_MODULES_RESTORED`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const registries = await connection.execute(`SELECT * FROM MSAI_REGISTRY_RESTORED`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Fix: MSAI_REGISTRY_MODULES mismatch? In old schema it was LINK_ID, REGISTRY_ID, MODULE_ID
        const links = await connection.execute(`SELECT * FROM MSAI_REGISTRY_MODULES_RESTORED`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const mappings = await connection.execute(`SELECT * FROM MSAI_MAPPING_METADATA_RESTORED`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        console.log(`Found: ${modules.rows.length} modules, ${registries.rows.length} registries, ${links.rows.length} links, ${mappings.rows.length} mappings`);

        // 2. Map IDs (Old String/Mix -> New Sequence)
        const modMap = {}; // oldId -> newId (Number)
        let nextModId = 200; // Start after core modules (100-110 seeded)

        // Pre-fill map with existing Core Modules in target table
        const currentModules = await connection.execute(`SELECT MODULE_ID, MODULE_NAME, OBJECT_NAME FROM MSAI_MODULES`);

        for (const r of modules.rows) {
            // Check if this module already exists in the new table (by name/object)
            const existing = currentModules.rows.find(m =>
                m.MODULE_NAME === r.MODULE_NAME && m.OBJECT_NAME === r.OBJECT_NAME
            );

            if (existing) {
                modMap[r.MODULE_ID] = existing[0]; // Map old ID to existing new ID
            } else {
                // New custom module
                nextModId++;
                modMap[r.MODULE_ID] = nextModId;
                // Insert into MSAI_MODULES
                await connection.execute(
                    `INSERT INTO MSAI_MODULES (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON)
                     VALUES (:mod_id, :mod_name, :obj_name, :tgt, :ic)`,
                    {
                        mod_id: nextModId,
                        mod_name: r.MODULE_NAME,
                        obj_name: r.OBJECT_NAME,
                        tgt: r.TARGET_TABLE_NAME,
                        ic: r.ICON || '📦'
                    },
                    { autoCommit: false }
                );
            }
        }

        const regMap = {}; // oldId -> newId (Number)
        let nextRegId = 2000;

        // Registries
        for (const r of registries.rows) {
            nextRegId++;
            regMap[r.REGISTRY_ID] = nextRegId;

            await connection.execute(
                `INSERT INTO MSAI_REGISTRY (REGISTRY_ID, REGISTRY_NAME, MODULE_NAME)
                 VALUES (:rid, :rname, :mname)`,
                { rid: nextRegId, rname: r.REGISTRY_NAME, mname: r.MODULE_NAME },
                { autoCommit: false }
            );
        }

        // Links
        let nextLinkId = 6000;
        for (const r of links.rows) {
            const newRegId = regMap[r.REGISTRY_ID];
            const newModId = modMap[r.MODULE_ID];

            if (newRegId && newModId) {
                nextLinkId++;
                await connection.execute(
                    `INSERT INTO MSAI_REGISTRY_MODULES (LINK_ID, REGISTRY_ID, MODULE_ID)
                     VALUES (:lid, :rid, :mid)`,
                    { lid: nextLinkId, rid: newRegId, mid: newModId },
                    { autoCommit: false }
                );
            }
        }

        // Mappings
        let nextMapId = 20000;
        for (const r of mappings.rows) {
            const newRegId = regMap[r.REGISTRY_ID];
            if (newRegId) {
                nextMapId++;
                await connection.execute(
                    `INSERT INTO MSAI_MAPPING_METADATA (MAPPING_ID, REGISTRY_ID, REGISTRY_NAME, MODULE_NAME, SOURCE_ATTRIBUTE_HEADER, MAPPING_ATTRIBUTE_COLUMN, ADDITION_LOGIC)
                     VALUES (:mid, :rid, :rname, :oname, :src, :tgt, :logic)`,
                    {
                        mid: nextMapId,
                        rid: newRegId,
                        // Registry name might have changed? No, use old one or new one. Use old one for consistency.
                        rname: r.REGISTRY_NAME,
                        oname: r.MODULE_NAME, // This is Object Name
                        src: r.SOURCE_ATTRIBUTE_HEADER,
                        tgt: r.MAPPING_ATTRIBUTE_COLUMN,
                        logic: r.ADDITION_LOGIC
                    },
                    { autoCommit: false }
                );
            }
        }

        await connection.commit();

        // Update Sequences
        console.log('Updating sequences...');
        // Drop and recreate sequences to start after our migrated data
        const seqs = [
            { name: 'MSAI_MODULE_SEQ', start: nextModId + 10 },
            { name: 'MSAI_REGISTRY_SEQ', start: nextRegId + 10 },
            { name: 'MSAI_LINK_SEQ', start: nextLinkId + 10 },
            { name: 'MSAI_MAPPING_SEQ', start: nextMapId + 10 }
        ];

        for (const s of seqs) {
            try { await connection.execute(`DROP SEQUENCE ${s.name}`); } catch (e) { }
            await connection.execute(`CREATE SEQUENCE ${s.name} START WITH ${s.start} INCREMENT BY 1 NOCACHE NOCYCLE`);
        }

        // Clean up restored tables
        console.log('Cleaning up temporary tables...');
        const tables = ['MSAI_REGISTRY_RESTORED', 'MSAI_MODULES_RESTORED', 'MSAI_MAPPING_METADATA_RESTORED', 'MSAI_REGISTRY_MODULES_RESTORED'];
        for (const t of tables) {
            try { await connection.execute(`DROP TABLE ${t}`); } catch (e) { }
        }

        console.log('Data Recovery Complete.');

    } catch (err) {
        console.error('Recovery Error:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) { }
        }
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}

migrateRestoredData();
