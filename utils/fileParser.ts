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
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];

                // Parse to JSON
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (!jsonData || jsonData.length === 0) {
                    reject(new Error("File is empty"));
                    return;
                }

                // Extract headers (first row) and rows
                const headers = (jsonData[0] as string[]).map((h: any) => String(h).trim());

                // Process rows into objects
                const rows = jsonData.slice(1).map((row: any) => {
                    const rowObj: Record<string, any> = {};
                    headers.forEach((header, index) => {
                        rowObj[header] = row[index];
                    });
                    return rowObj;
                }).filter(row => Object.keys(row).length > 0); // Filter out empty rows if any

                resolve({
                    headers,
                    rows,
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
