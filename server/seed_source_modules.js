const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config();

async function seedSourceModules() {
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

        // 1. Get all sources and their projects
        const sourcesResult = await connection.execute(
            `SELECT SOURCE_ID, PROJECT_ID, SOURCE_NAME FROM MSAI_SOURCES`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        console.log(`Found ${sourcesResult.rows.length} sources.`);

        for (const src of sourcesResult.rows) {
            console.log(`Processing Source: ${src.SOURCE_NAME} (ID: ${src.SOURCE_ID}) in Project: ${src.PROJECT_ID}`);

            // 2. Get modules assigned to this project
            const modsResult = await connection.execute(
                `SELECT MODULE_ID FROM MSAI_PROJECT_MODULES WHERE PROJECT_ID = :pid`,
                [src.PROJECT_ID],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            if (modsResult.rows.length === 0) {
                console.log(`  No project modules found for project ${src.PROJECT_ID}. Skipping.`);
                continue;
            }

            console.log(`  Found ${modsResult.rows.length} modules to assign.`);

            // 3. Clear existing source modules (to avoid duplicates if re-run)
            await connection.execute(
                `DELETE FROM MSAI_SOURCE_MODULES WHERE SOURCE_ID = :sid`,
                [src.SOURCE_ID],
                { autoCommit: false }
            );

            // 4. Insert associations
            for (const mod of modsResult.rows) {
                try {
                    await connection.execute(
                        `INSERT INTO MSAI_SOURCE_MODULES (SOURCE_ID, MODULE_ID) VALUES (:sid, :mid)`,
                        [src.SOURCE_ID, mod.MODULE_ID],
                        { autoCommit: false }
                    );
                } catch (e) {
                    console.log(`    Module ${mod.MODULE_ID} already assigned? ${e.message}`);
                }
            }
        }

        await connection.commit();
        console.log('Successfully populated MSAI_SOURCE_MODULES.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

seedSourceModules();
