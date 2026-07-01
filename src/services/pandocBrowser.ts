import { createPandocInstance } from '../../node_modules/pandoc-wasm/src/core.js'

const pandocWasmUrl = new URL('../../node_modules/pandoc-wasm/src/pandoc.wasm', import.meta.url).href

type PandocInstance = {
  convert(
    options: Record<string, unknown>,
    stdin?: string | null,
    files?: Record<string, Blob | File>,
  ): Promise<{
    stdout?: string
    files?: Record<string, string | Blob>
  }>
}

let pandocInstancePromise: Promise<PandocInstance> | null = null

async function getPandocInstance(): Promise<PandocInstance> {
  if (!pandocInstancePromise) {
    pandocInstancePromise = (async () => {
      const response = await fetch(pandocWasmUrl)
      if (!response.ok) {
        throw new Error(`Download pandoc.wasm fallito: HTTP ${response.status}`)
      }
      const wasmBinary = await response.arrayBuffer()
      return createPandocInstance(wasmBinary)
    })()
  }

  return pandocInstancePromise
}

export async function convertWithPandoc(
  options: Record<string, unknown>,
  stdin: string | null,
  files: Record<string, Blob | File>,
) {
  const pandocInstance = await getPandocInstance()
  return pandocInstance.convert(options, stdin ?? null, files ?? {})
}
