"use client";

import {
  ChevronDown,
  Folder,
  Layers,
  type LucideIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { startTransition, useState } from "react";
import * as actions from "@/app/actions";
import { JuniorMark } from "@/components/junior-mark";
import { IconButton, Input, useDismiss } from "@/components/ui";
import { LABEL_COLOR_KEYS, labelColor } from "@/lib/colors";
import { contextIcon } from "@/lib/context-icons";
import type { ClientBoard, ClientContext } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  boards: ClientBoard[];
  boardId: string;
  boardName: string;
  contexts: ClientContext[];
  /** null means "everything", matching the All Tasks row. */
  activeContextId: string | null;
  /** Card counts per context id, plus `all` and `none`. */
  counts: Record<string, number> & { all: number; none: number };
  onSelectContext: (contextId: string | null) => void;
  onRenameBoard: (name: string) => void;
  onCreateContext: (name: string, color: string) => void;
  onUpdateContext: (
    contextId: string,
    patch: { name?: string; color?: string },
  ) => void;
  onDeleteContext: (contextId: string) => void;
};

export function AppSidebar({
  boards,
  boardId,
  boardName,
  contexts,
  activeContextId,
  counts,
  onSelectContext,
  onRenameBoard,
  onCreateContext,
  onUpdateContext,
  onDeleteContext,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // New contexts continue round the palette rather than all arriving grey.
  const nextColor = LABEL_COLOR_KEYS[contexts.length % LABEL_COLOR_KEYS.length];

  const submitNew = () => {
    const name = draft.trim();
    if (name) onCreateContext(name, nextColor);
    setDraft("");
    setCreating(false);
  };

  return (
    <aside className="flex w-[var(--sidebar-width)] shrink-0 flex-col gap-0.5 px-3 py-3.5">
      <BoardMenu
        boards={boards}
        boardId={boardId}
        boardName={boardName}
        onRenameBoard={onRenameBoard}
      />

      <div className="mt-5 flex items-center justify-between pb-2.5 pl-2 pr-1">
        <span className="text-[11px] font-medium text-ink-faint">Contexts</span>
        <IconButton
          label="Add context"
          onClick={() => setCreating(true)}
          className="size-5"
        >
          <Plus className="size-3.5" />
        </IconButton>
      </div>

      <SidebarRow
        icon={Layers}
        label="All Tasks"
        count={counts.all}
        active={activeContextId === null}
        onClick={() => onSelectContext(null)}
      />

      {contexts.map((context) =>
        renamingId === context.id ? (
          <Input
            key={context.id}
            autoFocus
            defaultValue={context.name}
            onBlur={(e) => {
              const name = e.currentTarget.value.trim();
              if (name && name !== context.name) {
                onUpdateContext(context.id, { name });
              }
              setRenamingId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenamingId(null);
            }}
            className="h-8 text-[13px]"
          />
        ) : (
          <SidebarRow
            key={context.id}
            icon={contextIcon(context.name)}
            label={context.name}
            color={context.color}
            count={counts[context.id] ?? 0}
            active={activeContextId === context.id}
            onClick={() => onSelectContext(context.id)}
            onCycleColor={() => {
              const at = LABEL_COLOR_KEYS.indexOf(
                context.color as (typeof LABEL_COLOR_KEYS)[number],
              );
              const next =
                LABEL_COLOR_KEYS[(at + 1) % LABEL_COLOR_KEYS.length] ??
                LABEL_COLOR_KEYS[0];
              onUpdateContext(context.id, { color: next });
            }}
            onRename={() => setRenamingId(context.id)}
            onDelete={() => onDeleteContext(context.id)}
          />
        ),
      )}

      {counts.none > 0 && (
        <SidebarRow
          icon={Folder}
          label="No context"
          count={counts.none}
          active={activeContextId === "none"}
          onClick={() => onSelectContext("none")}
        />
      )}

      {creating && (
        <Input
          autoFocus
          value={draft}
          placeholder="Context name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submitNew}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitNew();
            if (e.key === "Escape") {
              setDraft("");
              setCreating(false);
            }
          }}
          className="h-8 text-[13px]"
        />
      )}
    </aside>
  );
}

