import fs from "node:fs";

export function secureLocalDataDirectory(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dataDir, 0o700);
}

export function secureLocalDatabaseFiles(databasePath: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.chmodSync(`${databasePath}${suffix}`, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
