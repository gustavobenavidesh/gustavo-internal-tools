"use client";

import {
  ChevronDown,
  Folder,
  Layers,
  type LucideIcon,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  type CSSProperties, startTransition, useEffect, useRef, useState
} from "react";
import * as actions from "@/app/actions";
import { hourlyHistoryFact, nextHistoryFact } from "@/app/fact-action";
import { JuniorMark } from "@/components/junior-mark";
import { IconButton, Input, KBD, Plate, useDismiss } from "@/components/ui";
import { LABEL_COLOR_KEYS, labelColor } from "@/lib/colors";
import { contextIcon } from "@/lib/context-icons";
import type { HistoryFact } from "@/lib/history-fact";
import type { ClientBoard, ClientContext } from "@/lib/types";
import { cn, noOrphans } from "@/lib/utils";

type Props = {
  boards: ClientBoard[];
  boardId: string;
  boardName: string;
  contexts: ClientContext[];
  /** null means "everything", matching the All Tasks row. */
  activeContextId: string | null;
  /** Card counts per context id, plus `all` and `none`. */
  counts: Record<string, number> & { all: number; none: number };
  /** Null when the feed is unreachable — the section just doesn't render. */
  fact: HistoryFact | null;
  onSelectContext: (contextId: string | null) => void;
  onNewTask: () => void;
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
  fact,
  onSelectContext,
  onNewTask,
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
        orbColors={contexts.map((context) => context.color)}
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

      <div className="mt-auto space-y-[15px] pt-6">
        <button
          type="button"
          onClick={onNewTask}
          title="New task — press N, or ⌥N from a field"
          // Card-coloured on purpose: it's the thing that makes cards — but two
          // points tighter than one, since it's a control and shorter than any
          // card. Kept as an offset from the card radius rather than a number of
          // its own, so it still follows if that token moves. The two have to
          // agree: one clips the shape, the other rounds the box casting the
          // shadow.
          className="group relative isolate flex w-full items-center gap-2 rounded-[calc(var(--corner-card)_-_2px)] px-3 py-2.5 text-[13px] font-medium text-ink shadow-[0_5px_16px_-6px] shadow-shade/16 transition-all duration-100 ease-out hover:shadow-shade/24 active:scale-[0.98] active:shadow-none"
          style={
            { "--sq-radius": "calc(var(--corner-card) - 2px)" } as CSSProperties
          }
        >
          <Plate
            face="var(--color-panel-raised)"
            edge="var(--color-hairline)"
            surfaceClassName="transition-colors group-hover:[--sq-edge:var(--color-hairline-strong)]"
          />
          <Plus className="size-4 shrink-0 text-ink-faint" />
          New task
          <kbd className={cn(KBD, "ml-auto")}>N</kbd>
        </button>

        {fact && <FactOfTheDay fact={fact} />}
      </div>

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

/**
 * Wikipedia's "on this day", rotating hourly. Sits in the sidebar's bottom
 * group, which `mt-auto` pushes down however many contexts there are.
 */
function FactOfTheDay({ fact }: { fact: HistoryFact }) {
  // Seeded from the server's hourly pick, then swapped locally when you ask for
  // another. Re-syncs if the server sends a new one (a new hour, or a reload).
  const [current, setCurrent] = useState(fact);
  const [spinning, setSpinning] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // Track the content's natural height so the wrapper has a number to animate
  // between. Left undefined on the first paint, so there's no opening animation.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(el.getBoundingClientRect().height),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setCurrent(fact), [fact]);

  // Roll over on the hour whether or not the fact was shuffled by hand. Timed to
  // the next real hour boundary rather than every 60 minutes from mount, so the
  // change lands on the hour.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNextHour = () => {
      const msToNextHour = 3_600_000 - (Date.now() % 3_600_000);
      timer = setTimeout(async () => {
        const next = await hourlyHistoryFact();
        if (next) setCurrent(next);
        scheduleNextHour();
      }, msToNextHour + 1_000);
    };

    scheduleNextHour();
    return () => clearTimeout(timer);
  }, []);

  const regenerate = () => {
    setSpinning(true);
    startTransition(async () => {
      const next = await nextHistoryFact(current.text);
      if (next) setCurrent(next);
      setSpinning(false);
    });
  };

  return (
    <section>
      <div
        className="relative isolate rounded-[var(--corner-card)] px-3.5 py-3.5"
        style={{ "--sq-radius": "var(--corner-card)" } as CSSProperties}
      >
        {/* True black at low alpha, as it was before the plate — `--color-shade`
            is #232325, which at these alphas reads perceptibly lighter. A step up
            from the original 3%, since the smoothed corner gives the card less
            edge to hold it apart from the sidebar. */}
        {/* A token, not a black wash: black over a dark canvas is nothing, and
            this card went invisible in the dark theme. */}
        <Plate face="var(--color-tint-card)" />
        <p className="flex items-center gap-1.5 text-[10px] font-medium text-ink-faint">
          <ScrollText className="size-3" />
          Historic fact
          <IconButton
            label="Show another fact"
            onClick={regenerate}
            className="-my-1 ml-auto size-5"
          >
            <RefreshCw className={cn("size-3", spinning && "animate-spin")} />
          </IconButton>
        </p>

        {/* Height is measured and transitioned: CSS can't animate to `auto`, and
            facts differ enough in length that the box would otherwise jump. */}
        <div
          style={height === undefined ? undefined : { height }}
          className="overflow-hidden transition-[height] duration-300 ease-out"
        >
          {/* Padding, not a margin on the paragraph: a child's top margin
              collapses through this box and wouldn't be counted in the measured
              height, cropping the last line. */}
          <div ref={contentRef} className="pt-2">
            <p
              key={current.text}
              className="animate-fade-in font-serif text-[13px] leading-[1.45] tracking-normal text-ink-soft"
            >
              <span className="font-semibold text-ink">{current.year}</span> —{" "}
              {/* Bound to the word before it, so a fact can't end on a line holding
                  one word. Card titles have gone through this since they were
                  written; this is the longest run of prose in the app and the one
                  most likely to strand something, which is how it got missed. */}
              {noOrphans(current.text)}
            </p>

            <a
              href={current.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 block truncate text-[9px] text-ink-ghost transition-colors hover:text-accent"
              title={`${current.source} — Wikipedia`}
            >
              Source: {current.source}, Wikipedia
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Every context's colour as a ring of tiny dots — the "all" counterpart to a
 * single context's dot. Built from the palette's `dot` classes rather than a
 * conic gradient, since the palette is class-based and has no hex values to
 * feed a gradient. Six positions, so a longer context list samples the first
 * six rather than crowding.
 */
function ContextOrb({ colors }: { colors: string[] }) {
  const ring = colors.slice(0, 6);
  const radius = 3.2;

  return (
    <span aria-hidden className="relative block size-3.5">
      {ring.map((color, i) => {
        const angle = (i / ring.length) * 2 * Math.PI - Math.PI / 2;
        return (
          <span
            key={`${color}-${i}`}
            style={{
              left: `${50 + Math.cos(angle) * radius * (100 / 14)}%`,
              top: `${50 + Math.sin(angle) * radius * (100 / 14)}%`,
            }}
            className={cn(
              "absolute size-[2.5px] -translate-x-1/2 -translate-y-1/2 rounded-full",
              labelColor(color).dot,
            )}
          />
        );
      })}
    </span>
  );
}

function SidebarRow({
  icon: Icon,
  label,
  color,
  orbColors,
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
  /** Renders the all-contexts orb in place of a single colour dot. */
  orbColors?: string[];
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
        "group flex items-center rounded-lg px-[5px] transition-colors",
        active ? "bg-tint" : "hover:bg-tint-soft",
      )}
    >
      {orbColors ? (
        <span className="grid size-4 shrink-0 place-items-center">
          <ContextOrb colors={orbColors} />
        </span>
      ) : color ? (
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
              className="size-6 hover:text-danger"
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
        className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-1 text-left transition-colors hover:bg-tint-soft"
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
        <div
          className="absolute left-0 top-10 z-40 isolate w-full animate-pop-in rounded-[var(--corner-menu)] p-2 shadow-xl shadow-shade/15"
          style={{ "--sq-radius": "var(--corner-menu)" } as CSSProperties}
        >
          <Plate face="var(--color-panel-raised)" edge="var(--color-hairline)" />
          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-faint">
            Boards
          </p>
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/board/${board.id}`}
              onClick={() => setOpen(false)}
              className={cn(
                "block truncate rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-tint",
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
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition-colors hover:bg-tint"
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
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition-colors hover:bg-tint"
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
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-danger transition-colors hover:bg-danger-face"
            >
              <Trash2 className="size-3.5" /> Delete this board
            </button>
          )}
        </div>
      )}
    </div>
  );
}
