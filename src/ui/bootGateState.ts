export type BootGateStatus = "boot-loading" | "boot-ok" | "boot-outdated" | "boot-error";

export function shouldRenderMainRoutes(status: BootGateStatus): boolean {
  return status === "boot-ok";
}
