import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const CONFIG = {
    synology: {
        url: process.env.SYNOLOGY_URL || 'https://fs.synology.example',
        username: process.env.SYNOLOGY_USERNAME || '',
        password: process.env.SYNOLOGY_PASSWORD || '',
        photosPath: process.env.SYNOLOGY_PHOTOS_PATH || `/home/Photos`,
    },
    immich: {
        url: process.env.IMMICH_URL || 'https://immich.synology.example',
        apiKey: process.env.IMMICH_API_KEY || '',
    },
    options: {
        concurrency: 2, // Low concurrency to save RAM
        progressFile: path.join(os.homedir(), '.synology-immich-progress.json'),
        reportPrefix: 'migration-report',
        maxRetries: 3,
        retryDelay: 1000,
        // Supported file extensions, matches Immich's supported formats
        // https://github.com/immich-app/immich/blob/main/server/src/utils/mime-types.ts
        supportedExtensions: [
            // RAW image formats
            '.3fr', '.ari', '.arw', '.cap', '.cin', '.cr2', '.cr3', '.crw', '.dcr',
            '.dng', '.erf', '.fff', '.iiq', '.k25', '.kdc', '.mrw', '.nef', '.nrw',
            '.orf', '.ori', '.pef', '.psd', '.raf', '.raw', '.rw2', '.rwl', '.sr2',
            '.srf', '.srw', '.x3f',

            // Web-supported images
            '.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp',

            // Other image formats
            '.bmp', '.heic', '.heif', '.hif', '.insp', '.jp2', '.jpe', '.jxl',
            '.svg', '.tif', '.tiff',

            // Video formats
            '.3gp', '.3gpp', '.avi', '.flv', '.insv', '.m2t', '.m2ts', '.m4v',
            '.mkv', '.mov', '.mp4', '.mpe', '.mpeg', '.mpg', '.mts', '.vob',
            '.webm', '.wmv',

            // Sidecar files
            '.xmp',
        ],
    }
};
