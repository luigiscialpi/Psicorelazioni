import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

// ── Markdown → HTML (per inizializzare Tiptap) ─────────────
marked.setOptions({
  gfm: true,
  breaks: false,
})

export function markdownToHtml(md: string): string {
  if (!md) return ''
  return marked.parse(md) as string
}

// ── HTML → Markdown (per sincronizzare Tiptap → state) ────
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
})

;(turndown as any).use(gfm)

turndown.addRule('strikethrough', {
  filter: ['del', 's', 'strike'] as any,
  replacement: (content: string) => `~~${content}~~`,
})

// Preserva span con stile inline usato da Tiptap (colore, font, etc.)
turndown.addRule('inlineStyles', {
  filter: 'span[style]' as any,
  replacement: (_content: string, node: any) => {
    const el = node as HTMLElement
    const style = el.getAttribute('style') || ''
    if (!style || !/(font-family|font-size|color|text-align|background-color)/i.test(style)) {
      return _content
    }
    return `<span style="${style}">${el.innerHTML}</span>`
  },
})

export function htmlToMarkdown(html: string): string {
  if (!html) return ''
  return turndown.turndown(html)
}

export function cleanMarkdown(raw: string): string {
  return raw
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<div>\s*<\/div>/g, '')
    .trim()
}
