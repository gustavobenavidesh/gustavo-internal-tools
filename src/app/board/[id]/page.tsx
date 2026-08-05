import { notFound } from "next/navigation";
import { BoardView } from "@/components/board-view";
import { getBoardData, listBoards } from "@/db/queries";
import { getHistoryFact } from "@/lib/history-fact";
import { toClientBoardData } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = getBoardData(id);
  if (!data) notFound();

  const boards = listBoards().map((board) => ({
    id: board.id,
    name: board.name,
  }));

  // Fetched on the server so no key or request is exposed to the client, and so
  // a slow response can't hold up the board's own render path.
  const fact = await getHistoryFact();

  return (
    <BoardView data={toClientBoardData(data)} boards={boards} fact={fact} />
  );
}
