const http = require('http');

console.log("Testing duplicate upload with IDs: 1, 2, 3, 4, 4...");

const data = JSON.stringify({
    dryRun: true,
    tableName: "MSAI_HR_EMPLOYEE_MASTER",
    columns: ["EMP_ID", "FIRST_NAME"],
    rows: [
        { "EMP_ID": "1", "FIRST_NAME": "Test1" },
        { "EMP_ID": "2", "FIRST_NAME": "Test2" },
        { "EMP_ID": "3", "FIRST_NAME": "Test3" },
        { "EMP_ID": "4", "FIRST_NAME": "Test4" },
        { "EMP_ID": "4", "FIRST_NAME": "Test4_Duplicate" }
    ]
});

const options = {
    hostname: 'localhost',
    port: 3005,
    path: '/api/sync-data',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        if (res.statusCode === 400) {
            console.log("✅ SUCCESS! Server caught likely duplicate (400 Bad Request).");
            console.log("Response:", body);
        } else if (res.statusCode === 200) {
            console.log("❌ FAILURE! Server accepted the request (200 OK). Validation FAILED.");
        } else {
            console.log(`❌ Server returned ${res.statusCode}:`, body);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
