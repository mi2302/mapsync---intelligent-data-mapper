const oracledb = require('oracledb');
require('dotenv').config();
const path = require('path');

// Configure Oracle Client
try {
    oracledb.initOracleClient({ libDir: path.join(__dirname, 'instantclient_19_19') });
} catch (err) {
    console.error('Oracle Client Init Error:', err);
    process.exit(1);
}

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE_NAME}`
};

async function runEnhancement() {
    let connection;
    try {
        connection = await oracledb.getConnection(dbConfig);
        console.log('Connected to Oracle Database');

        // 1. Create MSAI_PROJECTS Table
        try {
            await connection.execute(`
                CREATE TABLE MSAI_PROJECTS (
                    PROJECT_ID NUMBER PRIMARY KEY,
                    PROJECT_NAME VARCHAR2(255) NOT NULL,
                    DESCRIPTION VARCHAR2(1000),
                    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Created MSAI_PROJECTS table');
        } catch (err) {
            if (err.message.includes('ORA-00955')) console.log('⚠️ MSAI_PROJECTS table already exists');
            else console.error('❌ Error creating MSAI_PROJECTS:', err);
        }

        // 2. Create MSAI_PROJECT_SEQ
        try {
            await connection.execute(`CREATE SEQUENCE MSAI_PROJECT_SEQ START WITH 1 INCREMENT BY 1`);
            console.log('✅ Created MSAI_PROJECT_SEQ sequence');
        } catch (err) {
            if (err.message.includes('ORA-00955')) console.log('⚠️ MSAI_PROJECT_SEQ sequence already exists');
            else console.error('❌ Error creating MSAI_PROJECT_SEQ:', err);
        }

        // 3. Create MSAI_PROJECT_MODULES Table
        try {
            await connection.execute(`
                CREATE TABLE MSAI_PROJECT_MODULES (
                    PROJECT_ID NUMBER,
                    MODULE_ID NUMBER,
                    CONSTRAINT PK_PROJ_MOD PRIMARY KEY (PROJECT_ID, MODULE_ID)
                )
            `);
            console.log('✅ Created MSAI_PROJECT_MODULES table');
        } catch (err) {
            if (err.message.includes('ORA-00955')) console.log('⚠️ MSAI_PROJECT_MODULES table already exists');
            else console.error('❌ Error creating MSAI_PROJECT_MODULES:', err);
        }

        // 4. Create MSAI_SOURCES Table
        try {
            await connection.execute(`
                CREATE TABLE MSAI_SOURCES (
                    SOURCE_ID NUMBER PRIMARY KEY,
                    SOURCE_NAME VARCHAR2(255) NOT NULL,
                    PROJECT_ID NUMBER,
                    DESCRIPTION VARCHAR2(1000),
                    CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Created MSAI_SOURCES table');
        } catch (err) {
            if (err.message.includes('ORA-00955')) console.log('⚠️ MSAI_SOURCES table already exists');
            else console.error('❌ Error creating MSAI_SOURCES:', err);
        }

        // 5. Create MSAI_SOURCE_SEQ
        try {
            await connection.execute(`CREATE SEQUENCE MSAI_SOURCE_SEQ START WITH 1 INCREMENT BY 1`);
            console.log('✅ Created MSAI_SOURCE_SEQ sequence');
        } catch (err) {
            if (err.message.includes('ORA-00955')) console.log('⚠️ MSAI_SOURCE_SEQ sequence already exists');
            else console.error('❌ Error creating MSAI_SOURCE_SEQ:', err);
        }

        // 6. Alter MSAI_REGISTRY to add SOURCE_ID column
        try {
            await connection.execute(`ALTER TABLE MSAI_REGISTRY ADD (SOURCE_ID NUMBER)`);
            console.log('✅ Added SOURCE_ID column to MSAI_REGISTRY');
        } catch (err) {
            if (err.message.includes('ORA-01430')) console.log('⚠️ SOURCE_ID column already exists in MSAI_REGISTRY');
            else console.error('❌ Error altering MSAI_REGISTRY:', err);
        }

        console.log('Database Enhancement Complete');

    } catch (err) {
        console.error('Enhancement Failed:', err);
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

runEnhancement();
