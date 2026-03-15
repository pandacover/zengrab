import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  InputRenderable,
  ScrollBoxRenderable,
} from "@opentui/core"
import { initZengrab } from "zengrab"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
})

// Japanese minimalist + dark theme: ma, kanso, fukinsei
// Palette: dark warm greys, muted text, soft accent (pale oak)
const bg = "#1a1a18"
const bgAlt = "#252520"
const textMuted = "#a8a6a1"
const accent = "#8b7355"

const zengrab = initZengrab(renderer, {
  hoverBorderColor: accent,
})

const root = new BoxRenderable(renderer, {
  id: "chat-root",
  width: renderer.width,
  height: renderer.height,
  flexDirection: "column",
  backgroundColor: bg,
  padding: 2,
})
root.onMouseDown = (e) => zengrab.captureHandler(e)
root.onMouseMove = (e) => zengrab.hoverHandler(e)

const header = new BoxRenderable(renderer, {
  id: "header",
  width: "100%",
  height: 2,
  flexShrink: 0,
  border: false,
  backgroundColor: bgAlt,
  padding: 1,
})
const headerText = new TextRenderable(renderer, {
  id: "header-title",
  content: "Agent Chat",
  fg: textMuted,
})
header.add(headerText)
root.add(header)

const scrollbox = new ScrollBoxRenderable(renderer, {
  id: "messages",
  width: "100%",
  flexGrow: 1,
  rootOptions: { backgroundColor: bg },
})
root.add(scrollbox)

const placeholderMessages = [
  { role: "user", text: "Hello, what can you help me with?" },
  {
    role: "agent",
    text: "I can help you test the zengrab library! Click any component to grab its context.",
  },
  { role: "user", text: "Sounds good." },
]

for (let i = 0; i < placeholderMessages.length; i++) {
  const m = placeholderMessages[i]
  const bubble = new BoxRenderable(renderer, {
    id: `msg-${m.role}-${i}`,
    width: "100%",
    padding: 2,
    marginBottom: 2,
    backgroundColor: m.role === "user" ? bgAlt : "#2a2725",
    border: false,
  })
  const text = new TextRenderable(renderer, {
    id: `msg-text-${i}`,
    content: m.text,
    fg: textMuted,
  })
  bubble.add(text)
  scrollbox.add(bubble)
}

const inputArea = new BoxRenderable(renderer, {
  id: "input-area",
  width: "100%",
  padding: 2,
  flexShrink: 0,
  border: false,
  backgroundColor: bgAlt,
})
const input = new InputRenderable(renderer, {
  id: "chat-input",
  width: renderer.width - 8,
  placeholder: "Type a message... (UI only, no logic)",
  backgroundColor: bg,
  focusedBackgroundColor: bgAlt,
  textColor: textMuted,
  cursorColor: accent,
})
inputArea.add(input)
root.add(inputArea)

renderer.root.add(root)
input.focus()
