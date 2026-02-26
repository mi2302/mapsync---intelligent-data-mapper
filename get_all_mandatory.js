import fs from 'fs';

async function run() {
    const req = await fetch('http://localhost:3005/api/legacy-universe');
    const schema = await req.json();

    const groups = {
        "AP Invoices": ["AP Headers", "AP Lines"],
        "AR Invoices": ["AR Invoice"], // Or AR Headers, AR Lines? Let's check keys.
        "Suppliers": ["Supplier Headers", "Supplier Addresses", "Supplier Sites", "Supplier Contacts"],
        "Customers": ["Customers", "Customer Sites", "Customer Profiles", "Customer Contacts", "Customer Account Contacts", "Customer Relationships", "Customer Bank Accounts", "Customer Payment Methods"]
    };

    const allKeys = Object.keys(schema);

    for (const [file, objs] of Object.entries(groups)) {
        console.log(`\n=== File: ${file} ===`);
        for (const obj of objs) {
            if (!schema[obj]) {
                console.log(`  !! Object not found: ${obj}`);
                continue;
            }
            const mandatory = schema[obj].fields.filter(f => f.required).map(f => f.id);
            const someOptional = schema[obj].fields.filter(f => !f.required).slice(0, 3).map(f => f.id);
            console.log(`  Object: ${obj}`);
            console.log(`    Mandatory: ${mandatory.join(', ')}`);
            // console.log(`    Some opt: ${someOptional.join(', ')}`);
        }
    }
}

run();
