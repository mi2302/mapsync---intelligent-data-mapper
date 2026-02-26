import fs from 'fs';
import * as xlsx from 'xlsx';
import path from 'path';

// Suppliers Sample (MSAI_PO_VENDORS_SRC, Addresses, Sites, Contacts)
const suppliersData = [
    {
        // Headers
        "LEGACY_VENDOR_NAME": "Acme Corp", "ORGANIZATION_TYPE_LOOKUP_CODE": "CORPORATION", "VENDOR_TYPE_LOOKUP_CODE": "SUPPLIER", "BUSINESS_RELATIONSHIP": "SPEND_AUTHORIZED", "LEGACY_VENDOR_TYPE_LOOKUP_CODE": "STANDARD", "VENDOR_NAME": "Acme Corporation HQ", "SEGMENT1": "SUP-1001", "SUPPLIER_NUMBER": "1001", "TAX_VERIFICATION_DATE": "2023-01-15", "NAME_CONTROL": "ACME", "PAYMENT_METHOD_LOOKUP_CODE": "CHECK",
        // Addresses
        "LEGACY_PARTY_SITE_NAME": "HQ_SITE", "ADDRESS_LINE1": "123 Acme Way", "POSTAL_CODE": "10001", "CITY": "Metropolis",
        // Sites
        "PROCUREMENT_BUSINESS_UNIT_NAME": "US BU", "LEGACY_VENDOR_SITE_CODE": "HQ", "PURCHASING_SITE_FLAG": "Y",
        // Contacts
        "VENDOR_SITE_CODE": "HQ", "FIRST_NAME": "John", "LAST_NAME": "Doe", "EMAIL_ADDRESS": "john@acme.com"
    },
    {
        "LEGACY_VENDOR_NAME": "Globex Inc", "ORGANIZATION_TYPE_LOOKUP_CODE": "CORPORATION", "VENDOR_TYPE_LOOKUP_CODE": "SUPPLIER", "BUSINESS_RELATIONSHIP": "SPEND_AUTHORIZED", "LEGACY_VENDOR_TYPE_LOOKUP_CODE": "STANDARD", "VENDOR_NAME": "Globex International", "SEGMENT1": "SUP-1002", "SUPPLIER_NUMBER": "1002", "TAX_VERIFICATION_DATE": "2023-02-20", "NAME_CONTROL": "GLOBE", "PAYMENT_METHOD_LOOKUP_CODE": "EFT",
        "LEGACY_PARTY_SITE_NAME": "MAIN_SITE", "ADDRESS_LINE1": "456 Gloo Blvd", "POSTAL_CODE": "98101", "CITY": "Star City",
        "PROCUREMENT_BUSINESS_UNIT_NAME": "US BU", "LEGACY_VENDOR_SITE_CODE": "MAIN", "PURCHASING_SITE_FLAG": "Y",
        "VENDOR_SITE_CODE": "MAIN", "FIRST_NAME": "Jane", "LAST_NAME": "Smith", "EMAIL_ADDRESS": "jane@globex.com"
    },
    {
        "LEGACY_VENDOR_NAME": "Initech", "ORGANIZATION_TYPE_LOOKUP_CODE": "CORPORATION", "VENDOR_TYPE_LOOKUP_CODE": "SUPPLIER", "BUSINESS_RELATIONSHIP": "SPEND_AUTHORIZED", "LEGACY_VENDOR_TYPE_LOOKUP_CODE": "STANDARD", "VENDOR_NAME": "Initech Software Solutions", "SEGMENT1": "SUP-1003", "SUPPLIER_NUMBER": "1003", "TAX_VERIFICATION_DATE": "2023-03-10", "NAME_CONTROL": "INIT", "PAYMENT_METHOD_LOOKUP_CODE": "WIRE",
        "LEGACY_PARTY_SITE_NAME": "INIT_SITE", "ADDRESS_LINE1": "789 Init St", "POSTAL_CODE": "73301", "CITY": "Austin",
        "PROCUREMENT_BUSINESS_UNIT_NAME": "US BU", "LEGACY_VENDOR_SITE_CODE": "INIT", "PURCHASING_SITE_FLAG": "Y",
        "VENDOR_SITE_CODE": "INIT", "FIRST_NAME": "Bill", "LAST_NAME": "Lumbergh", "EMAIL_ADDRESS": "bill@initech.com"
    }
];

