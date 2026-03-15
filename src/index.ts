import type { CliRenderer, OptimizedBuffer } from "@opentui/core";
import type { BaseRenderable, Renderable } from "@opentui/core";
import type { KeyEvent } from "@opentui/core";
import { RGBA, parseColor, type ColorInput } from "@opentui/core";
import { EventEmitter } from "events";
import clipboard from "clipboardy";

export interface ZengrabContext {
  componentName: string;
  componentType: string;
  id: string;
  hierarchy: string[];
  raw: string;
  /** Extracted text content when available (CodeRenderable, TextRenderable, etc.) */
  content?: string;
}

export interface ZengrabOptions {
  /** Key combo to toggle zengrab on/off. Default: Ctrl+Alt+G */
  toggleShortcut?: { ctrl?: boolean; shift?: boolean; alt?: boolean; name: string };
  /** Start enabled. Default: true */
  enabled?: boolean;
  /** Border color for hover highlight. Default: #58A6FF */
  hoverBorderColor?: ColorInput;
  /** Called when context is copied. Receives the copied text. */
  onCopy?: (context: ZengrabContext, text: string) => void;
  /** Called when toggled. Receives new enabled state. */
  onToggle?: (enabled: boolean) => void;
}

export interface ZengrabInstance {
  enable: () => void;
  disable: () => void;
  toggle: () => boolean;
  destroy: () => void;
  readonly enabled: boolean;
  /** Add to onMouseDown of your root Box. Click any component to grab it. */
  captureHandler: (event: { target: Renderable | null }) => void;
  /** Add to onMouseMove of your root Box. Highlights the hovered element with a border. */
  hoverHandler: (event: { target: Renderable | null }) => void;
}

function getRenderableId(r: BaseRenderable): string {
  return r.id ?? `renderable-${(r as { num?: number }).num}`;
}

/** Compute screen bounds. Renderable.x and .y are already absolute (include parent + translate). */
function getScreenBounds(r: Renderable): { x: number; y: number; width: number; height: number } | null {
  if (r.isDestroyed) return null;
  const w = r.width;
  const h = r.height;
  if (w <= 0 || h <= 0) return null;
  return { x: Math.round(r.x), y: Math.round(r.y), width: w, height: h };
}

/**
 * Extract context from a renderable (works with any component, including non-focusable Text).
 */
export function grabContextFromRenderable(
  renderable: Renderable | BaseRenderable | null
): ZengrabContext | null {
  if (!renderable) return null;
  const r = renderable as Renderable;
  if (r.isDestroyed) return null;

  const componentType = renderable.constructor.name;
  const id = getRenderableId(renderable);
  const hierarchy: string[] = [];

  let current: BaseRenderable | null = renderable;
  while (current?.parent) {
    const p: BaseRenderable = current.parent;
    const name = p.constructor.name;
    if (name !== "RootRenderable") {
      hierarchy.unshift(`${name}#${getRenderableId(p)}`);
    }
    current = p;
  }

  const componentName = hierarchy[hierarchy.length - 1] ?? componentType;
  const raw = [
    `[${componentType}]`,
    id ? `id="${id}"` : "",
    hierarchy.length ? `in ${hierarchy.join(" > ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = extractContent(renderable);

  return {
    componentName,
    componentType,
    id,
    hierarchy,
    raw,
    ...(content && { content }),
  };
}

function extractContent(r: BaseRenderable): string | undefined {
  const anyR = r as unknown as Record<string, unknown>;
  if (typeof anyR.plainText === "string" && anyR.plainText) return anyR.plainText;
  const c = anyR.content;
  if (typeof c === "string" && c) return c;
  if (c && typeof (c as { plain?: string }).plain === "string")
    return (c as { plain: string }).plain;
  return undefined;
}

/**
 * Extract context from the focused renderable, or from a specific renderable if provided.
 */
export function grabContext(
  renderer: CliRenderer,
  renderable?: Renderable | null
): ZengrabContext | null {
  const target = renderable ?? renderer.currentFocusedRenderable;
  return grabContextFromRenderable(target);
}

/**
 * Copy renderable context to clipboard.
 */
export async function grabAndCopy(
  renderer: CliRenderer,
  renderable?: Renderable | null
): Promise<boolean> {
  const context = grabContext(renderer, renderable);
  if (!context) return false;

  const parts = [
    context.raw,
    context.hierarchy.length ? `// in ${context.hierarchy.join(" > ")}` : "",
  ].filter(Boolean);
  if (context.content) parts.push("", context.content);
  const text = parts.join("\n");

  try {
    await clipboard.write(text);
    return true;
  } catch {
    return false;
  }
}

