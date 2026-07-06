import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
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
  const [localMarkdown, setLocalMarkdown] = useState<string>(markdown)
  const [isRealReady, setIsRealReady] = useState(false)

  const htmlRef = useRef<string>(markdownToHtml(markdown))
  const mdRef = useRef<string>(markdown)
  const modeRef = useRef<EditorMode>(mode)
  const onChangeRef = useRef(onChange)
  const readOnlyRef = useRef(readOnly)

  onChangeRef.current = onChange
  readOnlyRef.current = readOnly
  modeRef.current = mode

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      TextStyle,
      FontSize,
      FontFamily,
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
    content: markdownToHtml(markdown), 
    editable: !readOnly, 
    onUpdate: ({ editor }) => {
      if (modeRef.current !== 'visual') return
      const html = editor.getHTML()
      htmlRef.current = html
      const md = cleanMarkdown(htmlToMarkdown(html))
      mdRef.current = md
      setLocalMarkdown(md)
      onChangeRef.current(md)
    },
    editorProps: {
      attributes: {
        class: 'rich-text-content',
      },
      transformPastedHTML(html) {
        htmlRef.current = html
        const md = cleanMarkdown(htmlToMarkdown(html))
        mdRef.current = md
        setLocalMarkdown(md)
        return html
      },
    },
  })

  // Sincronizzazione dello stato pronto dopo il mount di Tiptap
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      setIsRealReady(true)
    }
    return () => {
      setIsRealReady(false)
    }
  }, [editor])

  // 1. Sincronizza i cambiamenti esterni (es. caricamento da DB o reset del form)
  useEffect(() => {
    // 🌟 IL FIX CRUCIALE: Se il markdown in arrivo coincide con quello che abbiamo appena digitato,
    // ci fermiamo subito. Questo evita il ciclo infinito e il salto del cursore.
    if (markdown === mdRef.current) return

    setLocalMarkdown(markdown)
    if (!isRealReady || !editor) return
    if (mode !== 'visual') {
      setPendingExternalMd(markdown)
      return
    }
    
    const nextHtml = markdownToHtml(markdown)
    if (editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml)
      htmlRef.current = nextHtml
      mdRef.current = markdown
    }
  }, [markdown, mode, editor, isRealReady])

  // 2. Cambio modalità visiva (Visual <-> Markdown)
  useEffect(() => {
    if (!isRealReady || !editor) return
    
    if (mode === 'visual') {
      editor.setEditable(!readOnlyRef.current)
      
      if (pendingExternalMd !== null) {
        const html2 = markdownToHtml(pendingExternalMd)
        editor.commands.setContent(html2)
        htmlRef.current = html2
        mdRef.current = pendingExternalMd
        setLocalMarkdown(pendingExternalMd)
        setPendingExternalMd(null)
      } else {
        const html = htmlRef.current
        if (html && editor.getHTML() !== html) {
          editor.commands.setContent(html)
        }
      }
    } else {
      editor.setEditable(false)
      setPendingExternalMd(null)
    }
  }, [mode, editor, isRealReady, pendingExternalMd])

  // 3. Sincronizzazione della prop readOnly
  useEffect(() => {
    if (!isRealReady || !editor) return
    if (mode === 'visual') {
      editor.setEditable(!readOnly)
    }
  }, [readOnly, mode, editor, isRealReady])

  // Gestione dell'input manuale nella textarea (modalità codice)
  const handleMarkdownChange = useCallback(
    (value: string) => {
      mdRef.current = value
      setLocalMarkdown(value)
      const nextHtml = markdownToHtml(value)
      htmlRef.current = nextHtml
      
      if (isRealReady && editor && editor.isEditable && modeRef.current === 'visual') {
        editor.commands.setContent(nextHtml)
      }
      onChangeRef.current(value)
    },
    [editor, isRealReady]
  )

  const handleModeChange = useCallback((next: EditorMode) => {
    setMode(next)
  }, [])

  return (
    <div className="rich-text-editor">
      <EditorToolbar 
        editor={isRealReady ? editor : null} 
        editorReady={isRealReady} 
        mode={mode} 
        onModeChange={handleModeChange} 
      />
      {mode === 'visual' ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          className="rich-text-source"
          value={localMarkdown}
          onChange={(e) => handleMarkdownChange(e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
        />
      )}
    </div>
  )
}

export default RichTextEditor