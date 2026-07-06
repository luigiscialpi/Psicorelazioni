import { Mark } from '@tiptap/core'

export const FontFamily = Mark.create({
  name: 'fontFamily',

  addOptions() {
    return {
      types: ['textStyle'],
    }
  },

  addAttributes() {
    return {
      family: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontFamily.replace(/['"]/g, ''),
        renderHTML: (attributes: Record<string, string>) => {
          if (!attributes.family) return {}
          return {
            style: `font-family: ${attributes.family}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        style: 'font-family',
        consume: (node: HTMLElement) => {
          const family = node.style.fontFamily.replace(/['"]/g, '')
          if (family) return { family }
          return null
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ['span', { style: `font-family: ${HTMLAttributes.family}` }, 0]
  },

  addCommands() {
    return {
      setFontFamily: (family: string) => ({ commands }: { commands: any }) => {
        return commands.setMark(this.name, { family })
      },
      unsetFontFamily: () => ({ commands }: { commands: any }) => {
        return commands.unsetMark(this.name)
      },
    }
  },
})
