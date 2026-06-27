import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';
import { Loader2, Network, Sparkles } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#ff7a18',
    primaryTextColor: '#fff',
    primaryBorderColor: '#ff7a18',
    lineColor: '#ffb347',
    secondaryColor: '#3b82f6',
    tertiaryColor: '#1e1e2f',
    fontFamily: 'Inter'
  }
});

export function MermaidDiagram({ chart, theme = 'default', isDraft = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (isDraft) return;
    let active = true;
    const renderChart = () => {
      if (!containerRef.current || !chart || !active) return;
      const isLight = document.documentElement.getAttribute('data-theme') === 'light' || document.querySelector('.app-container')?.classList.contains('light');
      
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        securityLevel: 'loose',
        theme: isLight ? 'default' : (theme === 'dark' ? 'dark' : theme === 'forest' ? 'forest' : 'base'),
        themeVariables: isLight ? {
          primaryColor: '#f1f5f9',
          primaryTextColor: '#0f172a',
          primaryBorderColor: '#0284c7',
          lineColor: '#0284c7',
          secondaryColor: '#e2e8f0',
          tertiaryColor: '#ffffff',
          fontFamily: 'Inter'
        } : (theme === 'default' ? {
          primaryColor: '#ff7a18',
          primaryTextColor: '#fff',
          primaryBorderColor: '#ff7a18',
          lineColor: '#ffb347',
          secondaryColor: '#3b82f6',
          tertiaryColor: '#1e1e2f',
          fontFamily: 'Inter'
        } : undefined)
      });
      
      let cleanChart = chart
        .replace(/&/g, 'and')
        .replace(/([a-zA-Z0-9]+)-([a-zA-Z0-9]+)(\[|\(|\{)/g, '$1_$2$3')
        .replace(/["']/g, '')
        .split('\n')
        .filter(line => !line.includes('width:') && !line.trim().toLowerCase().startsWith('note '))
        .join('\n').trim();

      const knownHeaders = ['graph ', 'flowchart ', 'sequencediagram', 'classdiagram', 'statediagram', 'erdiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'gitgraph', 'c4context', 'quadrantchart'];
      const firstLine = cleanChart.toLowerCase().split('\n')[0].trim();
      if (!knownHeaders.some(h => firstLine.startsWith(h))) {
        cleanChart = `graph TD\n${cleanChart}`;
      }

      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      mermaid.render(id, cleanChart)
        .then(({ svg }) => {
          if (containerRef.current && active) containerRef.current.innerHTML = svg;
        })
        .catch(e => {
          console.error("Mermaid error:", e);
          document.querySelectorAll(`[id*="${id}"], .error-icon, [id^="dmermaid"]`).forEach(el => el.remove());
          if (containerRef.current && active) {
            containerRef.current.innerHTML = `<div style="padding: 20px; background: rgba(255, 122, 24, 0.04); border: 1px dashed rgba(255, 122, 24, 0.3); border-radius: 12px; color: var(--text-color); font-size: 0.85rem; text-align: center;">
              <div style="color: var(--primary-color); font-weight: 700; margin-bottom: 6px;">📐 Architecture Flowchart Drafted</div>
              <div style="color: var(--muted-text); font-size: 0.8rem; margin-bottom: 12px;">The AI model generated complex flowchart styling that exceeded browser rendering limits. Below is the blueprint drafted:</div>
              <pre style="text-align: left; background: rgba(0,0,0,0.25); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 0.75rem; max-height: 180px; overflow-y: auto; color: #e2e8f0; border: 1px solid rgba(255,255,255,0.05);">${chart.replace(/</g, '&lt;')}</pre>
            </div>`;
          }
        });
    };

    renderChart();
    const observer = new MutationObserver(renderChart);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => { active = false; observer.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, theme]);

  if (isDraft) {
    const draftLines = (chart || '').split('\n').filter(l => l.trim().length > 0).length;
    return (
      <div className="mermaid-container" style={{ padding: '28px 24px', background: 'var(--card-bg-strong)', borderRadius: '12px', border: '1px dashed rgba(255,122,24,0.4)', margin: '16px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: 'rgba(255, 122, 24, 0.1)' }}>
            <Loader2 className="spin" size={24} color="var(--primary-color)" />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--primary-color)', fontSize: '0.95rem', fontWeight: 600 }}>
              ✨ AI Constructing Architecture Diagram...
            </h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted-text)', fontFamily: 'monospace' }}>
              Compiling flowchart structure ({draftLines} lines drafted)
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <div className="mermaid-container" ref={containerRef} style={{ padding: '16px', background: 'var(--card-bg-strong)', borderRadius: '12px', overflowX: 'auto', border: '1px solid var(--border-color)', margin: '16px 0', display: 'flex', justifyContent: 'center' }} />;
}
export function ConfidenceGauge({ value = 0, size = 52 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, value)));
  const color = value >= 0.7 ? 'var(--success-color)' : value >= 0.4 ? 'var(--warning-color)' : 'var(--danger-color)';
  return (
    <div className="confidence-gauge" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-color)" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }} />
      </svg>
      <div className="gauge-text" style={{ color }}>{Math.round(value * 100)}%</div>
    </div>
  );
}

/* ── Pipeline Flowchart ──────────────────────────────────────── */
const STEPS = ['Query', 'Rewrite', 'Retrieve', 'Ground', 'Generate', 'Cite'];
export function PipelineBar({ activeStep = -1 }) {
  return (
    <div className="pipeline-bar">
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className="pipeline-arrow">→</span>}
          <div className={`pipeline-step ${i < activeStep ? 'done' : i === activeStep ? 'active' : ''}`}>
            {i < activeStep ? '✓' : i === activeStep ? '●' : '○'} {s}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Query Timeline ──────────────────────────────────────────── */
export function QueryTimeline({ timing }) {
  if (!timing) return null;
  const stages = [
    { label: 'Rewrite', ms: timing.rewrite_ms || 0, color: '#818cf8' },
    { label: 'Retrieve', ms: timing.retrieve_ms || 0, color: '#34d399' },
    { label: 'Generate', ms: timing.generate_ms || 0, color: '#fbbf24' },
  ];
  const total = stages.reduce((s, x) => s + x.ms, 0) || 1;
  return (
    <div className="query-timeline">
      {stages.map((st, i) => (
        <React.Fragment key={st.label}>
          {i > 0 && <div className="timeline-dot" />}
          <div className="timeline-segment" style={{ flex: Math.max(st.ms / total, 0.05) }}>
            <span className="timeline-label">{st.label}</span>
            <div className="timeline-bar" style={{ background: st.color, opacity: 0.6 }} />
            <span className="timeline-ms">{st.ms.toFixed(0)}ms</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── Sparkline (SVG) ─────────────────────────────────────────── */
export function Sparkline({ data = [], width = 400, height = 40, color = 'var(--accent-color)' }) {
  if (!data.length) return <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} />;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * width},${height - (v / max) * (height - 4)}`).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs><linearGradient id="sparkG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={areaPoints} fill="url(#sparkG)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Donut Chart ─────────────────────────────────────────────── */
export function DonutChart({ value = 0, total = 1, size = 64, color = 'var(--success-color)' }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? value / total : 0;
  const offset = circ * (1 - pct);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-color)" strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.68rem',fontWeight:700 }}>
        {Math.round(pct * 100)}%
      </div>
    </div>
  );
}

/* ── Retrieval Score Bars ────────────────────────────────────── */
export function RetrievalScoreBars({ scores = [] }) {
  if (!scores.length) return null;
  const max = Math.max(...scores.map(s => s.score), 0.01);
  return (
    <div style={{ marginTop: 8 }}>
      {scores.map((s, i) => {
        const pct = (s.score / max) * 100;
        const color = pct > 70 ? 'var(--success-color)' : pct > 40 ? 'var(--warning-color)' : 'var(--danger-color)';
        return (
          <div className="score-bar-container" key={i}>
            <span style={{ fontSize: '.72rem', color: 'var(--muted-text)', minWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.document}</span>
            <div className="score-bar-bg">
              <div className="score-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="score-bar-label" style={{ color }}>{s.score.toFixed(3)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Architecture Diagram (SVG) ──────────────────────────────── */
export function ArchitectureDiagram() {
  return (
    <div className="visual-diagram-container" style={{ cursor: 'zoom-in', width: '100%', display: 'flex', justifyContent: 'center', margin: '16px 0', background: 'var(--card-bg-strong)', padding: 16, borderRadius: 12, border: '1px solid var(--border-color)' }} title="Click to view center full screen">
      <svg viewBox="0 0 700 420" width="100%" style={{ maxWidth: 680 }}>
        <defs>
          <linearGradient id="gFE" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15"/><stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05"/></linearGradient>
          <linearGradient id="gBE" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.15"/><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.05"/></linearGradient>
          <linearGradient id="gST" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.15"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0.05"/></linearGradient>
        </defs>
        {/* Frontend Layer */}
        <rect x="20" y="10" width="660" height="100" rx="16" fill="url(#gFE)" stroke="#3b82f6" strokeOpacity="0.3" strokeWidth="1.5"/>
        <text x="40" y="35" fill="#3b82f6" fontSize="13" fontWeight="700" fontFamily="Inter">FRONTEND — React + Vite</text>
        {['Chat UI','Analytics','Knowledge Base','Domain Mgr'].map((t,i)=>(
          <React.Fragment key={t}>
            <rect x={40+i*160} y={48} width={140} height={48} rx="10" fill="#3b82f620" stroke="#3b82f640" strokeWidth="1"/>
            <text x={110+i*160} y={76} textAnchor="middle" fill="#93c5fd" fontSize="11" fontWeight="600" fontFamily="Inter">{t}</text>
          </React.Fragment>
        ))}
        {/* Arrow */}
        <text x="350" y="135" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="Inter">REST API + SSE</text>
        <line x1="350" y1="110" x2="350" y2="155" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrow)"/>
        {/* Backend Layer */}
        <rect x="20" y="155" width="660" height="100" rx="16" fill="url(#gBE)" stroke="#8b5cf6" strokeOpacity="0.3" strokeWidth="1.5"/>
        <text x="40" y="180" fill="#8b5cf6" fontSize="13" fontWeight="700" fontFamily="Inter">BACKEND — FastAPI</text>
        {['RAG QA\nEngine','Hybrid\nRetrieval','Analytics\nEngine','Cache\nLayer'].map((t,i)=>(
          <React.Fragment key={i}>
            <rect x={40+i*160} y={193} width={140} height={48} rx="10" fill="#8b5cf620" stroke="#8b5cf640" strokeWidth="1"/>
            {t.split('\n').map((line,j)=>(
              <text key={j} x={110+i*160} y={213+j*14} textAnchor="middle" fill="#c4b5fd" fontSize="10" fontWeight="600" fontFamily="Inter">{line}</text>
            ))}
          </React.Fragment>
        ))}
        {/* Arrow */}
        <line x1="350" y1="255" x2="350" y2="290" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4,3"/>
        {/* Storage Layer */}
        <rect x="20" y="290" width="660" height="110" rx="16" fill="url(#gST)" stroke="#22c55e" strokeOpacity="0.3" strokeWidth="1.5"/>
        <text x="40" y="315" fill="#22c55e" fontSize="13" fontWeight="700" fontFamily="Inter">STORAGE & AI</text>
        {[{t:'Groq LLM\n(Llama 3.3)',c:'#fbbf24'},{t:'FAISS + BM25\nIndices',c:'#34d399'},{t:'SQLite\nAnalytics + KB',c:'#38bdf8'},{t:'LRU Cache\nIn-Memory',c:'#f87171'}].map((item,i)=>(
          <React.Fragment key={i}>
            <rect x={40+i*160} y={328} width={140} height={56} rx="10" fill={item.c+'15'} stroke={item.c+'40'} strokeWidth="1"/>
            {item.t.split('\n').map((line,j)=>(
              <text key={j} x={110+i*160} y={352+j*14} textAnchor="middle" fill={item.c} fontSize="10" fontWeight="600" fontFamily="Inter">{line}</text>
            ))}
          </React.Fragment>
        ))}
      </svg>
    </div>
  );
}

/* ── Simple Markdown Renderer ────────────────────────────────── */
/* eslint-disable react-refresh/only-export-components */
export function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let inCodeBlock = false, codeLanguage = '', codeLines = [], codeKey = 0;
  let tableBuffer = [], tableKey = 0;

  const processInline = (line) => {
    const parts = [];
    let remaining = line;
    let key = 0;
    // Bold
    while (remaining.includes('**')) {
      const start = remaining.indexOf('**');
      const end = remaining.indexOf('**', start + 2);
      if (end === -1) break;
      if (start > 0) parts.push(<span key={key++}>{remaining.slice(0, start)}</span>);
      parts.push(<strong key={key++}>{remaining.slice(start + 2, end)}</strong>);
      remaining = remaining.slice(end + 2);
    }
    if (remaining) parts.push(<span key={key++}>{remaining}</span>);
    return parts.length ? parts : line;
  };

  const processLine = (line) => {
    const codeRegex = /`([^`]+)`/g;
    const segments = [];
    let last = 0, match;
    while ((match = codeRegex.exec(line)) !== null) {
      if (match.index > last) segments.push(line.slice(last, match.index));
      segments.push(<code key={`c${match.index}`}>{match[1]}</code>);
      last = match.index + match[0].length;
    }
    if (last < line.length) segments.push(line.slice(last));
    if (segments.length === 0) return processInline(line);
    return segments.map((s, i) => typeof s === 'string' ? <span key={i}>{processInline(s)}</span> : s);
  };

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    if (tableBuffer.length === 1 && !tableBuffer[0].includes('---')) {
      elements.push(<p key={`p-tbl-${tableKey++}`}>{processLine(tableBuffer[0])}</p>);
      tableBuffer = [];
      return;
    }

    const parseRow = (str) => str.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const headerCells = parseRow(tableBuffer[0]);
    const rows = tableBuffer.slice(1).filter(r => !/^\|?[\s:-]+\|?$/.test(r.replace(/\|/g, '')));

    elements.push(
      <div key={`tbl-${tableKey++}`} className="visual-diagram-container" style={{ margin: '16px 0', overflowX: 'auto', background: 'var(--card-bg-strong)', borderRadius: 12, border: '1px solid var(--border-color)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)', cursor: 'zoom-in' }} title="Click to view full screen">
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'rgba(128, 128, 128, 0.08)', borderBottom: '1px solid var(--border-color)' }}>
              {headerCells.map((h, hIdx) => (
                <th key={hIdx} style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--accent-color)' }}>{processLine(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowStr, rIdx) => {
              const cells = parseRow(rowStr);
              return (
                <tr key={rIdx} style={{ borderBottom: rIdx === rows.length - 1 ? 'none' : '1px solid var(--border-color)', background: rIdx % 2 === 1 ? 'rgba(128,128,128,0.04)' : 'transparent' }}>
                  {cells.map((c, cIdx) => (
                    <td key={cIdx} style={{ padding: '10px 16px', color: 'var(--text-color)', lineHeight: 1.5 }}>{processLine(c)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flushTable();
      if (inCodeBlock) {
        if (codeLanguage === 'mermaid') {
          const storedTheme = window.localStorage.getItem('docpilot-chart-theme') || 'default';
          elements.push(<MermaidDiagram key={`mermaid-${codeKey++}`} chart={codeLines.join('\n')} theme={storedTheme} />);
        } else {
          elements.push(<pre key={`code-${codeKey++}`}><code>{codeLines.join('\n')}</code></pre>);
        }
        codeLines = [];
        inCodeBlock = false;
        codeLanguage = '';
      } else {
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim().toLowerCase();
      }
      continue;
    }
    if (inCodeBlock) { codeLines.push(line); continue; }

    const isTableLine = line.trim().startsWith('|') && line.trim().includes('|', 1);
    if (isTableLine) {
      tableBuffer.push(line);
      continue;
    } else {
      flushTable();
    }

    // Standalone Markdown image: ![alt](url)
    const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());
    if (imgMatch) {
      elements.push(<div key={i} style={{ margin: '12px 0' }}><img src={imgMatch[2]} alt={imgMatch[1] || 'Markdown Image'} style={{ maxWidth: '100%', borderRadius: 8, cursor: 'zoom-in', border: '1px solid var(--border-color)' }} title="Click to view center full screen" /></div>);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i}>{processLine(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<li key={i}>{processLine(line.replace(/^\d+\.\s/, ''))}</li>);
    } else if (line.trim() === '') {
      elements.push(<br key={i} />);
    } else {
      elements.push(<p key={i}>{processLine(line)}</p>);
    }
  }
  flushTable();
  if (inCodeBlock && codeLines.length) {
    if (codeLanguage === 'mermaid') {
      const storedTheme = window.localStorage.getItem('docpilot-chart-theme') || 'default';
      elements.push(<MermaidDiagram key={`mermaid-${codeKey}`} chart={codeLines.join('\n')} theme={storedTheme} isDraft={true} />);
    } else {
      elements.push(<pre key={`code-${codeKey}`}><code>{codeLines.join('\n')}</code></pre>);
    }
  }
  return elements;
}
