import { Construction } from 'lucide-react'

// Nessuna pagina resta più in sospeso strutturalmente — questo componente
// è mantenuto solo come fallback generico per eventuali route future
// non ancora implementate.

export default function PlaceholderPage({ page }) {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">{page}</div>
        </div>
      </div>
      <div className="page-body">
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Construction size={36} color="var(--accent)" style={{ margin: '0 auto 14px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>Sezione non ancora implementata.</p>
        </div>
      </div>
    </>
  )
}
