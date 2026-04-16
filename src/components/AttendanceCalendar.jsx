import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AttendanceCalendarDaySheet from './AttendanceCalendarDaySheet'
import './AttendanceCalendar.css'

function getScheduledStaffForDay(staff, dateObj) {
  const fullDay = dateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
  const shortDay = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  return staff.filter(s => {
    if (!s.schedule) return true
    if (Array.isArray(s.schedule))
      return s.schedule.some(d => d.toLowerCase() === fullDay || d.toLowerCase() === shortDay)
    return true
  }).filter(s => s.active && s.staff_type === 'regular')
}

export default function AttendanceCalendar({ home, staff, onClose }) {
  const today = new Date()
  const [viewMonth, setViewMonth] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [attendanceData, setAttendanceData] = useState({}) // { 'YYYY-MM-DD': { staffId: status } }
  const [settledMonths, setSettledMonths] = useState([]) // ['YYYY-MM-01', ...]
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)

  const minDate = new Date(today.getFullYear(), today.getMonth() - 2, 1) // 3 months back

  useEffect(() => {
    loadMonthData()
  }, [viewMonth])

  async function loadMonthData() {
    setLoading(true)
    const firstStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-01`
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate()
    const lastStr = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Fetch attendance for this month
    const { data: attData } = await supabase
      .from('attendance')
      .select('staff_id, date, status')
      .eq('home_id', home.id)
      .gte('date', firstStr)
      .lte('date', lastStr)

    const attMap = {}
    for (const row of attData || []) {
      if (!attMap[row.date]) attMap[row.date] = {}
      attMap[row.date][row.staff_id] = row.status
    }
    setAttendanceData(attMap)

    // Fetch settlements for this month
    const { data: settData } = await supabase
      .from('settlements')
      .select('month, staff_id')
      .eq('home_id', home.id)
      .eq('month', firstStr)

    setSettledMonths(settData || [])
    setLoading(false)
  }

  function getDayStatus(dateObj) {
    const dateStr = dateObj.toISOString().split('T')[0]
    const scheduled = getScheduledStaffForDay(staff, dateObj)
    if (!scheduled.length) return 'none'
    const dayAtt = attendanceData[dateStr] || {}
    const markedCount = scheduled.filter(s => dayAtt[s.id]).length
    if (markedCount === 0) return 'red'
    if (markedCount === scheduled.length) return 'green'
    return 'orange'
  }

  function isSettledForAll(dateObj) {
    const scheduled = getScheduledStaffForDay(staff, dateObj)
    if (!scheduled.length) return true
    return scheduled.every(s => settledMonths.some(sm => sm.staff_id === s.id))
  }

  function isFuture(dateObj) {
    const d = new Date(dateObj)
    d.setHours(0, 0, 0, 0)
    const t = new Date(today)
    t.setHours(0, 0, 0, 0)
    return d > t
  }

  function isToday(dateObj) {
    return dateObj.toISOString().split('T')[0] === today.toISOString().split('T')[0]
  }

  function canGoBack() {
    const prev = new Date(viewMonth.year, viewMonth.month - 1, 1)
    return prev >= minDate
  }

  function canGoForward() {
    return viewMonth.year < today.getFullYear() ||
      (viewMonth.year === today.getFullYear() && viewMonth.month < today.getMonth())
  }

  function prevMonth() {
    if (!canGoBack()) return
    setViewMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 }
      return { year: prev.year, month: prev.month - 1 }
    })
  }

  function nextMonth() {
    if (!canGoForward()) return
    setViewMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 }
      return { year: prev.year, month: prev.month + 1 }
    })
  }

  // Build calendar grid
  const firstOfMonth = new Date(viewMonth.year, viewMonth.month, 1)
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate()
  const startDayOfWeek = firstOfMonth.getDay() // 0 = Sunday

  const days = []
  for (let i = 0; i < startDayOfWeek; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(viewMonth.year, viewMonth.month, d))
  }

  const monthLabel = firstOfMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className="ac-overlay">
      <div className="ac-sheet">
        <div className="ac-header">
          <button className="ac-nav-btn" onClick={prevMonth} disabled={!canGoBack()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="ac-month-label">{monthLabel}</span>
          <button className="ac-nav-btn" onClick={nextMonth} disabled={!canGoForward()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <button className="ac-close-btn" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="ac-weekdays">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="ac-weekday">{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="ac-loading"><div className="dash-spinner" /></div>
        ) : (
          <div className="ac-grid">
            {days.map((dateObj, i) => {
              if (!dateObj) return <div key={`empty-${i}`} className="ac-cell ac-cell--empty" />
              const future = isFuture(dateObj)
              const todayDay = isToday(dateObj)
              const status = future ? 'none' : getDayStatus(dateObj)
              const settled = !future && isSettledForAll(dateObj)

              return (
                <div
                  key={dateObj.toISOString()}
                  className={`ac-cell ${future ? 'ac-cell--future' : 'ac-cell--past'} ${todayDay ? 'ac-cell--today' : ''}`}
                  onClick={() => !future && setSelectedDay(dateObj)}
                >
                  <div className={`ac-day-circle ac-day-circle--${status}`}>
                    {dateObj.getDate()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="ac-legend">
          <span className="ac-legend-item"><span className="ac-dot ac-dot--green" />All marked</span>
          <span className="ac-legend-item"><span className="ac-dot ac-dot--orange" />Partial</span>
          <span className="ac-legend-item"><span className="ac-dot ac-dot--red" />None marked</span>
        </div>
      </div>

      {selectedDay && (
        <AttendanceCalendarDaySheet
          home={home}
          staff={staff}
          date={selectedDay}
          settledStaffIds={settledMonths.map(s => s.staff_id)}
          onClose={() => setSelectedDay(null)}
          onSaved={() => { setSelectedDay(null); loadMonthData() }}
        />
      )}
    </div>
  )
}