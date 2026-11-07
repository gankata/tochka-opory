import type { RouterOutputs } from "@/providers/trpc";

export type Workspace = RouterOutputs["workspace"]["get"];
export type Transaction = Workspace["transactions"][number];
export type Payment = Workspace["payments"][number];
export type Envelope = Workspace["envelopes"][number];
export type Goal = Workspace["goals"][number];
export type MoodEntry = Workspace["moods"][number];
export type MoodOption = Workspace["options"][number];
export type Note = Workspace["notes"][number];
export type Reminder = Workspace["reminders"][number];
export type Settings = NonNullable<Workspace["settings"]>;
export type BackupInfo = RouterOutputs["workspace"]["backupList"]["items"][number];
