import React, { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, AlertTriangle } from 'lucide-react';
import { Sparkline, DonutChart } from './Visuals';

const API_URL = 'http://127.0.0.1:8000/api';

export default function AnalyticsPanel({ isSidebar, onToggleFullScreen }) {
  const [data, setData] = useState(null);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_URL}/analytics/dashboard`);
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!data) return <p style={{ color: 'var(--muted-text)', fontSize: '.85rem', textAlign: 'center', padding: 20 }}>Loading analytics...</p>;

  const { total_queries, avg_confidence, avg_response_time_ms, cache_hit_rate, confidence_distribution, query_volume, top_documents, knowledge_gaps, feedback, domain_distribution, response_times } = data;
  const volumeData = (query_volume || []).map(v => v.count);
  const rtData = (response_times || []).map(r => r.time_ms);
  const fbTotal = (feedback?.helpful || 0) + (feedback?.not_helpful || 0);
  const maxDocCount = Math.max(...(top_documents || []).map(d => d.count), 1);
  const confMax = Math.max(...(confidence_distribution || []).map(b => b.count), 1);

  if (isSidebar) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <p className="sidebar-title" style={{ marginBottom: 12 }}>Enterprise Analytics</p>
        <div className="analytics-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="analytics-card" style={{ padding: 12 }}>
            <h4>Total Queries</h4>
            <div className="big-number" style={{ fontSize: '1.2rem' }}>{total_queries}</div>
          </div>
          <div className="analytics-card" style={{ padding: 12 }}>
            <h4>Avg Response</h4>
            <div className="big-number" style={{ fontSize: '1.2rem' }}>{avg_response_time_ms < 1000 ? `${Math.round(avg_response_time_ms)}ms` : `${(avg_response_time_ms/1000).toFixed(1)}s`}</div>
          </div>
          <div className="analytics-card" style={{ gridColumn: '1 / -1', padding: 12 }}>
            <h4>Cache Hit Rate</h4>
            <div className="big-number" style={{ fontSize: '1.2rem' }}>{Math.round(cache_hit_rate * 100)}%</div>
          </div>
          <div className="analytics-card" style={{ gridColumn: '1 / -1', padding: 12 }}>
            <h4>Query Volume (24h)</h4>
            <Sparkline data={volumeData} width={240} height={36} />
          </div>
        </div>
        
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <button className="secondary-button" style={{ width: '100%', justifyContent: 'center' }} onClick={onToggleFullScreen}>
            Show Full Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="analytics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {/* KPI Cards */}
        <div className="analytics-card">
          <h4>Total Queries</h4>
          <div className="big-number">{total_queries}</div>
        </div>
        <div className="analytics-card">
          <h4>Avg Confidence</h4>
          <div className="big-number">{Math.round(avg_confidence * 100)}%</div>
        </div>
        <div className="analytics-card">
          <h4>Avg Response</h4>
          <div className="big-number">{avg_response_time_ms < 1000 ? `${Math.round(avg_response_time_ms)}ms` : `${(avg_response_time_ms/1000).toFixed(1)}s`}</div>
        </div>
        <div className="analytics-card">
          <h4>Cache Hit Rate</h4>
          <div className="big-number">{Math.round(cache_hit_rate * 100)}%</div>
        </div>

        {/* Query Volume Sparkline */}
        <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
          <h4>Query Volume (24h)</h4>
          <Sparkline data={volumeData} width={800} height={48} />
        </div>

        {/* Confidence Distribution */}
        <div className="analytics-card">
          <h4>Confidence Distribution</h4>
          {(confidence_distribution || []).map((b, i) => {
            const colors = ['var(--danger-color)', 'var(--warning-color)', '#34d399', 'var(--success-color)'];
            return (
              <div className="bar-row" key={i}>
                <span className="bar-label">{b.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(b.count / confMax) * 100}%`, background: colors[i] }} />
                </div>
                <span className="bar-value">{b.count}</span>
              </div>
            );
          })}
        </div>

        {/* Feedback */}
        <div className="analytics-card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <DonutChart value={feedback?.helpful || 0} total={fbTotal || 1} size={72} color="var(--success-color)" />
          <div>
            <h4 style={{ marginBottom: 8 }}>Feedback Rating</h4>
            <div style={{ fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success-color)' }}><ThumbsUp size={14} /> {feedback?.helpful || 0}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--danger-color)' }}><ThumbsDown size={14} /> {feedback?.not_helpful || 0}</span>
            </div>
          </div>
        </div>

        {/* Domain Distribution */}
        <div className="analytics-card">
          <h4>Queries By Domain</h4>
          {(domain_distribution || []).length === 0 && <span className="sub-label">No data yet</span>}
          {(domain_distribution || []).slice(0, 5).map((d, i) => (
            <div className="bar-row" key={i}>
              <span className="bar-label">{d.domain}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(d.count / (domain_distribution[0]?.count || 1)) * 100}%`, background: 'var(--accent-color)' }} />
              </div>
              <span className="bar-value">{d.count}</span>
            </div>
          ))}
        </div>

        {/* Top Documents */}
        <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
          <h4>Top Referenced Documents</h4>
          {(top_documents || []).length === 0 && <span className="sub-label">No queries yet</span>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0 20px' }}>
            {(top_documents || []).map((d, i) => (
              <div className="bar-row" key={i}>
                <span className="bar-label" style={{ minWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.document}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(d.count / maxDocCount) * 100}%`, background: 'var(--accent-secondary)' }} />
                </div>
                <span className="bar-value">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Response Time Trend */}
        <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
          <h4>Response Time Trend (ms)</h4>
          <Sparkline data={rtData} width={800} height={40} color="var(--warning-color)" />
        </div>

        {/* Knowledge Gaps */}
        <div className="analytics-card" style={{ gridColumn: '1 / -1' }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} color="var(--warning-color)" /> Knowledge Gaps (Low Confidence)</h4>
          {(knowledge_gaps || []).length === 0 && <span className="sub-label">No gaps detected — great coverage!</span>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '8px 20px' }}>
            {(knowledge_gaps || []).map((g, i) => (
              <div className="gap-item" key={i}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.query}</span>
                <span className="gap-conf">{Math.round(g.confidence * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
