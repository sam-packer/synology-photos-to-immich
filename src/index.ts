import { MigrationManager } from './manager';

async function main() {
    const manager = new MigrationManager();
    const retryMode = process.argv.includes('--retry-failures');

    try {
        if (retryMode) {
            await manager.retryFailures();
        } else {
            await manager.migrate();
        }
        process.exit(0);
    } catch (error: any) {
        console.error('\nMigration failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
