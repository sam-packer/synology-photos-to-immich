export interface SynologyFile {
    path: string;
    name: string;
    isdir: boolean;
    additional?: {
        size?: number;
        time?: {
            mtime?: number;
            crtime?: number;
        };
    };
}

export interface ProgressData {
    uploadedFiles: Set<string>;
    totalFiles: number;
    lastUpdated: string;
}

export interface FailedFileReport {
    file: SynologyFile;
    reason: string;
}

export interface MigrationReport {
    successful: string[];
    skipped: string[];
    failed: FailedFileReport[];
}
