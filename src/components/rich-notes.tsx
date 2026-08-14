"use client";

import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  type LucideIcon,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * `document.execCommand` is deprecated and implemented everywhere, including
 * Safari, and it is the only way to get real formatting out of a
 * `contenteditable` without a rich-text framework. The alternative is a
 * ProseMirror-class dependency, which this board isn't big enough to earn.
 *
 * `createLink` needs a url, and `formatBlock` a tag name, so `value` supplies one
 * — returning undefined cancels the command, which is what a dismissed prompt
 * does.
 */
type Tool = {
  icon: LucideIcon;
  label: string;
  command: string;
  value?: () => string | undefined;
  /** Off for commands that aren't a state you're in, like inserting a link. */
  stateless?: boolean;
  /** The shortcut the browser already handles, named here for the tooltip. */
  key?: string;
};

const TOOLS: Tool[] = [
  { icon: Bold, label: "Bold", command: "bold", key: "B" },
  { icon: Italic, label: "Italic", command: "italic", key: "I" },
  { icon: Strikethrough, label: "Strikethrough", command: "strikeThrough" },
  { icon: List, label: "Bulleted list", command: "insertUnorderedList" },
  { icon: ListOrdered, label: "Numbered list", command: "insertOrderedList" },
  {
    icon: Quote,
    label: "Quote",
    command: "formatBlock",
    value: () => "blockquote",
  },
  {
    icon: Link2,
    label: "Link",
    command: "createLink",
    stateless: true,
    value: () => window.prompt("Link to") || undefined,
  },
];

/**
 * The notes editor: a `contenteditable` that renders what it stores.
 *
 * React must not own this subtree — it would rewrite the DOM the caret lives in
 * on every keystroke — so the value is written in by hand and read back out on
 * input. Which is also why the incoming value is only assigned when it differs
 * from what's already there: assigning unconditionally would reset the selection
 * on every render.
 *
 * HTML goes into the same text column plain notes always used. Old notes still
 * read correctly because `pre-wrap` keeps their newlines, and nothing needed
 * migrating. Board search strips the tags before matching — see `plainText`.
 *
 * Paste arrives as plain text, deliberately. It keeps a page you copied from out
 * of the field, and means the only HTML ever stored is what the commands above
 * produce — so there's nothing here that needs sanitising.
 */
export function RichNotes({
  value,
  onChange,
  onSave,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  onSave: () => void;
  placeholder: string;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string[]>([]);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const el = editor.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value;
    setEmpty(!el.textContent?.trim());
  }, [value]);

  // Tags rather than inline styles, so the stored markup stays legible and the
  // content styles in `globals.css` can reach it.
  useEffect(() => {
    document.execCommand("styleWithCSS", false, "false");
  }, []);

  const readState = useCallback(() => {
    const el = editor.current;
    if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return;
    setActive(
      TOOLS.filter((tool) => {
        if (tool.stateless) return false;
        if (tool.command === "formatBlock") {
          return document.queryCommandValue("formatBlock") === "blockquote";
        }
        return document.queryCommandState(tool.command);
      }).map((tool) => tool.command),
    );
  }, []);

  // Which buttons are lit follows the caret, not just what was typed.
  useEffect(() => {
    document.addEventListener("selectionchange", readState);
    return () => document.removeEventListener("selectionchange", readState);
  }, [readState]);

  const sync = () => {
    const el = editor.current;
    if (!el) return;
    const text = el.textContent?.trim() ?? "";
    setEmpty(!text);
    // An emptied editor is left holding a stray `<br>`. Storing nothing instead
    // keeps the card's "has notes" mark and the search agreeing that it's empty.
    onChange(text ? el.innerHTML : "");
  };

  const run = (tool: Tool) => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    const argument = tool.value?.();
    if (tool.value && argument === undefined) return;
    document.execCommand(tool.command, false, argument);
    sync();
    readState();
  };

  return (
    <div>
      {/* Four less than the text's padding on both axes, because each button
          insets its own 12px icon inside a 20px box — the gap between them sits
          inside that, so the first glyph still lines up with the text below. */}
      <div className="flex items-center gap-1 px-3.5 pt-3.5">
        {TOOLS.map((tool) => (
          <IconButton
            key={tool.label}
            label={tool.key ? `${tool.label} (⌘${tool.key})` : tool.label}
            // The editor loses focus to a press otherwise, and with it the
            // selection the command is about to act on.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(tool)}
            // Selected is an opaque fill and a near-black glyph, not a wash of
            // accent: a translucent tint over the white field read as a blurred
            // patch, and most of what makes this legible is the icon going from
            // ghost to ink rather than the fill behind it.
            className={cn(
              "size-5",
              active.includes(tool.command)
                ? "bg-panel text-ink"
                : "text-ink-ghost",
            )}
          >
            <tool.icon className="size-3" />
          </IconButton>
        ))}
      </div>

      <div className="relative">
        {empty && (
          <span className="pointer-events-none absolute left-4.5 top-4 text-sm text-ink-ghost">
            {placeholder}
          </span>
        )}
        <div
          ref={editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Notes"
          onInput={sync}
          onBlur={sync}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSave();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            document.execCommand(
              "insertText",
              false,
              e.clipboardData.getData("text/plain"),
            );
            sync();
          }}
          className="rich-text min-h-[8.5rem] px-4.5 pb-4.5 pt-4 text-sm leading-relaxed text-ink outline-none"
        />
      </div>
    </div>
  );
}
