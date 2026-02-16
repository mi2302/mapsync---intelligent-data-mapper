
const oracledb = require('oracledb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function getPrimaryKeys() {
    let connection;
    try {
        const dbConfig = {
            user: (process.env.DB_USER || '').trim(),
            password: (process.env.DB_PASSWORD || '').trim().replace(/^"|"$/g, ''),
            connectString: `${(process.env.DB_HOST || '').trim()}:${(process.env.DB_PORT || '').trim()}/${(process.env.DB_SERVICE_NAME || '').trim()}`
        };

        // Initialize Thick Mode if needed
        try {
            oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
        } catch (err) {
            // Might already be initialized
        }

        connection = await oracledb.getConnection(dbConfig);

        const sql = `
            SELECT cols.table_name, cols.column_name 
            FROM all_constraints cons, all_cons_columns cols 
            WHERE cons.constraint_type = 'P' 
              AND cons.constraint_name = cols.constraint_name 
              AND cons.owner = cols.owner 
              AND (cols.table_name LIKE 'MSAI_%' 
               OR cols.table_name LIKE 'FIN_%' 
               OR cols.table_name LIKE 'AP_%' 
               OR cols.table_name LIKE 'PUR_%')
            ORDER BY cols.table_name
        `;

        const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log(JSON.stringify(result.rows, null, 2));

    } catch (err) {
        console.error('Error fetching PKs:', err);
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

getPrimaryKeys();
