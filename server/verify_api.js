async function check() {
    try {
        const res = await fetch('http://localhost:3005/api/modules');
        const data = await res.json();
        console.log('--- MODULES DATA ---');
        data.forEach(m => {
            console.log(`Module: ${m.name}, ID: ${m.id}, Icon: ${m.icon}, Length: ${m.icon ? m.icon.length : 0}`);
            if (m.icon) {
                for (let i = 0; i < m.icon.length; i++) {
                    console.log(`  Char ${i}: ${m.icon.charCodeAt(i).toString(16)}`);
                }
            }
        });
    } catch (err) {
        console.error(err);
    }
}
check();
