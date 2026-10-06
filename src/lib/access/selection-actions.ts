"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  listMandataireChoices,
  MANDATAIRE_COOKIE,
  readMandataireSelection,
  type MandataireChoice,
} from "./context";

export type MandataireContext = {
  /** Empty for everyone but assistants: no MJPM picker to show. */
  choices: MandataireChoice[];
  /** "all" or the id of the chosen MJPM (always one of `choices`). */
  selection: string;
};

export async function getMandataireContext(): Promise<MandataireContext> {
  const choices = await listMandataireChoices();
  const selection = await readMandataireSelection();
  const isValid = selection === "all" || choices.some((c) => c.id === selection);
  return { choices, selection: isValid ? selection : "all" };
}

/** Assistant's MJPM picker: "all" or one of their MJPMs. */
export async function setMandataireSelection(selection: string): Promise<MandataireContext> {
  const choices = await listMandataireChoices();
  const value = choices.some((c) => c.id === selection) ? selection : "all";
  (await cookies()).set(MANDATAIRE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { choices, selection: value };
}
