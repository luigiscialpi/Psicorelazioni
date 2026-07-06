import type { Editor } from '@tiptap/react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, CheckSquare, Italic, List, ListOrdered, Quote, Redo, Strikethrough, Table, Type, Underline, Undo } from 'lucide-react'

const FONTS = [
  { label: 'Inter (default)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Calibri', value: 'Calibri, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
]

const FONT_SIZES = [
  { label: 'Piccolo', value: '12px' },
  { label: 'Normale', value: '13.5px' },
  { label: 'Medio', value: '15px' },
  { label: 'Grande', value: '18px' },
  { label: 'Titolo', value: '22px' },
]

const TEXT_COLORS = [
  { label: 'Default', value: '#1A1A18' },
  { label: 'Accento', value: '#3D5C52' },
  { label: 'Rosso', value: '#C0392B' },
  { label: 'Blu', value: '#2563EB' },
  { label: 'Verde', value: '#16A34A' },
  { label: 'Grigio', value: '#6B7280' },
]

const HIGHLIGHT_COLORS = [
  { label: 'Nessuno', value: 'transparent' },
  { label: 'Giallo', value: '#FDE68A' },
  { label: 'Verde', value: '#BBF7D0' },
  { label: 'Blu', value: '#BFDBFE' },
  { label: 'Rosa', value: '#FBCFE8' },
  { label: 'Arancione', value: '#FED7AA' },
]

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`toolbar-btn ${isActive ? 'is-active' : ''}`}
    >
      {children}
    </button>
  )
}

function ToolbarSelect({
  value,
  onChange,
  options,
  title,
  width = 110,
}: {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  title: string
  width?: number
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={title}
      className="toolbar-select"
      style={{ width }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function ToolbarColorPicker({
  value,
  onChange,
  options,
  title,
  icon,
}: {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string; color?: string }[]
  title: string
  icon?: React.ReactNode
}) {
  return (
    <div className="toolbar-color-picker" title={title}>
      {icon && <span className="toolbar-color-icon">{icon}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        className="toolbar-color-swatch"
        style={{ backgroundColor: value || 'transparent' }}
        aria-hidden
      />
    </div>
  )
}

export function EditorToolbar({ editor, mode, onModeChange }: { editor: Editor | null; mode: 'visual' | 'markdown'; onModeChange: (mode: 'visual' | 'markdown') => void }) {
  if (!editor) return null

  const setFontFamily = (family: string) => editor.chain().focus().setFontFamily(family).run()
  const setFontSize = (size: string) => {
    editor.chain().focus().setMark('textStyle', { fontSize: size }).run()
  }
  const setTextColor = (color: string) => editor.chain().focus().setColor(color).run()
  const setHighlight = (color: string) => {
    if (color === 'transparent') {
      editor.chain().focus().unsetHighlight().run()
    } else {
      editor.chain().focus().setHighlight({ color }).run()
    }
  }
  const currentFont = editor.getAttributes('fontFamily').family || FONTS[0].value
  const currentColor = editor.getAttributes('textStyle').color || TEXT_COLORS[0].value
  const currentHighlight = editor.getAttributes('highlight').color || HIGHLIGHT_COLORS[0].value

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="editor-toolbar">
      <div className="toolbar-group toolbar-group-history">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Annulla">
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Ripeti">
          <Redo size={15} />
        </ToolbarButton>
      </div>

      {mode === 'visual' && (
        <>
          <div className="toolbar-divider" />

          <div className="toolbar-group toolbar-group-font">
            <ToolbarSelect value={currentFont} onChange={setFontFamily} options={FONTS} title="Font" width={120} />
            <ToolbarSelect value={editor.getAttributes('textStyle').fontSize || FONT_SIZES[1].value} onChange={setFontSize} options={FONT_SIZES} title="Dimensione" width={90} />
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group toolbar-group-text">
            <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Grassetto">
              <Bold size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Corsivo">
              <Italic size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Sottolineato">
              <Underline size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Barrato">
              <Strikethrough size={15} />
            </ToolbarButton>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group toolbar-group-headings">
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="Titolo H1">
              <span className="toolbar-heading" data-level="1">H1</span>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Titolo H2">
              <span className="toolbar-heading" data-level="2">H2</span>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Titolo H3">
              <span className="toolbar-heading" data-level="3">H3</span>
            </ToolbarButton>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group toolbar-group-lists">
            <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Elenco puntato">
              <List size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Elenco numerato">
              <ListOrdered size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} title="Checklist">
              <CheckSquare size={15} />
            </ToolbarButton>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group toolbar-group-block">
            <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Citazione">
              <Quote size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={insertTable} title="Inserisci tabella">
              <Table size={15} />
            </ToolbarButton>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group toolbar-group-align">
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Allinea a sinistra">
              <AlignLeft size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Allinea al centro">
              <AlignCenter size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Allinea a destra">
              <AlignRight size={15} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Giustifica">
              <AlignJustify size={15} />
            </ToolbarButton>
          </div>

          <div className="toolbar-divider" />

          <div className="toolbar-group toolbar-group-color">
            <ToolbarColorPicker value={currentColor} onChange={setTextColor} options={TEXT_COLORS} title="Colore testo" icon={<Type size={15} />} />
            <ToolbarColorPicker value={currentHighlight} onChange={setHighlight} options={HIGHLIGHT_COLORS} title="Evidenziatore" icon={<span className="toolbar-highlight-icon" />} />
          </div>
        </>
      )}

      <div style={{ marginLeft: 'auto' }} />
      <button
        type="button"
        className={`mode-toggle ${mode === 'visual' ? 'is-active' : ''}`}
        onClick={() => onModeChange(mode === 'visual' ? 'markdown' : 'visual')}
        title={mode === 'visual' ? 'Passa a Markdown' : 'Passa a Visuale'}
      >
        {mode === 'visual' ? 'Markdown' : 'Visuale'}
      </button>
    </div>
  )
}
