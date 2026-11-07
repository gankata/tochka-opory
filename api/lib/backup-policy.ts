export const DEFAULT_FILE_BACKUP_RETAIN = 30;

export function parseFileBackupRetention(raw: string | undefined) {
  const value = Number(raw ?? DEFAULT_FILE_BACKUP_RETAIN);
  return Number.isInteger(value) && value >= 3 ? value : DEFAULT_FILE_BACKUP_RETAIN;
}
