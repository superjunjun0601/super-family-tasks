import { NextResponse } from "next/server";
import { appServiceName } from "@/lib/app-metadata";
import { momUserId } from "@/lib/family-users";
import { petStoreFileName, taskStoreFileName, userStoreFileName } from "@/lib/data-files";
import { findFamilyUser, getCurrentUserId, hasConfiguredAuthSecret } from "@/lib/server-auth";
import { getManualBackupStatus } from "@/lib/server-data-backup";
import { canWriteServerDataDir, getServerDataDir, hasConfiguredServerDataDir } from "@/lib/server-data-dir";
import { getJsonFileStatus } from "@/lib/server-json-store";
import { getDefaultPasswordUsers } from "@/lib/server-user-store";
import { hasDatabaseConfig } from "@/lib/server-db";

export async function GET(request: Request) {
  const currentUser = findFamilyUser(await getCurrentUserId(request));
  const health = {
    ok: true,
    service: appServiceName
  };

  if (currentUser?.role !== momUserId) {
    return NextResponse.json(health);
  }

  return NextResponse.json({
    ...health,
    auth: {
      defaultPasswordUsers: (await getDefaultPasswordUsers()).map((user) => ({
        id: user.id,
        name: user.name
      })),
      secretConfigured: hasConfiguredAuthSecret()
    },
    storageMode: hasDatabaseConfig() ? "postgresql" : "json",
    dataDir: hasDatabaseConfig() ? null : getServerDataDir(),
    dataDirConfigured: hasDatabaseConfig() || hasConfiguredServerDataDir(),
    dataDirWritable: hasDatabaseConfig() || canWriteServerDataDir(),
    manualBackups: getManualBackupStatus(),
    storage: {
      pet: getJsonFileStatus(petStoreFileName),
      tasks: getJsonFileStatus(taskStoreFileName),
      users: getJsonFileStatus(userStoreFileName)
    }
  });
}
