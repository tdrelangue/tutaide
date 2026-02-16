import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dossiers");
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tut&apos;aide</h1>
        <p className="mt-2 text-muted-foreground">
          Gestion des dossiers MJPM
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
