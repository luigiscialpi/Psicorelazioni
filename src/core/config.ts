export const USE_MOCK = !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL.includes('YOUR_PROJECT')

export const uid = () => Math.random().toString(36).slice(2, 10)
