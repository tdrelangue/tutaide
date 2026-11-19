/**
 * The « Agenda » add-on ships hidden until it is released: build with
 * NEXT_PUBLIC_TUTELLIA_AGENDA_UI=1 to show it. Hidden, no account sees it
 * (granted or demo), its pages redirect and its actions refuse; the admin
 * checkbox and badge disappear too. Data already saved is kept.
 * No server import here: client components read it too.
 */
export const IS_AGENDA_RELEASED = process.env.NEXT_PUBLIC_TUTELLIA_AGENDA_UI === "1";
