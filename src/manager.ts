import * as fs from 'fs';
import * as path from 'path';
import * as cliProgress from 'cli-progress';
import { CONFIG } from './config';
import { SynologyFile, MigrationReport, FailedFileReport } from './types';
import { retryWithBackoff } from './utils';
import { SynologyFileStationClient } from './services/synology';
import { ImmichApiClient } from './services/immich';
import { ProgressTracker } from './services/progress';

export class MigrationManager {
    private synologyClient: SynologyFileStationClient;
    private immichClient: ImmichApiClient;
    private progressTracker: ProgressTracker;
    private currentReportPath: string;
    private processingFiles = new Map<string, SynologyFile>();
    private activeBar?: cliProgress.SingleBar;
    private stats = {
        uploaded: 0,
        skipped: 0,
        failed: 0,
    };

    private report: MigrationReport = {
        successful: [],
        skipped: [],
        failed: []
    };

    constructor() {
        this.synologyClient = new SynologyFileStationClient(CONFIG.synology.url);
        this.immichClient = new ImmichApiClient(CONFIG.immich.url, CONFIG.immich.apiKey);
        this.progressTracker = new ProgressTracker(CONFIG.options.progressFile);
        
        // Generate a unique timestamped filename for this run
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.currentReportPath = `${CONFIG.options.reportPrefix}-${timestamp}.json`;
    }

    private saveReport() {
        try {
            fs.writeFileSync(this.currentReportPath, JSON.stringify(this.report, null, 2));
        } catch (error: any) {
            console.error(`Failed to save report: ${error.message}`);
        }
    }