// Customers Sample (Customers, Customer Sites, Bank Accounts, Profiles)
const customersData = [
    {
        "PARTY_NAME": "Wayne Enterprises", "PARTY_NUMBER": "C001", "PARTY_TYPE": "ORGANIZATION", "ORGANIZATION_NAME_PHONETIC": "Wayne", "PERSON_FIRST_NAME": "Bruce", "PERSON_LAST_NAME": "Wayne", "JGZZ_FISCAL_CODE": "TAX-W01", "DUNS_NUMBER_C": "00-111-2222",
        "SITE_NUMBER": "S001", "SITE_NAME": "Gotham HQ", "ADDRESS1": "1007 Mountain Drive", "CITY": "Gotham", "STATE": "NJ", "POSTAL_CODE": "07001", "COUNTRY": "USA",
        "BANK_NAME": "Gotham National", "ACCOUNT_NUMBER": "12345678", "CURRENCY_CODE": "USD",
        "CREDIT_LIMIT": 500000, "TOLERANCE_LIMIT": 50000
    },
    {
        "PARTY_NAME": "Stark Industries", "PARTY_NUMBER": "C002", "PARTY_TYPE": "ORGANIZATION", "ORGANIZATION_NAME_PHONETIC": "Stark", "PERSON_FIRST_NAME": "Tony", "PERSON_LAST_NAME": "Stark", "JGZZ_FISCAL_CODE": "TAX-S02", "DUNS_NUMBER_C": "00-333-4444",
        "SITE_NUMBER": "S002", "SITE_NAME": "Stark Tower", "ADDRESS1": "200 Park Ave", "CITY": "New York", "STATE": "NY", "POSTAL_CODE": "10017", "COUNTRY": "USA",
        "BANK_NAME": "NY Bank", "ACCOUNT_NUMBER": "87654321", "CURRENCY_CODE": "USD",
        "CREDIT_LIMIT": 1000000, "TOLERANCE_LIMIT": 150000
    },
    {
        "PARTY_NAME": "LexCorp", "PARTY_NUMBER": "C003", "PARTY_TYPE": "ORGANIZATION", "ORGANIZATION_NAME_PHONETIC": "Lexcorp", "PERSON_FIRST_NAME": "Lex", "PERSON_LAST_NAME": "Luthor", "JGZZ_FISCAL_CODE": "TAX-L03", "DUNS_NUMBER_C": "00-555-6666",
        "SITE_NUMBER": "S003", "SITE_NAME": "Lex Plaza", "ADDRESS1": "1 Lex Plaza", "CITY": "Metropolis", "STATE": "NY", "POSTAL_CODE": "10002", "COUNTRY": "USA",
        "BANK_NAME": "Metropolis Trust", "ACCOUNT_NUMBER": "55554444", "CURRENCY_CODE": "USD",
        "CREDIT_LIMIT": 750000, "TOLERANCE_LIMIT": 80000
    }
];

// AP Invoices Sample (AP Headers + AP Lines)
const apInvoicesData = [
    {
        // AP Headers
        "SOURCE": "Manual Import", "INVOICE_NUM": "INV-AP-100", "INVOICE_AMOUNT": 155.00, "INVOICE_DATE": "2023-10-01T12:00:00.000Z", "LEGACY_VENDOR_NAME": "Acme Corp", "LEGACY_VENDOR_SITE_CODE": "HQ", "INVOICE_TYPE_LOOKUP_CODE": "STANDARD", "TERMS_NAME": "Net 30", "TARGET_VENDOR_NAME": "Acme Corporation HQ", "TARGET_VENDOR_SITE_CODE": "HQ", "DESCRIPTION": "Office Supplies", "STATUS": "Open",
        // AP Lines
        "LINE_NUMBER": 1, "LINE_TYPE_LOOKUP_CODE": "ITEM", "LINE_AMOUNT": 155.00, "ITEM_DESCRIPTION": "Red Staplers"
    },
    {
        "SOURCE": "API Integration", "INVOICE_NUM": "INV-AP-101", "INVOICE_AMOUNT": 1200.00, "INVOICE_DATE": "2023-10-05T12:00:00.000Z", "LEGACY_VENDOR_NAME": "Globex Inc", "LEGACY_VENDOR_SITE_CODE": "MAIN", "INVOICE_TYPE_LOOKUP_CODE": "STANDARD", "TERMS_NAME": "Net 15", "TARGET_VENDOR_NAME": "Globex International", "TARGET_VENDOR_SITE_CODE": "MAIN", "DESCRIPTION": "Server Maintenance", "STATUS": "Paid",
        "LINE_NUMBER": 1, "LINE_TYPE_LOOKUP_CODE": "ITEM", "LINE_AMOUNT": 1200.00, "ITEM_DESCRIPTION": "Monthly Hosting"
    },
    {
        "SOURCE": "Manual Import", "INVOICE_NUM": "INV-AP-102", "INVOICE_AMOUNT": 10000.00, "INVOICE_DATE": "2023-10-10T12:00:00.000Z", "LEGACY_VENDOR_NAME": "Umbrella Corp", "LEGACY_VENDOR_SITE_CODE": "LAB", "INVOICE_TYPE_LOOKUP_CODE": "STANDARD", "TERMS_NAME": "Net 60", "TARGET_VENDOR_NAME": "Umbrella Biomedical", "TARGET_VENDOR_SITE_CODE": "LAB", "DESCRIPTION": "Biohazard Suits", "STATUS": "Open",
        "LINE_NUMBER": 1, "LINE_TYPE_LOOKUP_CODE": "ITEM", "LINE_AMOUNT": 10000.00, "ITEM_DESCRIPTION": "T-Virus Suits Bulk"
    }
];

