import { readFileSync } from "fs"
import { join } from "path"
import {
  createCliRenderer,
  MarkdownRenderable,
  SyntaxStyle,
  RGBA,
  ScrollBoxRenderable,
} from "@opentui/core"
import { initZengrab } from "zengrab"

const staticMarkdown = readFileSync(
  join(import.meta.dir, "../llm.txt"),
  "utf-8"
)

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
})
const zengrab = initZengrab(renderer)

const syntaxStyle = SyntaxStyle.fromStyles({
  "markup.heading.1": { fg: RGBA.fromHex("#58A6FF"), bold: true },
  "markup.heading.2": { fg: RGBA.fromHex("#79C0FF"), bold: true },
  "markup.list": { fg: RGBA.fromHex("#FF7B72") },
  "markup.raw": { fg: RGBA.fromHex("#A5D6FF") },
  "markup.raw.block": { fg: RGBA.fromHex("#A5D6FF") },
  default: { fg: RGBA.fromHex("#E6EDF3") },
})

const markdown = new MarkdownRenderable(renderer, {
  id: "content",
  width: renderer.width - 2,
  content: staticMarkdown.trim(),
  syntaxStyle,
  conceal: true,
})

const scrollbox = new ScrollBoxRenderable(renderer, {
  id: "scroll",
  width: renderer.width,
  height: renderer.height,
})
scrollbox.onMouseDown = (e) => zengrab.captureHandler(e)
scrollbox.onMouseMove = (e) => zengrab.hoverHandler(e)

scrollbox.add(markdown)
renderer.root.add(scrollbox)
