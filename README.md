# Synology Photos to Immich Migration

This tool helps you move your photos and videos directly from a Synology NAS to your Immich server. It streams files one
by one, so it won't fill up your computer's hard drive during the process.

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sam-packer/synology-photos-to-immich.git
   cd synology-photos-to-immich
   ```
2. **Install Node.js and Bun**:
   Make sure you have [Node.js](https://nodejs.org/) (which includes npm) and [Bun](https://bun.sh/) installed on your
   system.
3. **Install dependencies**:
   ```bash
   bun install
   ```

## Important Considerations

- **No Deletion on Synology**: This script *never* deletes any photos or videos from your Synology NAS. Your original
  files will remain untouched in Synology Photos/File Station after the migration.
- **One-Time Migration**: This tool is designed for a one-time migration from Synology Photos to Immich, not for
  continuous synchronization. It's intended to be run when you are ready to fully transition to Immich.
- **Storage Responsibility**: After migration, you will have duplicate copies of your photos (on your Synology NAS and
  in Immich). It is *your responsibility* to manage storage, decommission Synology Photos, and delete files from your
  Synology NAS if you choose to do so. Ensure you have sufficient space on your Immich server for all migrated files.

## Setup

1. **Get Credentials**: You will need the URL, username, and password for your Synology NAS. You also need your Immich
   server URL and an API Key (found in Immich under Account Settings > API Keys).
2. **Configure**:
    * Duplicate the `.env.example` file and rename it to `.env`.
    * Open `.env` in a text editor.
    * Fill in the required fields (Synology details and Immich details).
    * You can also tweak settings like how many files to upload at once (concurrency) in `src/config.ts`, but the
      defaults usually work fine.

## How to Run

Once your `.env` file is ready, run the migration with:

```bash
bun run start
```

The tool will:

1. Connect to your Synology NAS and find your photos.
2. Start streaming them to Immich.
3. Show you a progress bar with the current status.
4. Generate a report file when finished.

## Reports and Retrying

### Report Files

Every time you run the script, it creates a "report file" in the project folder.
The filename looks like this: `migration-report-1709...json`. The long number at the end is a timestamp, so you always
get a new report for every run and never lose the history of previous attempts.

This file contains a list of:

* **Successful**: Files that uploaded correctly.
* **Skipped**: Files Immich already had (duplicates).
* **Failed**: Files that couldn't be uploaded, and the reason why.

### Fixing Failures

If some files fail to upload (e.g., due to a network blip), you don't need to start over from scratch. You can tell the
tool to look at the *latest* report file and only try to upload the ones that failed previously.

Run this command:

```bash
bun run start --retry-failures
```

When you do this:

1. It automatically finds the most recent report file.
2. It retries only the files listed as "failed".
3. It generates a *new* cumulative report file that includes the successes from the previous run plus the results of
   this retry.
