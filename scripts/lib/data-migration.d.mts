export type MigrationResult =
  | { status: "skipped"; reason: string }
  | { status: "restored"; sourceDir: string; dataDir: string };

export function restoreAdjacentData(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logger?: Pick<Console, "log" | "warn">;
}): Promise<MigrationResult>;
