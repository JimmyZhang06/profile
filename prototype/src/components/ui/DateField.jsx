import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { daysInMonth, moveDays, moveMonths, readCalendarValue, spokenDate, startingDay, todayKey, weekdayIndex } from './calendar.js';
import './date-field.css';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const months = Array.from({length: 12}, (_, index) => String(index + 1).padStart(2, '0'));

function CalendarPanel({ id, label, value, monthOnly, initialDate, min, max, clearable, allowSourceText, onChoose }) {
  const today = todayKey();
  const first = startingDay(min) || '0001-01-01';
  const end = startingDay(max);
  const last = monthOnly && end ? end.slice(0, 8) + daysInMonth(end) : end || '9999-12-31';
  const clamp = day => day < first ? first : day > last ? last : day;
  const normalView = monthOnly ? 'months' : 'days';
  const [view, setView] = useState(normalView);
  const [cursor, setCursor] = useState(() => clamp(startingDay(value) || startingDay(initialDate) || today));
  const [draft, setDraft] = useState(value || '');
  const [error, setError] = useState('');
  const panel = useRef(null), manualInput = useRef(null), moveFocus = useRef(true);
  const month = cursor.slice(0, 7), year = cursor.slice(0, 4);
  const firstOfMonth = month + '-01';
  const format = monthOnly ? 'YYYY-MM' : 'YYYY-MM-DD';
  const valueFor = day => monthOnly ? day.slice(0, 7) : day;

  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    if (view === 'manual') {
      manualInput.current?.focus({preventScroll: true});
      manualInput.current?.select();
    } else {
      panel.current?.querySelector('[data-cursor="true"]')?.focus({preventScroll: true});
    }
  }, [view, cursor]);

  function changeView(next) {
    moveFocus.current = true;
    setView(next);
    setError('');
  }

  function chooseMonth(key) {
    if (monthOnly) {
      onChoose(key);
    } else {
      const difference = Number(key.slice(5)) - Number(month.slice(5));
      setCursor(clamp(moveMonths(cursor, difference)));
      changeView('days');
    }
  }

  function navigateGrid(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const monthGrid = view === 'months';
    let next;
    switch (event.key) {
      case 'ArrowLeft': next = monthGrid ? moveMonths(cursor, -1) : moveDays(cursor, -1); break;
      case 'ArrowRight': next = monthGrid ? moveMonths(cursor, 1) : moveDays(cursor, 1); break;
      case 'ArrowUp': next = monthGrid ? moveMonths(cursor, -3) : moveDays(cursor, -7); break;
      case 'ArrowDown': next = monthGrid ? moveMonths(cursor, 3) : moveDays(cursor, 7); break;
      case 'Home': next = monthGrid ? year + '-01-01' : moveDays(cursor, -weekdayIndex(cursor)); break;
      case 'End': next = monthGrid ? year + '-12-01' : moveDays(cursor, 6 - weekdayIndex(cursor)); break;
      case 'PageUp':
      case 'PageDown': {
        const step = monthGrid || event.shiftKey ? 12 : 1;
        next = moveMonths(cursor, event.key === 'PageUp' ? -step : step);
        break;
      }
      default: return;
    }
    event.preventDefault();
    next = clamp(next);
    if (next !== cursor) {
      moveFocus.current = true;
      setCursor(next);
    }
  }

  function confirmText() {
    const result = readCalendarValue(draft, monthOnly);
    if (!result && allowSourceText && draft.trim()) {
      onChoose(draft.trim());
    } else if (!result) {
      setError(monthOnly ? '请输入有效的年月，例如 2026-07。' : '请输入有效的日期，例如 2026-07-31。');
    } else if (result < valueFor(first) || result > valueFor(last)) {
      setError('请选择 ' + valueFor(first) + ' 至 ' + valueFor(last) + ' 之间的' + (monthOnly ? '月份。' : '日期。'));
    } else {
      onChoose(result);
    }
  }

  function periodButton(direction) {
    const byYear = view === 'months';
    const next = clamp(moveMonths(cursor, direction * (byYear ? 12 : 1)));
    const length = byYear ? 4 : 7;
    const text = (direction < 0 ? '上一' : '下一') + (byYear ? '年' : '个月');
    const Icon = direction < 0 ? IconChevronLeft : IconChevronRight;
    return <button type="button" className="date-calendar-arrow" aria-label={text}
      disabled={next.slice(0, length) === cursor.slice(0, length)} onClick={() => setCursor(next)}>
      <Icon size={17} aria-hidden="true"/>
    </button>;
  }

  return <section id={id} ref={panel} className="date-panel" aria-label={label + (monthOnly ? '选月器' : '日历')}>
    {view === 'manual' ? <>
      <label className="date-manual-label" htmlFor={id + '-entry'}>{monthOnly ? '输入年月' : '输入日期'}</label>
      <div className="date-manual-row">
        <input id={id + '-entry'} ref={manualInput} type="text" inputMode={allowSourceText ? 'text' : 'numeric'} autoComplete="off"
          placeholder={allowSourceText ? '日期或来源原文' : format} value={draft} maxLength={allowSourceText ? 40 : 14} aria-invalid={!!error}
          aria-describedby={error ? id + '-error' : undefined}
          onChange={event => { setDraft(event.target.value); setError(''); }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); confirmText(); } }}/>
        <button type="button" className="date-confirm" onClick={confirmText}>确定</button>
      </div>
      {error && <small className="date-error" id={id + '-error'} role="alert">{error}</small>}
    </> : <>
      <div className="date-calendar-nav">
        {periodButton(-1)}
        {monthOnly ? <strong aria-live="polite">{year} 年</strong> :
          <button type="button" className="date-calendar-period" aria-label={view === 'days' ? '选择年月' : '返回选日期'}
            onClick={() => changeView(view === 'days' ? 'months' : 'days')}>
            <span aria-live="polite">{view === 'days' ? spokenDate(month) : year + ' 年'}</span>
            <IconChevronDown size={14} aria-hidden="true"/>
          </button>}
        {periodButton(1)}
      </div>
      {view === 'months' ? <div className="date-month-grid" role="group" aria-label={year + '年月份'} onKeyDown={navigateGrid}>
        {months.map(number => {
          const key = year + '-' + number;
          return <button type="button" key={key} aria-label={spokenDate(key)} aria-pressed={value?.slice(0, 7) === key}
            data-cursor={month === key} tabIndex={month === key ? 0 : -1}
            disabled={key < first.slice(0, 7) || key > last.slice(0, 7)} onClick={() => chooseMonth(key)}>
            {Number(number)} 月
          </button>;
        })}
      </div> : <>
        <div className="date-week" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className="date-day-grid" role="group" aria-label={spokenDate(month)} onKeyDown={navigateGrid}>
          {Array.from({length: daysInMonth(cursor)}, (_, index) => {
            const key = month + '-' + String(index + 1).padStart(2, '0');
            return <button type="button" key={key} aria-label={spokenDate(key)} aria-pressed={key === value}
              aria-current={key === today ? 'date' : undefined} data-cursor={key === cursor} tabIndex={key === cursor ? 0 : -1}
              style={index === 0 ? {gridColumnStart: weekdayIndex(firstOfMonth) + 1} : undefined}
              disabled={key < first || key > last} onClick={() => onChoose(key)}>
              {index + 1}
            </button>;
          })}
        </div>
      </>}
    </>}
    <div className="date-calendar-footer">
      <button type="button" onClick={() => changeView(view === 'manual' ? normalView : 'manual')}>
        {view === 'manual' ? '返回日历' : '手动输入'}
      </button>
      <div>
        {clearable && value && <button type="button" onClick={() => onChoose('')}>清除</button>}
        {today >= first && today <= last && <button type="button" onClick={() => onChoose(valueFor(today))}>
          {monthOnly ? '本月' : '今天'}
        </button>}
      </div>
    </div>
  </section>;
}

