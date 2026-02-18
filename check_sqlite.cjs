const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("Tables:");
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(tables.map(t => t.name).join(", "));

    tables.forEach(table => {
        db.all(`PRAGMA table_info(${table.name})`, (err, info) => {
            console.log(`\nTable: ${table.name}`);
            console.log(JSON.stringify(info, null, 2));
        });
    });
});
