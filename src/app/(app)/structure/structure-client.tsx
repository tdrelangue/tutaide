"use client";

import { Building2, FolderSync, History, Mail, Users, Waypoints } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrgOverview } from "@/lib/organizations/overview";
import type { AuditRow } from "@/lib/organizations/audit";
import { JournalTab } from "./journal-tab";
import { MembersTab } from "./members-tab";
import { DistributionTab } from "./distribution-tab";
import { MailTab } from "./mail-tab";
import { StorageTab } from "./storage-tab";

type Props = { overview: OrgOverview; journal: AuditRow[]; currentUserId: string };

export function StructureClient({ overview, journal, currentUserId }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{overview.name}</h1>
            <p className="text-sm text-muted-foreground">
              Administration de la structure : comptes, répartition des mandataires, messagerie et stockage.
              Les dossiers des protégés ne sont pas visibles ici.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid h-auto w-full max-w-3xl grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="members" className="flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden="true" /> Membres
            </TabsTrigger>
            <TabsTrigger value="distribution" className="flex items-center gap-2">
              <Waypoints className="h-4 w-4" aria-hidden="true" /> Répartition
            </TabsTrigger>
            <TabsTrigger value="mail" className="flex items-center gap-2">
              <Mail className="h-4 w-4" aria-hidden="true" /> Messagerie
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-2">
              <FolderSync className="h-4 w-4" aria-hidden="true" /> Stockage
            </TabsTrigger>
            <TabsTrigger value="journal" className="flex items-center gap-2">
              <History className="h-4 w-4" aria-hidden="true" /> Journal
            </TabsTrigger>
          </TabsList>
          <TabsContent value="members" className="mt-6">
            <MembersTab members={overview.members} currentUserId={currentUserId} />
          </TabsContent>
          <TabsContent value="distribution" className="mt-6">
            <DistributionTab members={overview.members} assignments={overview.assignments} />
          </TabsContent>
          <TabsContent value="mail" className="mt-6">
            <MailTab smtp={overview.smtp} destinations={overview.destinations} />
          </TabsContent>
          <TabsContent value="storage" className="mt-6">
            <StorageTab hint={overview.sharedFolderHint} />
          </TabsContent>
          <TabsContent value="journal" className="mt-6">
            <JournalTab rows={journal} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