export function DateField({ label, hint, value, onChange, precision = 'day', initialDate,
  min, max, disabled = false, clearable = true, allowSourceText = false, ...triggerProps }) {
  const id = useId();
  const root = useRef(null), trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const monthOnly = precision === 'month';

  useEffect(() => {
    if (!open) return;
    if (disabled) { setOpen(false); return; }
    const closeOutside = event => { if (!event.composedPath().includes(root.current)) setOpen(false); };
    document.addEventListener('click', closeOutside);
    // Wait until the swipe settles. Closing mid-gesture resizes the active card.
    const card = root.current.closest('[data-card]');
    const observer = card && new MutationObserver(() => { if (card.inert) setOpen(false); });
    observer?.observe(card, {attributes: true, attributeFilter: ['inert']});
    return () => { document.removeEventListener('click', closeOutside); observer?.disconnect(); };
  }, [open, disabled]);

  function close() {
    setOpen(false);
    trigger.current?.focus({preventScroll: true});
  }

  return <div className="date-field" ref={root} data-open={open || undefined}
    onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <div className="date-field-header">
      <label id={id + '-label'} htmlFor={id}>{label}</label>
      <button {...triggerProps} id={id} type="button" ref={trigger} disabled={disabled} className="date-field-trigger"
        aria-labelledby={id + '-label'} aria-describedby={id + '-value' + (hint ? ' ' + id + '-hint' : '')}
        aria-controls={open ? id + '-panel' : undefined} aria-expanded={open && !disabled}
        onClick={() => setOpen(previous => !previous)}>
        <span id={id + '-value'} data-empty={!value || undefined}>{value || (monthOnly ? '选择月份' : '选择日期')}</span>
        <IconCalendar size={17} aria-hidden="true"/>
      </button>
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
    {open && !disabled && <CalendarPanel id={id + '-panel'} label={label} value={value} monthOnly={monthOnly}
      initialDate={initialDate} min={min} max={max} clearable={clearable} allowSourceText={allowSourceText}
      onChoose={next => { onChange(next); close(); }}/>}
  </div>;
}
