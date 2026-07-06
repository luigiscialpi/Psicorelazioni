import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle, FontSize } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { FontFamily } from './fontFamily'
import { EditorToolbar } from './EditorToolbar'
import { markdownToHtml, htmlToMarkdown, cleanMarkdown } from './editorPreset'

export type EditorMode = 'visual' | 'markdown'

export function RichTextEditor({
  markdown,
  onChange,
  readOnly,
}: {
  markdown: string
  onChange: (markdown: string) => void
  readOnly?: boolean
}) {
  const [mode, setMode] = useState<EditorMode>('visual')
  const [pendingExternalMd, setPendingExternalMd] = useState<string | null>(null)
  const [mdVersion, setMdVersion] = useState(0)
  const htmlRef = useRef<string>(markdownToHtml(markdown))
  const mdRef = useRef<string>(markdown)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      TextStyle,
      FontSize,
      FontFamily,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem,
      Placeholder.configure({ placeholder: 'Scrivi qui la bozza della relazione…' }),
    ],
    editable: !readOnly && mode === 'visual',
    onUpdate: ({ editor }) => {
      if (mode !== 'visual') return
      const html = editor.getHTML()
      htmlRef.current = html
      mdRef.current = cleanMarkdown(htmlToMarkdown(html))
      onChange(mdRef.current)
    },
    editorProps: {
      attributes: {
        class: 'rich-text-content',
      },
      transformPastedHTML(html) {
        htmlRef.current = html
        mdRef.current = cleanMarkdown(htmlToMarkdown(html))
        return html
      },
    },
  })

  // Inizializzo il contenuto quando arriva un nuovo markdown esterno
  useEffect(() => {
    if (mode !== 'visual') {
      setPendingExternalMd(markdown)
      return
    }
    const nextHtml = markdownToHtml(markdown)
    if (nextHtml === htmlRef.current) return
    if (editor && editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml)
      htmlRef.current = nextHtml
      mdRef.current = markdown
    }
  }, [markdown, mode, editor])

  const handleMarkdownChange = useCallback(
    (value: string) => {
      mdRef.current = value
      const nextHtml = markdownToHtml(value)
      htmlRef.current = nextHtml
      setMdVersion((v) => v + 1)
      if (editor && editor.isEditable && mode === 'visual') {
        editor.commands.setContent(nextHtml)
      }
      onChange(value)
    },
    [editor, mode, onChange]
  )

  const handleModeChange = useCallback((next: EditorMode) => {
    setMode(next)
  }, [])

  useEffect(() => {
    if (!editor) return
    if (mode === 'visual') {
      editor.setEditable(!readOnly)
      const html = htmlRef.current
      if (html && editor.getHTML() !== html) {
        editor.commands.setContent(html)
      }
      if (pendingExternalMd !== null) {
        const html2 = markdownToHtml(pendingExternalMd)
        editor.commands.setContent(html2)
        htmlRef.current = html2
        mdRef.current = pendingExternalMd
        setPendingExternalMd(null)
      }
    } else {
      editor.setEditable(false)
      htmlRef.current = editor.getHTML()
      const md = cleanMarkdown(htmlToMarkdown(editor.getHTML()))
      mdRef.current = md
      setPendingExternalMd(null)
      onChange(md)
    }
  }, [mode, editor, readOnly, onChange, pendingExternalMd])

  const mdValue = useMemo(() => {
    if (mode === 'visual' && editor && htmlRef.current) {
      const md = cleanMarkdown(htmlToMarkdown(editor.getHTML()))
      mdRef.current = md
      return md
    }
    return mdRef.current
  }, [mode, editor, mdVersion])

  return (
    <div className="rich-text-editor">
      <EditorToolbar editor={editor} mode={mode} onModeChange={handleModeChange} />
      {mode === 'visual' ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          className="rich-text-source"
          value={mdValue}
          onChange={(e) => handleMarkdownChange(e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
        />
      )}
    </div>
  )
}