function SidebarRow({
  icon: Icon,
  label,
  color,
  count,
  active,
  onClick,
  onCycleColor,
  onRename,
  onDelete,
}: {
  icon: LucideIcon;
  label: string;
  color?: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onCycleColor?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-lg pl-0.5 pr-1 transition-colors",
        active ? "bg-black/5" : "hover:bg-black/3",
      )}
    >
      {color ? (
        <button
          type="button"
          onClick={onCycleColor}
          aria-label={`Change ${label} colour`}
          title="Click to change colour"
          className="grid size-4 shrink-0 place-items-center"
        >
          <span
            className={cn(
              "size-1.5 rounded-full transition-transform hover:scale-150",
              labelColor(color).dot,
            )}
          />
        </button>
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}

      <span className="ml-1 grid size-5 shrink-0 place-items-center">
        <Icon
          className={cn(
            "size-4",
            !active
              ? "text-ink-faint"
              : color
                ? labelColor(color).text
                : "text-ink",
          )}
        />
      </span>

      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 truncate py-1.5 pl-1.5 text-left text-[13px]"
      >
        <span className={cn(active ? "font-medium text-ink" : "text-ink-soft")}>
          {label}
        </span>
      </button>

      <span className="grid min-w-5 shrink-0 place-items-center font-mono text-[11px] tabular-nums text-ink-ghost group-hover:hidden">
        {count || ""}
      </span>

      {(onRename || onDelete) && (
        <span className="hidden items-center group-hover:flex">
          {onRename && (
            <IconButton
              label={`Rename ${label}`}
              onClick={onRename}
              className="size-6"
            >
              <Pencil className="size-3" />
            </IconButton>
          )}
          {onDelete && (
            <IconButton
              label={`Delete ${label}`}
              onClick={() => {
                if (
                  confirm(
                    `Delete the "${label}" context? Its cards stay on the board.`,
                  )
                ) {
                  onDelete();
                }
              }}
              className="size-6 hover:text-rose-700"
            >
              <Trash2 className="size-3" />
            </IconButton>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The board name doubles as the board switcher — one row at the top rather than
 * a title up here and a duplicate picker pinned to the bottom.
 */
function BoardMenu({
  boards,
  boardId,
  boardName,
  onRenameBoard,
}: {
  boards: ClientBoard[];
  boardId: string;
  boardName: string;
  onRenameBoard: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const ref = useDismiss(open, () => setOpen(false));

  const createBoard = () => {
    const trimmed = name.trim();
    if (!trimmed) return setCreating(false);
    // `createBoard` redirects to the new board, so there's no local state here.
    startTransition(() => actions.createBoard(trimmed));
  };

  if (renaming) {
    return (
      <Input
        autoFocus
        defaultValue={boardName}
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (next && next !== boardName) onRenameBoard(next);
          setRenaming(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setRenaming(false);
        }}
        className="h-8 text-sm font-semibold"
      />
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-1 text-left transition-colors hover:bg-black/4"
      >
        <JuniorMark className="-mt-px size-4 shrink-0 text-ink" />
        {/* Not `flex-1`: the chevron should sit next to the name, not be pushed
            out to the far edge of the sidebar. */}
        <span className="min-w-0 truncate text-sm font-semibold text-ink">
          {boardName}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-faint" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-40 w-full animate-pop-in rounded-xl bg-panel-raised p-2 shadow-xl shadow-shade/15 ring-1 ring-hairline">
          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-faint">
            Boards
          </p>
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/board/${board.id}`}
              onClick={() => setOpen(false)}
              className={cn(
                "block truncate rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-black/5",
                board.id === boardId
                  ? "font-semibold text-accent-ink"
                  : "text-ink",
              )}
            >
              {board.name}
            </Link>
          ))}

          <div className="my-1 h-px bg-hairline" />

          {creating ? (
            <Input
              autoFocus
              value={name}
              placeholder="Board name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createBoard();
                if (e.key === "Escape") setCreating(false);
              }}
              className="h-7 text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition-colors hover:bg-black/5"
            >
              <Plus className="size-3.5" /> New board
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition-colors hover:bg-black/5"
          >
            <Pencil className="size-3.5" /> Rename board
          </button>

          {boards.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this board and everything on it?")) {
                  startTransition(() => actions.deleteBoard(boardId));
                }
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-rose-700 transition-colors hover:bg-rose-500/10"
            >
              <Trash2 className="size-3.5" /> Delete this board
            </button>
          )}
        </div>
      )}
    </div>
  );
}