function matchShortcut(
  event: KeyEvent,
  shortcut: { ctrl?: boolean; shift?: boolean; alt?: boolean; name: string }
): boolean {
  const ctrlMatch = shortcut.ctrl == null || shortcut.ctrl === !!event.ctrl;
  const shiftMatch = shortcut.shift == null || shortcut.shift === !!event.shift;
  const altMatch = shortcut.alt == null || shortcut.alt === !!event.option;
  const nameMatch = event.name === shortcut.name;
  return ctrlMatch && shiftMatch && altMatch && nameMatch;
}

/**
 * Initialize zengrab: listen for shortcut and copy focused context on trigger.
 * Returns an instance with enable/disable/toggle controls.
 */
export function initZengrab(
  renderer: CliRenderer,
  options: ZengrabOptions = {}
): ZengrabInstance {
  const {
    toggleShortcut = { ctrl: true, alt: true, name: "g" },
    enabled: initialEnabled = true,
    hoverBorderColor = "#58A6FF",
    onCopy,
    onToggle,
  } = options;

  let enabled = initialEnabled;
  let hoveredRenderable: Renderable | null = null;
  const borderColor = parseColor(hoverBorderColor);

  const transparent = RGBA.fromValues(0, 0, 0, 0);
  const CONTAINER_TYPES = new Set([
    "ScrollBoxRenderable",
    "ContentRenderable",
    "RootRenderable",
  ]);
  const drawHoverBorder = (buffer: OptimizedBuffer, _deltaTime: number) => {
    if (!enabled || !hoveredRenderable) return;
    const typeName = hoveredRenderable.constructor.name;
    if (CONTAINER_TYPES.has(typeName)) return;
    const bounds = getScreenBounds(hoveredRenderable);
    if (!bounds) return;
    if (bounds.width >= renderer.width - 1 && bounds.height >= renderer.height - 1) return;
    buffer.drawBox({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      border: true,
      borderStyle: "single",
      borderColor,
      backgroundColor: transparent,
      shouldFill: false,
    });
  };

  renderer.addPostProcessFn(drawHoverBorder);

  const doGrab = (target: Renderable | null) => {
    if (!target) return;
    const context = grabContextFromRenderable(target);
    if (!context) return;

    const parts = [
      context.raw,
      context.hierarchy.length ? `// in ${context.hierarchy.join(" > ")}` : "",
    ].filter(Boolean);
    if (context.content) parts.push("", context.content);
    const text = parts.join("\n");

    clipboard.write(text).then(
      () => onCopy?.(context, text),
      () => {}
    );
  };

  const toggleHandler = (event: KeyEvent) => {
    if (!matchShortcut(event, toggleShortcut)) return;
    enabled = !enabled;
    onToggle?.(enabled);
  };

  const keyInput = renderer.keyInput as unknown as EventEmitter;
  keyInput.on("keypress", toggleHandler);

  const hoverHandler = (event: { target: Renderable | null }) => {
    const target = enabled ? event.target ?? null : null;
    if (target !== hoveredRenderable) {
      hoveredRenderable = target;
      renderer.root.requestRender();
    }
  };

  const instance: ZengrabInstance = {
    get enabled() {
      return enabled;
    },
    captureHandler: (event) => {
      if (!enabled || !event.target) return;
      doGrab(event.target);
    },
    hoverHandler,
    enable: () => {
      enabled = true;
      onToggle?.(true);
      renderer.root.requestRender();
    },
    disable: () => {
      enabled = false;
      hoveredRenderable = null;
      onToggle?.(false);
      renderer.root.requestRender();
    },
    toggle: () => {
      enabled = !enabled;
      if (!enabled) hoveredRenderable = null;
      onToggle?.(enabled);
      renderer.root.requestRender();
      return enabled;
    },
    destroy: () => {
      keyInput.off("keypress", toggleHandler);
      renderer.removePostProcessFn(drawHoverBorder);
    },
  };

  return instance;
}
