import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BILLING_PRICE_LABEL } from "@/lib/billing";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tutellia</h1>
        <p className="mt-2 text-muted-foreground">Gestion des dossiers MJPM</p>
      </div>
      <SignupForm priceLabel={BILLING_PRICE_LABEL} />
    </div>
  );
}
