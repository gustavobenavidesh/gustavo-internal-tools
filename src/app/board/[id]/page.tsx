import { notFound } from "next/navigation";
import { BoardView } from "@/components/board-view";
import { getBoardData, listBoards } from "@/db/queries";
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

  return <BoardView data={toClientBoardData(data)} boards={boards} />;
}
