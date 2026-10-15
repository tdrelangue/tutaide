"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDuration, minutesToTime, timeToMinutes } from "@/lib/agenda/rules";
import type { AgendaSettingsView, Place } from "@/lib/agenda/service";
import { AddressField, ERROR_TEXT, PENDING_ADDRESS_ERROR } from "./address-field";
import { saveAgendaSettings } from "./actions";
import { useAgendaAction } from "./use-agenda-action";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 7, label: "Dimanche" },
];

export const VISIT_DURATIONS = [30, 45, 60, 90, 120];

/** Where the MJPM starts and ends their rounds, and when they work. */
export function SettingsTab({ profile }: { profile: AgendaSettingsView }) {
  const [home, setHome] = useState<Place | null>(profile.home);
  const [office, setOffice] = useState<Place | null>(profile.office);
  const [workDays, setWorkDays] = useState<number[]>(profile.workDays);
  const [dayStart, setDayStart] = useState(minutesToTime(profile.dayStartMinutes));
  const [dayEnd, setDayEnd] = useState(minutesToTime(profile.dayEndMinutes));
  const [dayEndLimit, setDayEndLimit] = useState(
    profile.dayEndLimitMinutes === null ? "" : minutesToTime(profile.dayEndLimitMinutes)
  );
  const [visitMinutes, setVisitMinutes] = useState(profile.defaultVisitMinutes);
  const [pendingHome, setPendingHome] = useState(false);
  const [pendingOffice, setPendingOffice] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { run, isBusy, error } = useAgendaAction();

  /** Once nothing is left typed-but-unpicked, the "choose in the list" message is stale. */
  function clearPendingError() {
    setLocalError((current) => (current === PENDING_ADDRESS_ERROR ? null : current));
  }

  function handleHomePending(isPending: boolean) {
    setPendingHome(isPending);
    if (!isPending) clearPendingError();
  }

  function handleOfficePending(isPending: boolean) {
    setPendingOffice(isPending);
    if (!isPending) clearPendingError();
  }

  function toggleDay(day: number, checked: boolean) {
    setWorkDays((days) => (checked ? [...days, day] : days.filter((d) => d !== day)));
  }

  function handleDayStartChange(event: React.ChangeEvent<HTMLInputElement>) {
    setDayStart(event.target.value);
  }

  function handleDayEndChange(event: React.ChangeEvent<HTMLInputElement>) {
    setDayEnd(event.target.value);
  }

  function handleDayEndLimitChange(event: React.ChangeEvent<HTMLInputElement>) {
    setDayEndLimit(event.target.value);
  }

  function handleVisitMinutesChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setVisitMinutes(Number(event.target.value));
  }

  /** Same rules as the server, checked first so the message appears at once. */
  function checkForm(start: number | null, end: number | null, limit: number | null): string | null {
    if (pendingHome || pendingOffice) return PENDING_ADDRESS_ERROR;
    if (workDays.length === 0) return "Cochez au moins un jour travaillé.";
    if (start === null || end === null) return "Indiquez une heure de début et de fin valides.";
    if (end - start < 60) return "La fin de journée doit être au moins une heure après le début.";
    if (dayEndLimit !== "" && limit === null) return "Indiquez une heure limite valide, ou laissez-la vide.";
    if (limit !== null && limit < end) return "L'heure limite ne peut pas être avant la fin de journée souhaitée.";
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const limit = dayEndLimit === "" ? null : timeToMinutes(dayEndLimit);
    const problem = checkForm(timeToMinutes(dayStart), timeToMinutes(dayEnd), limit);
    setLocalError(problem);
    if (problem) return;
    await run(() =>
      saveAgendaSettings({
        home,
        office,
        workDays,
        dayStartMinutes: timeToMinutes(dayStart) ?? -1,
        dayEndMinutes: timeToMinutes(dayEnd) ?? -1,
        dayEndLimitMinutes: limit,
        defaultVisitMinutes: visitMinutes,
      })
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold leading-none tracking-tight">Points de départ</h2>
          <CardDescription>
            Vos tournées partent de votre domicile et y reviennent, ou passent par le bureau les jours
            de bureau. Les adresses sont recherchées dans la Base Adresse Nationale (service public de
            l&apos;IGN) ; elles ne sont jamais envoyées à Google.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AddressField label="Domicile" value={home} onChange={setHome} onPendingChange={handleHomePending} disabled={isBusy} />
          <AddressField label="Bureau (facultatif)" value={office} onChange={setOffice} onPendingChange={handleOfficePending} disabled={isBusy} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold leading-none tracking-tight">Journées de travail</h2>
          <CardDescription id="agenda-day-end-hint">
            Aucune visite n&apos;est proposée en dehors de ces jours. Les heures de fin comptent le
            retour à la maison. Tutellia vise la fin souhaitée et ne
            la dépasse que si cela évite de reporter un rendez-vous ; il ne propose jamais rien
            après la limite stricte. Seuls les rendez-vous que vous placez vous-même peuvent aller
            au-delà.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset className="space-y-2" disabled={isBusy}>
            <legend className="text-sm font-medium">Jours travaillés</legend>
            <div className="flex flex-wrap gap-4">
              {WEEKDAYS.map((day) => (
                <div key={day.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`workday-${day.value}`}
                    checked={workDays.includes(day.value)}
                    onCheckedChange={(v) => toggleDay(day.value, v === true)}
                  />
                  <Label htmlFor={`workday-${day.value}`} className="font-normal">{day.label}</Label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-6">
            <div className="space-y-1">
              <Label htmlFor="agenda-day-start">Début de journée</Label>
              <Input id="agenda-day-start" type="time" value={dayStart} onChange={handleDayStartChange} disabled={isBusy} className="w-32" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agenda-day-end">Fin de journée souhaitée</Label>
              <Input id="agenda-day-end" type="time" value={dayEnd} onChange={handleDayEndChange} disabled={isBusy} className="w-32" aria-describedby="agenda-day-end-hint" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agenda-day-end-limit">Limite stricte</Label>
              <Input id="agenda-day-end-limit" type="time" value={dayEndLimit} onChange={handleDayEndLimitChange} disabled={isBusy} className="w-32" aria-describedby="agenda-day-end-hint" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agenda-visit-minutes">Durée d&apos;une visite (par défaut)</Label>
              <select
                id="agenda-visit-minutes"
                value={visitMinutes}
                onChange={handleVisitMinutesChange}
                disabled={isBusy}
                className="flex h-10 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {VISIT_DURATIONS.map((m) => (
                  <option key={m} value={m}>{formatDuration(m)}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {(localError ?? error) && <p role="alert" className={ERROR_TEXT}>{localError ?? error}</p>}
      <Button type="submit" disabled={isBusy}>
        {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Enregistrer les paramètres
      </Button>
    </form>
  );
}
