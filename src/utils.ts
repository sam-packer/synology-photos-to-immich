import { CONFIG } from './config';

export async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = CONFIG.options.maxRetries,
    initialDelay: number = CONFIG.options.retryDelay,
    operation: string = 'operation'
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt);
                await sleep(delay);
            }
        }
    }
    throw lastError || new Error(`${operation} failed`);
}
