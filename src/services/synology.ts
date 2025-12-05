import axios, { AxiosInstance } from 'axios';
import * as path from 'path';
import { Readable } from 'stream';
import { SynologyFile } from '../types';

export class SynologyFileStationClient {
    private axiosInstance: AxiosInstance;
    private sid: string | null = null;

    constructor(private baseUrl: string) {
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            timeout: 60000,
        });
    }

    async login(username: string, password: string): Promise<void> {
        console.log('Logging in to Synology FileStation...');
        try {
            const response = await this.axiosInstance.get('/webapi/auth.cgi', {
                params: {
                    api: 'SYNO.API.Auth',
                    version: '6',
                    method: 'login',
                    account: username,
                    passwd: password,
                    session: 'FileStation',
                    format: 'sid',
                }
            });

            if (response.data.success) {
                this.sid = response.data.data.sid;
                console.log('Successfully logged in to Synology FileStation');
            } else {
                throw new Error(`Login failed: ${JSON.stringify(response.data)}`);
            }
        } catch (error: any) {
            throw new Error(`Failed to connect to Synology: ${error.message}`);
        }
    }

    async *scanFilesGenerator(folderPath: string, extensions: string[]): AsyncGenerator<SynologyFile> {
        if (!this.sid) throw new Error('Not logged in');

        const dirsToProcess: string[] = [folderPath];
        let dirsProcessed = 0;

        process.stdout.write('  Scanning directories...\n');

        while (dirsToProcess.length > 0) {
            const currentDir = dirsToProcess.shift()!;
            dirsProcessed++;

            let offset = 0;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                try {
                    const response = await this.axiosInstance.get('/webapi/entry.cgi', {
                        params: {
                            api: 'SYNO.FileStation.List',
                            version: '2',
                            method: 'list',
                            folder_path: currentDir,
                            additional: JSON.stringify(['size', 'time']),
                            offset: offset,
                            limit: limit,
                            _sid: this.sid,
                        }
                    });

                    if (response.data.success) {
                        const files = response.data.data.files || [];
                        for (const file of files) {
                            if (file.isdir) {
                                dirsToProcess.push(file.path);
                            } else {
                                const ext = path.extname(file.name).toLowerCase();
                                if (extensions.includes(ext)) {
                                    yield file;
                                }
                            }
                        }
                        if (files.length < limit) hasMore = false;
                        else offset += limit;
                    } else {
                        console.warn(`\nWarning: Failed to list directory ${currentDir}`);
                        hasMore = false;
                    }
                } catch (error) {
                    console.warn(`\nWarning: Error scanning ${currentDir}`);
                    hasMore = false;
                }
            }
        }
    }

    /**
     * Returns a Readable Stream for the file content
     */
    async getFileStream(filePath: string): Promise<Readable> {
        if (!this.sid) throw new Error('Not logged in');

        const response = await this.axiosInstance.get('/webapi/entry.cgi', {
            params: {
                api: 'SYNO.FileStation.Download',
                version: '2',
                method: 'download',
                path: filePath,
                mode: 'download',
                _sid: this.sid,
            },
            responseType: 'stream',
        });
        return response.data;
    }

    async logout(): Promise<void> {
        if (!this.sid) return;
        try {
            await this.axiosInstance.get('/webapi/auth.cgi', {
                params: {
                    api: 'SYNO.API.Auth',
                    version: '6',
                    method: 'logout',
                    session: 'FileStation',
                    _sid: this.sid,
                }
            });
            console.log('Logged out from Synology FileStation');
        } catch (error) {}
    }
}
