"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NotesView, TaskView } from "@/lib/agenda/notes";
import type { AgendaDataResult } from "@/lib/agenda/views/types";
import { ERROR_TEXT } from "../address-field";
import { addEntryTask, getEntryNotes, removeEntryTask, saveEntryNotes, setEntryTaskDone } from "../notes-actions";
import { useAgendaQuery } from "../use-agenda-query";

/** Which rendez-vous: its item key (as the week sends it back), its title and when. */
export type NotesTarget = { readonly key: string; readonly title: string; readonly when: string };

const MAX_NOTES = 5000;
const MAX_TASK = 200;

/** Notes and checklist of a rendez-vous. Opened from the week, the month or the list of rendez-vous. */
export function NotesDialog({ target, onClose }: { target: NotesTarget | null; onClose: () => void }) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }
  return (
    <Dialog open={target !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Notes et tâches</DialogTitle>
          <DialogDescription>
            {target?.title} · {target?.when}
          </DialogDescription>
        </DialogHeader>
        {target && <NotesBody key={target.key} entryKey={target.key} />}
      </DialogContent>
    </Dialog>
  );
}

function useNotes(entryKey: string) {
  const query = useAgendaQuery();
  const { run } = query;
  const [view, setView] = useState<NotesView | null>(null);
  const apply = useCallback(
    async (action: () => Promise<AgendaDataResult<NotesView>>): Promise<boolean> => {
      const data = await run(action);
      if (data) setView(data);
      return data !== null;
    },
    [run],
  );
  useEffect(() => {
    void apply(() => getEntryNotes(entryKey));
  }, [apply, entryKey]);
  return { view, apply, isBusy: query.isBusy, error: query.error };
}

function NotesBody({ entryKey }: { entryKey: string }) {
  const notes = useNotes(entryKey);
  if (notes.view === null) {
    return notes.error ? <p role="alert" className={ERROR_TEXT}>{notes.error}</p> : <Loading />;
  }
  return (
    <div className="space-y-5">
      <Checklist entryKey={entryKey} tasks={notes.view.tasks} busy={notes.isBusy} apply={notes.apply} />
      <NotesField entryKey={entryKey} initial={notes.view.notes} busy={notes.isBusy} apply={notes.apply} />
      {notes.error && <p role="alert" className={ERROR_TEXT}>{notes.error}</p>}
    </div>
  );
}

type Apply = (action: () => Promise<AgendaDataResult<NotesView>>) => Promise<boolean>;

function Checklist({ entryKey, tasks, busy, apply }: { entryKey: string; tasks: readonly TaskView[]; busy: boolean; apply: Apply }) {
  const [label, setLabel] = useState("");
  const done = tasks.filter((t) => t.done).length;
  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (label.trim() === "" || busy) return;
    if (await apply(() => addEntryTask(entryKey, label))) setLabel("");
  }
  return (
    <section aria-labelledby="checklist-title" className="space-y-2">
      <h3 id="checklist-title" className="text-sm font-semibold">
        Tâches à faire {tasks.length > 0 && <span className="font-normal text-muted-foreground">({done} sur {tasks.length} faites)</span>}
      </h3>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune tâche pour ce rendez-vous.</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} entryKey={entryKey} task={task} busy={busy} apply={apply} />
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <Label htmlFor="new-task" className="sr-only">Nouvelle tâche</Label>
        <Input id="new-task" value={label} maxLength={MAX_TASK} placeholder="ex. Apporter le relevé de compte" onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" variant="outline" disabled={busy || label.trim() === ""}>
          <Plus aria-hidden="true" />
          Ajouter
        </Button>
      </form>
    </section>
  );
}

function TaskRow({ entryKey, task, busy, apply }: { entryKey: string; task: TaskView; busy: boolean; apply: Apply }) {
  const id = `task-${task.id}`;
  function handleChecked(value: boolean | "indeterminate") {
    void apply(() => setEntryTaskDone(entryKey, task.id, value === true));
  }
  function handleRemove() {
    void apply(() => removeEntryTask(entryKey, task.id));
  }
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
      <Checkbox id={id} checked={task.done} disabled={busy} onCheckedChange={handleChecked} />
      <Label htmlFor={id} className={`flex-1 font-normal ${task.done ? "text-muted-foreground line-through" : ""}`}>
        {task.label}
      </Label>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={handleRemove} aria-label={`Supprimer la tâche : ${task.label}`}>
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}

function NotesField({ entryKey, initial, busy, apply }: { entryKey: string; initial: string; busy: boolean; apply: Apply }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const isDirty = text.trim() !== initial.trim();
  async function handleSave() {
    if (await apply(() => saveEntryNotes(entryKey, text))) setSaved("Notes enregistrées.");
  }
  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setSaved(null);
  }
  return (
    <section className="space-y-2">
      <Label htmlFor="entry-notes" className="text-sm font-semibold">Notes</Label>
      <Textarea id="entry-notes" rows={5} maxLength={MAX_NOTES} value={text} onChange={handleChange} placeholder="Préparation, ce qui a été dit, ce qu'il reste à faire…" aria-describedby="entry-notes-hint" />
      <p id="entry-notes-hint" className="text-xs text-muted-foreground">Chiffrées et visibles seulement par vous (et vos assistants). Elles figurent dans l&apos;extraction pour un audit.</p>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={busy || !isDirty}>
          {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
          Enregistrer les notes
        </Button>
        <p role="status" className="text-sm text-muted-foreground">{saved}</p>
      </div>
    </section>
  );
}

function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
      Chargement…
    </p>
  );
}
