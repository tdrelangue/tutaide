import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tutellia</h1>
        <p className="mt-2 text-muted-foreground">Récupération du mot de passe</p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
