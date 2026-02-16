import { TransformationStep } from "../types";

export const applyTransformations = (value: any, transformations: TransformationStep[]) => {
    let result = value;
    transformations.forEach(step => {
        switch (step.type) {
            case 'constant': result = step.value; break;
            case 'uppercase': result = String(result || '').toUpperCase(); break;
            case 'lowercase': result = String(result || '').toLowerCase(); break;
            case 'trim': result = String(result || '').trim(); break;
            case 'default_if_null': if (result === null || result === undefined || result === '') result = step.value; break;
            case 'prefix': result = (step.value || '') + String(result || ''); break;
            case 'suffix': result = String(result || '') + (step.value || ''); break;
            case 'replace': result = String(result || '').replace(new RegExp(step.value || '', 'g'), step.replaceWith || ''); break;
            case 'to_number':
                if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
                    result = null;
                } else {
                    const num = Number(result);
                    result = isNaN(num) ? null : num;
                }
                break;
            case 'to_date':
                if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
                    result = null;
                } else {
                    const timestamp = Date.parse(result);
                    if (isNaN(timestamp)) {
                        result = null;
                    } else {
                        result = new Date(timestamp).toISOString();
                    }
                }
                break;
            case 'concatenate':
                result = String(result || '') + (step.value || '');
                break;
            case 'substring':
                if (step.value && step.value.includes(',')) {
                    const [start, end] = step.value.split(',').map(Number);
                    result = String(result || '').substring(start, end);
                }
                break;
        }
    });
    return result;
};
