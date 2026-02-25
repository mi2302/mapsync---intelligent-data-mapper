const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Enable Thick Client for better stability with this service name
try {
    oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
} catch (err) {
    console.warn("Thick client initialization skipped or failed. Falling back to thin driver.");
}

async function createModulesAndTables() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
        });

        console.log("Connected to database. Starting creation process...");

        // 1. Load and execute table creation scripts
        const scriptPath = path.join(__dirname, '..', 'table scripts.txt');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        // Split by semicolon to get individual CREATE TABLE statements
        const statements = scriptContent.split(';').map(s => s.trim()).filter(s => s.length > 0);

        console.log(`Found ${statements.length} table creation statements in table scripts.txt`);

        for (const statement of statements) {
            try {
                // Determine table name for logging
                const match = statement.match(/CREATE TABLE\s+(\w+)/i);
                const tableName = match ? match[1] : "Unknown Table";

                console.log(`Executing creation for ${tableName}...`);
                await connection.execute(statement);
                console.log(`✅ Table ${tableName} created successfully.`);
            } catch (err) {
                if (err.errorNum === 955) { // ORA-00955: name is already used by an existing object
                    console.warn(`⚠️ Table already exists, skipping creation.`);
                } else {
                    console.error(`❌ Error creating table:`, err.message);
                }
            }
        }

        // 1.5 Clean up temporary sequence if it exists
        try {
            console.log("\nDropping temporary sequence MSAI_MODULE_ID_SEQ if exists...");
            await connection.execute(`DROP SEQUENCE MSAI_MODULE_ID_SEQ`);
            console.log("✅ Temporary sequence dropped.");
        } catch (err) {
            // Ignore if not exists
        }

        // 2. Clear and Re-Insert module registry entries
        console.log("\nPurging and Re-registering modules in MSAI_MODULES...");

        // Purge existing records for these modules to ensure fresh IDs from the correct sequence
        const moduleNames = ['AP Invoice', 'AR Invoice', 'Customers'];
        await connection.execute(
            `DELETE FROM MSAI_MODULES WHERE MODULE_NAME IN ('AP Invoice', 'AR Invoice', 'Customers')`
        );
        console.log(`✅ Purged existing records for: ${moduleNames.join(', ')}`);

        const modulesToRegister = [
            // AP Invoice
            { mod: 'AP Invoice', obj: 'AP Headers', tab: 'MSAI_AP_INVOICES_SRC', icon: '🧾' },
            { mod: 'AP Invoice', obj: 'AP Lines', tab: 'MSAI_AP_INVOICE_LINES_SRC', icon: '🧾' },
            // AR Invoice
            { mod: 'AR Invoice', obj: 'AR Invoice', tab: 'MSAI_AR_INVOICE_LINES_SRC', icon: '🧾' },
            // Customers
            { mod: 'Customers', obj: 'Customers', tab: 'MSAI_AR_CUSTOMERS_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Contact Points', tab: 'MSAI_DM_AR_CONT_ROLE_PTS_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Payment Methods', tab: 'MSAI_AR_CUST_PAYMTHD_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Account Contacts', tab: 'MSAI_DM_AR_CUST_ACCT_RESP_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Contacts', tab: 'MSAI_DM_AR_CUST_IMP_CONT_RELS_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Profiles', tab: 'MSAI_AR_CUST_PROFILES_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Bank Accounts', tab: 'MSAI_AR_CUST_BANK_ACC_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Relationships', tab: 'MSAI_AR_CUST_RELATIONSHIPS_SRC', icon: '👥' },
            { mod: 'Customers', obj: 'Customer Sites', tab: 'MSAI_DM_AR_CUSTOMERS_SITE_SRC', icon: '👥' }
        ];

        for (const m of modulesToRegister) {
            try {
                await connection.execute(
                    `INSERT INTO MSAI_MODULES (MODULE_ID, MODULE_NAME, OBJECT_NAME, TARGET_TABLE_NAME, ICON) 
                     VALUES (MSAI_MODULE_SEQ.NEXTVAL, :mod, :obj, :tab, :icon)`,
                    { mod: m.mod, obj: m.obj, tab: m.tab, icon: m.icon }
                );
                console.log(`✅ Fresh Registration: ${m.mod} -> ${m.obj}`);
            } catch (err) {
                console.error(`❌ Error registering module ${m.obj}:`, err.message);
            }
        }

        await connection.commit();
        console.log("\nAll operations completed and committed.");

    } catch (err) {
        console.error("FATAL ERROR:", err);
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

createModulesAndTables();
