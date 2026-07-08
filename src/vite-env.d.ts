/// <reference types="vite/client" />

declare module '*.css'

declare module 'turndown' {
  type TurndownNode = {
    nodeName: string
    textContent: string | null
    getAttribute(name: string): string | null
  }
  type Filter = string | string[] | ((node: TurndownNode) => boolean)
  type Replacement = (content: string, node: TurndownNode, options: unknown) => string

  export default class TurndownService {
    constructor(options?: Record<string, unknown>)
    addRule(name: string, rule: { filter: Filter; replacement: Replacement }): void
    remove(filters: string[]): void
    turndown(input: Element | string): string
  }
}

declare module '../../node_modules/pandoc-wasm/src/core.js' {
  export function createPandocInstance(wasmBinary: ArrayBuffer): {
    convert(
      options: Record<string, unknown>,
      stdin?: string | null,
      files?: Record<string, Blob | File>,
    ): Promise<{
      stdout?: string
      files?: Record<string, string | Blob>
    }>
  }
}
