import { redirect } from "next/navigation";
import { getCurrentUser } from "@/src/modules/auth/auth.service";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
