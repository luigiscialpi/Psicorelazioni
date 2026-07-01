import { createPandocInstance } from '../node_modules/pandoc-wasm/src/core.js'

const pandocWasmUrl = new URL('../node_modules/pandoc-wasm/src/pandoc.wasm', import.meta.url).href

let pandocInstancePromise = null

async function getPandocInstance() {
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

export async function convertWithPandoc(options, stdin, files) {
  const pandocInstance = await getPandocInstance()
  return pandocInstance.convert(options, stdin ?? null, files ?? {})
}
