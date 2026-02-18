const XLSX = require('xlsx');
const oracledb = require('./server/node_modules/oracledb');
const path = require('path');
const fs = require('fs');
const dotenv = require('./server/node_modules/dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'server', '.env') });

async function run() {
    let connection;
    try {
        // Initialize Oracle Client (Thick mode)
        oracledb.initOracleClient({ libDir: path.join(__dirname, 'server', 'instantclient_19_19') });

        const dbConfig = {
            user: process.env.DB_USER.trim(),
            password: process.env.DB_PASSWORD.trim().replace(/^"|"$/g, ''),
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        };

        console.log('Connecting to Oracle...');
        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected.');

        // 1. Read Excel
        const filePath = path.join(__dirname, 'Book2.xlsx');
        const workbook = XLSX.readFile(filePath);
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        // 2. Filter & Group
        const objects = {};
        jsonData.forEach(col => {
            const name = String(col.COLUMN_NAME || '').toUpperCase();
            // FILTER LOGIC
            if (name.startsWith('XX_')) return;
            if (name === 'RESERVED') return;
            if (name.includes('ATTRIBUTE')) return;

            if (!objects[col.OBJECT_NAME]) {
                objects[col.OBJECT_NAME] = {
                    group: col.GROUP_NAME,
                    columns: []
                };
            }
            objects[col.OBJECT_NAME].columns.push(col);
        });

        for (const [objName, meta] of Object.entries(objects)) {
            const tableName = 'MSAI_' + objName.toUpperCase().replace(/\s+/g, '_');
            console.log(`\nProcessing Object: ${objName} -> ${tableName}`);

            // DROP if exists (optional, but safer for a "setup" script)
            try {
                await connection.execute(`DROP TABLE ${tableName}`);
                console.log(`Dropped existing table ${tableName}`);
            } catch (e) {
                // Ignore if tab missing
            }

            let primaryKey = null;

            // Generate CREATE TABLE SQL
            const colDefs = meta.columns.map(col => {
                let type = col.DATA_TYPE || 'VARCHAR2';
                if (type === 'VARCHAR2' || type === 'VARCHAR') {
                    type = `VARCHAR2(${col.LENGTH || 4000})`;
                } else if (type === 'NUMBER') {
                    type = 'NUMBER';
                } else if (type === 'DATE') {
                    type = 'DATE';
                } else if (type === 'TIMESTAMP') {
                    type = 'TIMESTAMP(6)';
                } else {
                    type = 'VARCHAR2(4000)'; // Fallback
                }

                // Heuristic: If column ends in _ID and we haven't found a PK yet
                if (!primaryKey && col.COLUMN_NAME.toUpperCase().endsWith('_ID')) {
                    primaryKey = col.COLUMN_NAME;
                    return `"${col.COLUMN_NAME}" ${type} PRIMARY KEY`;
                }

                return `"${col.COLUMN_NAME}" ${type}`;
            }).join(',\n    ');

            const createSql = `CREATE TABLE ${tableName} (\n    ${colDefs}\n)`;
            console.log(`Executing Create Table...`);
            await connection.execute(createSql);

            // Register in MSAI_MODULES
            const moduleId = `MOD_${meta.group.substring(0, 3).toUpperCase()}_${objName.toUpperCase().replace(/\s+/g, '_')}`;

            // Check if already registered
            const check = await connection.execute(
                `SELECT count(*) FROM MSAI_MODULES WHERE MODULE_NAME = :mname AND OBJECT_NAME = :oname`,
                { mname: meta.group, oname: objName }
            );

            if (check.rows[0][0] > 0) {
                await connection.execute(
                    `UPDATE MSAI_MODULES SET TARGET_TABLE_NAME = :tbl, MODULE_ID = :mid WHERE MODULE_NAME = :mname AND OBJECT_NAME = :oname`,
                    { tbl: tableName, mid: moduleId, mname: meta.group, oname: objName }
                );
            } else {
                await connection.execute(
                    `INSERT INTO MSAI_MODULES (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON) VALUES (:mid, :mname, :oname, :tbl, '🚛')`,
                    { mid: moduleId, mname: meta.group, oname: objName, tbl: tableName }
                );
            }

            console.log(`Table ${tableName} created and registered under ${meta.group}.`);
        }

        await connection.commit();
        console.log('\nAll operations completed successfully.');

    } catch (err) {
        console.error('Setup Error:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) { console.error(err); }
        }
    }
}

run();