    private getLatestReportPath(): string | null {
        try {
            const dir = process.cwd();
            const prefix = CONFIG.options.reportPrefix;
            const files = fs.readdirSync(dir)
                .filter(f => f.startsWith(prefix) && f.endsWith('.json'));

            if (files.length === 0) return null;

            // Sort by modification time, newest first
            const sorted = files
                .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime.getTime() }))
                .sort((a, b) => b.time - a.time);

            return sorted[0].name;
        } catch (e) {
            return null;
        }
    }

    async retryFailures(): Promise<void> {
        const lastReportPath = this.getLatestReportPath();
        if (!lastReportPath) {
            console.error('No previous report file found to retry from.');
            return;
        }

        console.log(`Loading previous report from: ${lastReportPath}`);

        let previousReport: MigrationReport;
        try {
            previousReport = JSON.parse(fs.readFileSync(lastReportPath, 'utf-8'));
        } catch (e) {
            console.error('Failed to parse report file.');
            return;
        }

        if (!previousReport.failed || previousReport.failed.length === 0) {
            console.log('No failed files to retry in the last report.');
            return;
        }

        console.log('='.repeat(60));
        console.log(`Retrying ${previousReport.failed.length} failed files...`);
        console.log('='.repeat(60));

        this.validateConfig();

        try {
            await this.synologyClient.login(CONFIG.synology.username, CONFIG.synology.password);
            await this.immichClient.checkServer();

            const mainBar = new cliProgress.SingleBar({
                format: 'Retry |{bar}| {value}/{total} | {uploaded} up, {skipped} skip, {failed} fail | {filename}',
                barCompleteChar: '\u2588',
                barIncompleteChar: '\u2591',
                hideCursor: true
            });
            this.activeBar = mainBar;

            mainBar.start(previousReport.failed.length, 0, { uploaded: 0, skipped: 0, failed: 0, filename: 'Starting...' });

            // Reset current session stats
            this.stats = { uploaded: 0, skipped: 0, failed: 0 };
            
            // Pre-fill the current report with success/skipped from the previous run
            // to ensure the final report is a complete cumulative record.
            this.report = {
                successful: [...(previousReport.successful || [])],
                skipped: [...(previousReport.skipped || [])],
                failed: [] // We will populate this with the retry results
            };

            const queue: Promise<void>[] = [];
            
            for (const failure of previousReport.failed) {
                 const file = failure.file;
                 
                 // Standard queue logic
                 if (this.progressTracker.isUploaded(file.path)) {
                    mainBar.increment(1, { filename: "Already done" });
                    this.stats.skipped++;
                    this.report.skipped.push(file.path);
                    continue;
                 }
                 
                 if (queue.length >= CONFIG.options.concurrency) {
                    await Promise.race(queue);
                 }

                 const task = this.processFile(file, mainBar).then(() => {
                    queue.splice(queue.indexOf(task), 1);
                 });
                 queue.push(task);
            }
            
            await Promise.all(queue);
            mainBar.stop();
            this.progressTracker.save();
            this.saveReport();
            
            console.log('\n' + '='.repeat(60));
            console.log('Retry Summary');
            console.log('='.repeat(60));
            console.log(`Uploaded (retry): ${this.stats.uploaded}`);
            console.log(`Skipped (retry):  ${this.stats.skipped}`);
            console.log(`Failed (retry):   ${this.stats.failed}`);
            console.log(`Full cumulative report saved to ${this.currentReportPath}`);

        } finally {
            await this.synologyClient.logout();
        }
    }

    async migrate(): Promise<void> {
        console.log('='.repeat(60));
        console.log('Synology Photos to Immich Migration');
        console.log(`Concurrency: ${CONFIG.options.concurrency}`);
        console.log('='.repeat(60));
        console.log();

        // Check resume
        const existingProgress = this.progressTracker.getStats();
        if (existingProgress.uploaded > 0) {
            console.log(`Resuming: ${existingProgress.uploaded} files previously processed.`);
        }

        this.validateConfig();

        try {
            await this.synologyClient.login(CONFIG.synology.username, CONFIG.synology.password);
            await this.immichClient.checkServer();

            console.log('\nStarting Migration...');
            
            const mainBar = new cliProgress.SingleBar({
                format: 'Stream |{bar}| {value} processed | {uploaded} up, {skipped} skip, {failed} fail | {filename}',
                barCompleteChar: '\u2588',
                barIncompleteChar: '\u2591',
                hideCursor: true
            });
            this.activeBar = mainBar;

            mainBar.start(100000, 0, { uploaded: 0, skipped: 0, failed: 0, filename: 'Waiting...' });

            const queue: Promise<void>[] = [];
            
            for await (const file of this.synologyClient.scanFilesGenerator(
                CONFIG.synology.photosPath,
                CONFIG.options.supportedExtensions
            )) {
                // Check if already uploaded
                if (this.progressTracker.isUploaded(file.path)) {
                    continue;
                }

                // Wait if queue is full
                if (queue.length >= CONFIG.options.concurrency) {
                    await Promise.race(queue);
                }

                // Add task to queue
                const task = this.processFile(file, mainBar).then(() => {
                    // Remove self from queue when done
                    queue.splice(queue.indexOf(task), 1);
                });
                queue.push(task);
            }

            // Wait for remaining
            await Promise.all(queue);

            mainBar.stop();
            this.progressTracker.save(); // Final save

            console.log('\n' + '='.repeat(60));
            console.log('Migration Summary');
            console.log('='.repeat(60));
            console.log(`Uploaded (new):   ${this.stats.uploaded}`);
            console.log(`Skipped (dupes):  ${this.stats.skipped}`);
            console.log(`Failed:           ${this.stats.failed}`);
            console.log('='.repeat(60));
            
            this.saveReport();
            console.log(`Report saved to ${this.currentReportPath}`);

        } finally {
            await this.synologyClient.logout();
        }
    }

    private async processFile(file: SynologyFile, bar: cliProgress.SingleBar) {
        this.processingFiles.set(file.path, file);
        bar.increment(1, { filename: file.name.substring(0, 20) });
        
        try {
            await retryWithBackoff(async () => {
                const stream = await this.synologyClient.getFileStream(file.path);
                const mtime = file.additional?.time?.mtime ? new Date(file.additional.time.mtime * 1000) : undefined;
                const crtime = file.additional?.time?.crtime ? new Date(file.additional.time.crtime * 1000) : undefined;
                const size = file.additional?.size || 0;

                const deviceAssetId = `syno-${Buffer.from(file.path).toString('base64')}`;

                const result = await this.immichClient.uploadAsset(
                    stream, 
                    file.name, 
                    size, 
                    deviceAssetId, 
                    crtime || mtime,
                    mtime
                );

                if (result.duplicate) {
                    this.stats.skipped++;
                    this.report.skipped.push(file.path);
                } else {
                    this.stats.uploaded++;
                    this.report.successful.push(file.path);
                }
                
                this.progressTracker.markUploaded(file.path);
                
                // Update bar stats
                bar.update({ uploaded: this.stats.uploaded, skipped: this.stats.skipped, failed: this.stats.failed });

            }, CONFIG.options.maxRetries, CONFIG.options.retryDelay, `Upload ${file.name}`);
        } catch (error: any) {
            this.stats.failed++;
            this.report.failed.push({ file: file, reason: error.message });
            bar.update({ uploaded: this.stats.uploaded, skipped: this.stats.skipped, failed: this.stats.failed });
            // console.error(`\nFailed: ${file.path}`);
        } finally {
            this.processingFiles.delete(file.path);
        }
        
        // Periodic save
        if ((this.stats.uploaded + this.stats.skipped) % 10 === 0) {
            this.progressTracker.save();
        }
    }

    private validateConfig(): void {
        if (!CONFIG.synology.username || !CONFIG.synology.password) {
            throw new Error('Missing Synology credentials');
        }
        if (!CONFIG.immich.apiKey) {
            throw new Error('Missing Immich API Key');
        }
    }

    public handleShutdown(): void {
        if (this.activeBar) {
            this.activeBar.stop();
        }

        console.log('\n\nGraceful shutdown initiated...');

        if (this.processingFiles.size > 0) {
            console.log(`Marking ${this.processingFiles.size} in-flight files as failed/interrupted.`);

            for (const [_, file] of this.processingFiles) {
                this.report.failed.push({
                    file: file,
                    reason: 'Process interrupted by user (SIGINT/Ctrl+C)'
                });
                this.stats.failed++;
            }
        }

        this.saveReport();
        this.progressTracker.save();
        console.log(`Report saved to ${this.currentReportPath}`);
        console.log('Progress saved.');
    }
}
