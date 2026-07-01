import { LayoutDashboard, Upload, FileText, BookOpen, Settings, LogOut, FlaskConical } from 'lucide-react'
import { supabase } from './supabase'

const NAV = [
  { id: 'dashboard', label: 'Pannello',        icon: LayoutDashboard },
  { id: 'import',    label: 'Importa relazioni',icon: Upload },
  { id: 'nuova',     label: 'Nuova relazione',  icon: FileText },
  { id: 'archivio',  label: 'Archivio',         icon: BookOpen },
  { id: 'stile',     label: 'Profilo di stile', icon: Settings },
]

export default function Sidebar({ current, onNav, mockMode }) {
  async function handleLogout() {
    if (mockMode) return // nessuna sessione reale da chiudere
    await supabase.auth.signOut()
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>PsicoRelazioni</h1>
        <p>Strumento clinico</p>
      </div>

      {mockMode && (
        <div style={{
          margin: '10px 12px 0', padding: '7px 10px',
          background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 'var(--radius)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <FlaskConical size={13} color="#92400E" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#92400E', fontWeight: 500, lineHeight: 1.3 }}>
            Modalità demo — dati locali, non salvati
          </span>
        </div>
      )}

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigazione</div>

        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${current === id ? 'active' : ''}`}
            onClick={() => onNav(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
        <button className="nav-item" onClick={handleLogout} style={{ color: mockMode ? 'var(--text-muted)' : 'var(--danger)' }}>
          <LogOut size={16} />
          {mockMode ? 'Esci (disattivo in demo)' : 'Esci'}
        </button>
      </div>
    </aside>
  )
}
