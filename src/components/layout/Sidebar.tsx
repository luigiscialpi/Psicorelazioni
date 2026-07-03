import { LayoutDashboard, Upload, FileText, Clock, BookOpen, Settings, UserRound, LogOut, FlaskConical } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from '../../core/supabase'

const NAV = [
  { id: 'dashboard', path: '/dashboard', label: 'Pannello', icon: LayoutDashboard },
  { id: 'import', path: '/import', label: 'Importa relazioni', icon: Upload },
  { id: 'nuova', path: '/nuova', label: 'Nuova relazione', icon: FileText },
  { id: 'bozza', path: '/bozza', label: 'Bozze in corso', icon: Clock },
  { id: 'archivio', path: '/archivio', label: 'Archivio', icon: BookOpen },
  { id: 'gestione-test', path: '/gestione-test', label: 'Gestione test', icon: Settings },
  { id: 'stile', path: '/stile', label: 'Profilo di stile', icon: Settings },
  { id: 'professionista', path: '/professionista', label: 'Scheda professionista', icon: UserRound },
]

export default function Sidebar({ mockMode }) {
  const location = useLocation()

  function isNavItemActive(path) {
    if (path === '/bozza') return location.pathname === '/bozza' || location.pathname.startsWith('/bozza/')
    return location.pathname === path
  }

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

        {NAV.map(({ id, path, label, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            className={`nav-item ${isNavItemActive(path) ? 'active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </NavLink>
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
