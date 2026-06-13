import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck, Database, Search } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function MLOpsDashboard() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    // In production, this would fetch from MLflow or a custom backend endpoint
    setMetrics({
      faithfulness: 0.94,
      answerRelevance: 0.89,
      contextPrecision: 0.92,
      semanticSimilarity: 0.85,
      latency: 1.2
    });
  }, []);

  if (!metrics) return <div style={{ padding: 24, color: 'var(--muted-text)' }}>Loading MLOps Telemetry...</div>;

  const radarData = [
    { subject: 'Faithfulness', A: metrics.faithfulness * 100, fullMark: 100 },
    { subject: 'Relevance', A: metrics.answerRelevance * 100, fullMark: 100 },
    { subject: 'Precision', A: metrics.contextPrecision * 100, fullMark: 100 },
    { subject: 'Similarity', A: metrics.semanticSimilarity * 100, fullMark: 100 },
  ];

  return (
    <div style={{ padding: 24, height: '100%' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Activity color="var(--accent-color)" size={22} /> MLOps & RAG Evaluation
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
        
        {/* Radar Chart Visualization */}
        <div style={{ height: 260, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
              <PolarGrid stroke="var(--border-color)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--muted-text)', fontSize: 12, fontWeight: 500 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--text-color)' }}
                itemStyle={{ color: 'var(--accent-color)' }}
              />
              <Radar 
                name="AI Model" 
                dataKey="A" 
                stroke="var(--accent-color)" 
                fill="var(--accent-color)" 
                fillOpacity={0.4} 
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          
          <div className="glass-card" style={{ padding: '16px 20px', borderTop: '3px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-text)', fontSize: '0.9rem', marginBottom: 8 }}>
              <ShieldCheck size={16} color="#10b981" /> <span>Faithfulness</span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--text-color)' }}>{(metrics.faithfulness * 100).toFixed(1)}%</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', marginTop: 4 }}>Hallucination rate is very low.</div>
          </div>

          <div className="glass-card" style={{ padding: '16px 20px', borderTop: '3px solid #3b82f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-text)', fontSize: '0.9rem', marginBottom: 8 }}>
              <Search size={16} color="#3b82f6" /> <span>Answer Relevance</span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--text-color)' }}>{(metrics.answerRelevance * 100).toFixed(1)}%</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', marginTop: 4 }}>Answers closely match user intent.</div>
          </div>

          <div className="glass-card" style={{ padding: '16px 20px', borderTop: '3px solid #a855f7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-text)', fontSize: '0.9rem', marginBottom: 8 }}>
              <Database size={16} color="#a855f7" /> <span>Context Precision</span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--text-color)' }}>{(metrics.contextPrecision * 100).toFixed(1)}%</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', marginTop: 4 }}>Retrieval quality from Vector DB.</div>
          </div>

          <div className="glass-card" style={{ padding: '16px 20px', borderTop: '3px solid var(--accent-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-text)', fontSize: '0.9rem', marginBottom: 8 }}>
              <Activity size={16} color="var(--accent-color)" /> <span>Avg. Latency</span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--text-color)' }}>{metrics.latency}s</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', marginTop: 4 }}>End-to-end generation time.</div>
          </div>

        </div>

      </div>
    </div>
  );
}
