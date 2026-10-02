"use server";

import { getUpdateEndpoints } from "./update-endpoints";

/** Read by the desktop updater (components/updater.tsx). Public info, no auth needed. */
export async function getUpdateEndpointsAction(): Promise<string[]> {
  return getUpdateEndpoints();
}
