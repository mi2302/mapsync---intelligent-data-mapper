import fs from 'fs';
import path from 'path';

const componentsDir = path.join(process.cwd(), 'components');

fs.readdirSync(componentsDir).forEach(file => {
    if (file.endsWith('.tsx')) {
        const filePath = path.join(componentsDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // Replace font weights
        content = content.replace(/font-black/g, 'font-medium');
        content = content.replace(/font-extrabold/g, 'font-semibold');
        content = content.replace(/font-bold/g, 'font-medium');

        // Tone down sizes of large headers slightly
        content = content.replace(/text-4xl/g, 'text-2xl');
        content = content.replace(/text-3xl/g, 'text-xl');
        content = content.replace(/text-2xl/g, 'text-lg');

        // We should protect the 8xl/9xl folder icons as they are background elements, 
        // so we won't aggressively replace text-[5-9]xl unless needed. Wait, the user said 
        // "its so fat and big everywhere". Text sizes in general.

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated fonts in ${file}`);
    }
});
