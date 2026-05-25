import { redirect } from "next/navigation";

export default async function BodyPage() {
  redirect("/app/profile");
}
