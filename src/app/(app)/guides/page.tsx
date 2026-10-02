import { BookOpen, TriangleAlert, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GuideViewerDialog } from "./guide-viewer-dialog";

const guides = [
  {
    icon: BookOpen,
    title: "Guide de mise à jour v2.0.5",
    description:
      "Comment télécharger, installer et mettre à jour Tutellia sans perdre vos données, et comment utiliser la récupération de mot de passe.",
    file: "guide-mise-a-jour-v2.0.5.pdf",
  },
  {
    icon: TriangleAlert,
    title: "Que faire si une mise à jour échoue",
    description:
      "Guide de dépannage si Tutellia annonce une mise à jour qui ne s'installe pas correctement.",
    file: "guide-depannage-mise-a-jour.pdf",
  },
];

export default function GuidesPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <h2 className="text-xl font-semibold tracking-tight">Guides</h2>
        <p className="text-sm text-muted-foreground">
          Documentation et guides d&apos;utilisation de Tutellia.
        </p>
      </div>

      <div className="p-6 grid gap-4 max-w-2xl">
        {guides.map((guide) => (
          <Card key={guide.file}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
                  <guide.icon className="h-5 w-5 text-blue-700 dark:text-blue-300" aria-hidden="true" />
                </div>
                <CardTitle>{guide.title}</CardTitle>
              </div>
              <CardDescription>{guide.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <GuideViewerDialog title={guide.title} url={`/guides/${guide.file}`} />
              <Button variant="outline" asChild>
                <a href={`/guides/${guide.file}`} download>
                  <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                  Télécharger
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