// AR Invoices Sample (AR Invoice/Transactions + Distributions/Lines)
const arInvoicesData = [
    { "BU_NAME": "US Vision Operations", "BATCH_SOURCE_NAME": "Manual Invoice", "CUST_TRX_TYPE_NAME": "Invoice", "TRX_LINE_NUMBER": 1, "LEGACY_BILL_CUSTOMER_SITE_NUMBER": "C001", "ACCOUNT_CLASS": "REV", "TRX_NUMBER": "AR-2023-001", "TRX_DATE": "2023-10-10T00:00:00.000Z", "DESCRIPTION": "Consulting Services", "QUANTITY": 40, "UNIT_SELLING_PRICE": 150.00, "LINE_AMOUNT": 6000.00, "AMOUNT": 6000.00, "CURRENCY_CODE": "USD" },
    { "BU_NAME": "US Vision Operations", "BATCH_SOURCE_NAME": "Manual Invoice", "CUST_TRX_TYPE_NAME": "Invoice", "TRX_LINE_NUMBER": 1, "LEGACY_BILL_CUSTOMER_SITE_NUMBER": "C002", "ACCOUNT_CLASS": "REV", "TRX_NUMBER": "AR-2023-002", "TRX_DATE": "2023-10-15T00:00:00.000Z", "DESCRIPTION": "Arc Reactor Parts", "QUANTITY": 5, "UNIT_SELLING_PRICE": 5000.00, "LINE_AMOUNT": 25000.00, "AMOUNT": 25000.00, "CURRENCY_CODE": "USD" }
];

function createExcelFile(data, filepath) {
    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
    xlsx.writeFile(wb, filepath);
    console.log('✅ Created ' + filepath);
}

const sampleDir = path.join(process.cwd(), 'sample_data_files');
if (!fs.existsSync(sampleDir)) {
    fs.mkdirSync(sampleDir);
}

console.log('Generating sample excel files...');
createExcelFile(suppliersData, path.join(sampleDir, 'Suppliers_Sample_v2.xlsx'));
createExcelFile(customersData, path.join(sampleDir, 'Customers_Sample_v2.xlsx'));
createExcelFile(apInvoicesData, path.join(sampleDir, 'AP_Invoices_Sample_v2.xlsx'));
createExcelFile(arInvoicesData, path.join(sampleDir, 'AR_Invoices_Sample_v2.xlsx'));

async function setupData() {
    console.log('\nSetting up Application Data via API...');
    try {
        // Fetch all modules
        const modRes = await fetch('http://localhost:3005/api/modules');
        const modules = await modRes.json();
        const mappedModules = modules.flatMap(m => m.objects.map(obj => obj.moduleId)); // Assign all modules

        // Create Project
        const projRes = await fetch('http://localhost:3005/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Global ERP Financial Migration - Q3',
                description: 'Enterprise initiative to migrate financial mapping data from legacy systems into the new central MSAI schemas.',
                moduleIds: mappedModules
            })
        });
        const projData = await projRes.json();
        console.log('✅ Created Project:', projData);

        // Create Source
        const srcRes = await fetch(`http://localhost:3005/api/projects/${projData.projectId}/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Legacy Microsoft Dynamics AX',
                description: 'Legacy European Dynamics AX instance containing historical Suppliers, Customers, and Invoices.',
                moduleIds: mappedModules
            })
        });
        const srcData = await srcRes.json();
        console.log('✅ Created Source:', srcData);

        console.log('\n🎉 Successfully created sample data and mapped modules!');
    } catch (err) {
        console.error('Failed to setup data via API (Make sure the server is running on 3005):', err);
    }
}

setupData();
