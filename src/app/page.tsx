import { redirect } from "next/navigation";
import { ensureDefaultBoard } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  // First visit creates a starter board so there's never an empty shell.
  const board = ensureDefaultBoard();
  redirect(`/board/${board.id}`);
}
