import * as fs from 'fs';
import { ProgressData } from '../types';

export class ProgressTracker {
    private progressFile: string;
    private data: ProgressData;

    constructor(progressFile: string) {
        this.progressFile = progressFile;
        this.data = this.load();
    }

    private load(): ProgressData {
        if (fs.existsSync(this.progressFile)) {
            try {
                const raw = fs.readFileSync(this.progressFile, 'utf-8');
                const parsed = JSON.parse(raw);
                return {
                    uploadedFiles: new Set(parsed.uploadedFiles || []),
                    totalFiles: parsed.totalFiles || 0,
                    lastUpdated: parsed.lastUpdated || new Date().toISOString(),
                };
            } catch (error) {
                console.warn('Failed to load progress file, starting fresh');
            }
        }
        return {
            uploadedFiles: new Set(),
            totalFiles: 0,
            lastUpdated: new Date().toISOString(),
        };
    }

    save(): void {
        try {
            const data = {
                uploadedFiles: Array.from(this.data.uploadedFiles),
                totalFiles: this.data.totalFiles,
                lastUpdated: new Date().toISOString(),
            };
            fs.writeFileSync(this.progressFile, JSON.stringify(data, null, 2));
        } catch (error: any) {
            console.error(`Failed to save progress: ${error.message}`);
        }
    }

    markUploaded(filePath: string): void {
        this.data.uploadedFiles.add(filePath);
    }

    isUploaded(filePath: string): boolean {
        return this.data.uploadedFiles.has(filePath);
    }

    getStats() {
        return {
            uploaded: this.data.uploadedFiles.size,
            total: this.data.totalFiles,
            lastUpdated: this.data.lastUpdated,
        };
    }
}
