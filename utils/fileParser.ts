import * as XLSX from 'xlsx';

export interface ParsedFile {
    headers: string[];
    rows: any[];
    fileName: string;
}

export const parseFile = async (file: File): Promise<ParsedFile> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary', cellDates: true, dateNF: 'yyyy-mm-dd' });

                let allRows: any[] = [];
                let primaryHeaders: string[] = [];
                let sheetsProcessed = 0;

                console.log(`[FileParser] Scanning ${workbook.SheetNames.length} sheets for matching data...`);

                workbook.SheetNames.forEach((sheetName) => {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

                    if (!jsonData || jsonData.length === 0) {
                        console.log(`[FileParser] Skipped empty sheet: "${sheetName}"`);
                        return;
                    }

                    // Extract headers (first row)
                    const headers = (jsonData[0] as string[]).map((h: any) => String(h).trim());

                    if (headers.length === 0) return;

                    // Logic to establish Primary Schema or Merge
                    let isMatch = false;
                    if (primaryHeaders.length === 0) {
                        // First valid sheet defines the schema
                        primaryHeaders = headers;
                        isMatch = true;
                        console.log(`[FileParser] Primary Schema defined by sheet: "${sheetName}" (${headers.join(', ')})`);
                    } else {
                        // Check if headers match primary schema (Set equality for robustness)
                        const currentSet = new Set(headers);
                        const primarySet = new Set(primaryHeaders);
                        // We check if all primary headers are present in current sheet (subset match allows extra columns)
                        // Or strict match? User said "check with column names".
                        // Strict specific columns check is safer to avoid merging incompatible data.
                        // We'll require at least 80% overlap or key columns match?
                        // Simple robust approach: Check if identical set of headers.
                        if (headers.length === primaryHeaders.length && headers.every(h => primarySet.has(h))) {
                            isMatch = true;
                            console.log(`[FileParser] Merging sheet: "${sheetName}" (Headers match)`);
                        } else {
                            console.log(`[FileParser] Skipped sheet: "${sheetName}" (Headers mismatch)`);
                        }
                    }

                    if (isMatch) {
                        const sheetRows = jsonData.slice(1).map((row: any) => {
                            const rowObj: Record<string, any> = {};
                            headers.forEach((header, index) => {
                                rowObj[header] = row[index];
                            });
                            return rowObj;
                        }).filter(row => Object.keys(row).length > 0);

                        allRows = allRows.concat(sheetRows);
                        sheetsProcessed++;
                    }
                });

                if (allRows.length === 0) {
                    reject(new Error("No valid data found in any sheet"));
                    return;
                }

                console.log(`[FileParser] Total Processed: ${allRows.length} rows from ${sheetsProcessed} sheets.`);

                resolve({
                    headers: primaryHeaders,
                    rows: allRows,
                    fileName: file.name
                });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);

        reader.readAsBinaryString(file);
    });
};
