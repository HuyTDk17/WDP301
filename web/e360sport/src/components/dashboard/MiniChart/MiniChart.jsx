import styles from './MiniChart.module.css'

export default function MiniChart({ data = [], color = 'var(--primary)', height = 160, showLabels = true, type = 'bar', title, subtitle }) {
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div className={styles.wrapper}>
      {(title || subtitle) && (
        <div className={styles.header}>
          {title && <h4 className={styles.title}>{title}</h4>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      )}

      {type === 'bar' && (
        <div className={styles.barChart} style={{ height }}>
          {data.map((d, i) => (
            <div key={i} className={styles.barItem}>
              {d.label2 && <span className={styles.topLabel}>{d.label2}</span>}
              <div className={styles.barTrack}>
                <div className={styles.bar} style={{ height: `${(d.value / max) * 100}%`, background: d.color || color }}>
                  <span className={styles.tooltip}>{d.tooltip || d.value}</span>
                </div>
              </div>
              {showLabels && <span className={styles.label}>{d.label}</span>}
              {d.sub && <span className={styles.sub}>{d.sub}</span>}
            </div>
          ))}
        </div>
      )}

      {type === 'line' && (
        <div className={styles.lineChart} style={{ height }}>
          <svg viewBox={`0 0 ${data.length * 60} ${height}`} preserveAspectRatio="none" className={styles.svg}>
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`M ${data.map((d, i) => `${i * 60 + 30},${height - (d.value / max) * (height - 20) - 10}`).join(' L ')} L ${(data.length - 1) * 60 + 30},${height} L 30,${height} Z`} fill="url(#lineGrad)" />
            <polyline points={data.map((d, i) => `${i * 60 + 30},${height - (d.value / max) * (height - 20) - 10}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((d, i) => (
              <circle key={i} cx={i * 60 + 30} cy={height - (d.value / max) * (height - 20) - 10} r="4" fill={color} stroke="white" strokeWidth="2" />
            ))}
          </svg>
          {showLabels && (
            <div className={styles.lineLabels}>
              {data.map((d, i) => <span key={i} className={styles.lineLabel}>{d.label}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
