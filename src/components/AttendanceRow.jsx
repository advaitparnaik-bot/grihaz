import './AttendanceRow.css'

const STATUS_OPTIONS = [
  { value: 'present',       label: 'Present',       short: 'P',  color: 'green' },
  { value: 'absent_paid',   label: 'Absent (Paid)', short: 'AP', color: 'amber' },
  { value: 'absent_unpaid', label: 'Absent',        short: 'A',  color: 'red'   },
]

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function AttendanceRow({ staff, status, onChange, dimmed }) {
  return (
    <div className={`att-row ${dimmed ? 'att-row--dimmed' : ''}`}>
      <div className="att-avatar">{initials(staff.name)}</div>
      <div className="att-info">
        <div className="att-name">{staff.name}</div>
        <div className="att-role">{staff.role || '—'}</div>
      </div>
      <div className="att-toggles">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`att-btn att-btn--${opt.color} ${status === opt.value ? 'att-btn--active' : ''}`}
            onClick={() => onChange(staff.id, status === opt.value ? null : opt.value)}
            title={opt.label}
          >
            {opt.short}
          </button>
        ))}
      </div>
    </div>
  )
}
