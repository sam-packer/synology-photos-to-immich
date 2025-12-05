import axios, {AxiosInstance} from 'axios';
import FormData from 'form-data';
import {Readable} from 'stream';

export class ImmichApiClient {
    private axiosInstance: AxiosInstance;

    constructor(private immichUrl: string, private immichApiKey: string) {
        // Ensure URL doesn't end with /api or /
        let baseUrl = immichUrl.replace(/\/$/, '');
        if (baseUrl.endsWith('/api')) {
            baseUrl = baseUrl.slice(0, -4);
        }

        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: {
                'x-api-key': immichApiKey,
                'Accept': 'application/json'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 600000 // 10 minutes timeout to prevent hanging
        });
    }

    async checkServer(): Promise<void> {
        try {
            await this.axiosInstance.get('/api/server/ping');
            console.log('Successfully connected to Immich server');
        } catch (error: any) {
            throw new Error(`Failed to connect to Immich API: ${error.message}`);
        }
    }

    async uploadAsset(
        fileStream: Readable,
        fileName: string,
        fileSize: number,
        deviceAssetId: string,
        createdAt?: Date,
        modifiedAt?: Date
    ): Promise<{ id: string; duplicate: boolean }> {
        const form = new FormData();

        // Metadata
        form.append('deviceAssetId', deviceAssetId);
        form.append('deviceId', 'synology-script');
        form.append('fileCreatedAt', (createdAt || new Date()).toISOString());
        form.append('fileModifiedAt', (modifiedAt || new Date()).toISOString());
        form.append('isFavorite', 'false');

        // knownLength is required for reliable progress/upload with streams
        // However, if the source (Synology) reports size 0 (common with some formats like m4v),
        // we must omit knownLength so form-data uses chunked transfer encoding instead of sending Content-Length: 0
        const appendOptions: FormData.AppendOptions = {
            filename: fileName,
        };
        if (fileSize > 0) {
            appendOptions.knownLength = fileSize;
        }

        form.append('assetData', fileStream, appendOptions);

        try {
            const response = await this.axiosInstance.post('/api/assets', form, {
                headers: {
                    ...form.getHeaders()
                },
            });
            return {id: response.data.id, duplicate: response.data.duplicate};
        } catch (error: any) {
            // Check for duplicates
            if (error.response?.status === 409) {
                return {id: 'duplicate', duplicate: true};
            }
            throw new Error(`Upload failed: ${error.message} ${JSON.stringify(error.response?.data || '')}`);
        }
    }
}
