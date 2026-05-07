import { resolvePreferredRocketLeaguePath } from "../items/rocketLeaguePathService";
import { loadAppState } from "../items/stateService";

export type StartupPathSetupResult =
  | {
      status: "ready";
      rocketLeaguePath: string;
      shouldPersist: boolean;
    }
  | {
      status: "needs-setup";
    };

export async function checkStartupPathSetup(): Promise<StartupPathSetupResult> {
  const appState = await loadAppState();
  const savedPath = typeof appState.rocketLeaguePath === "string" ? appState.rocketLeaguePath : "";
  const resolvedPath = await resolvePreferredRocketLeaguePath(savedPath);

  if (resolvedPath.source === "empty") {
    return { status: "needs-setup" };
  }

  return {
    status: "ready",
    rocketLeaguePath: resolvedPath.rocketLeaguePath,
    shouldPersist: resolvedPath.rocketLeaguePath !== savedPath.trim(),
  };
}
