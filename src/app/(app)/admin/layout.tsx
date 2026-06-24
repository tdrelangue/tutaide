import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import pkg from "../../../../package.json";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1">{children}</div>
      <footer className="px-6 py-3 border-t">
        <p className="text-xs text-muted-foreground text-right">
          Tutellia v{pkg.version}
        </p>
      </footer>
    </div>
  );
}
