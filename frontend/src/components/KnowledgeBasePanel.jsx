import React, { useState } from 'react';
import { Database, FileText, Info, Box, Briefcase, FileSignature, Heart, Landmark, Layout, ChevronDown, Trash2 } from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000/api';

const getDomainIcon = (id) => {
  switch(id) {
    case 'engineering': return <Box size={22} strokeWidth={1.5} />;
    case 'hr': return <Heart size={22} strokeWidth={1.5} />;
    case 'finance': return <Landmark size={22} strokeWidth={1.5} />;
    case 'legal': return <FileSignature size={22} strokeWidth={1.5} />;
    case 'product': return <Layout size={22} strokeWidth={1.5} />;
    default: return <Briefcase size={22} strokeWidth={1.5} />;
  }
};

export default function KnowledgeBasePanel({ documents, setDocuments, domains, fetchDocuments, onDelete, onViewArchitecture }) {
  const [expandedSummary, setExpandedSummary] = useState(null);
  const [showAssets, setShowAssets] = useState(false);
  
  const docDomains = domains.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="sidebar-title" style={{ marginBottom: 0 }}>Knowledge Domains</p>
        <button className="icon-btn" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.75rem', padding: '4px 8px' }} title="View Architecture Diagram" onClick={onViewArchitecture}>
          <Info size={14} /> Architecture
        </button>
      </div>

      {/* Domain Map */}
      <div className="domain-grid">
        {domains.map((d) => (
          <div className="domain-card" key={d.id} style={{ borderTop: `3px solid ${d.color}` }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: d.color }}>
              {getDomainIcon(d.id)}
            </div>
            <div className="domain-name">{d.name}</div>
            <div className="domain-count">{d.document_count || 0} assets</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 16, cursor: 'pointer' }} onClick={() => setShowAssets(!showAssets)}>
        <p className="sidebar-title" style={{ marginBottom: 0, color: showAssets ? 'var(--text-color)' : 'var(--muted-text)' }}>Indexed Assets ({documents.length})</p>
        <ChevronDown size={16} style={{ color: 'var(--muted-text)', transform: showAssets ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>
      
      {showAssets && (
        documents.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            <Database size={32} strokeWidth={1.5} />
            <p>No knowledge assets indexed yet.</p>
          </div>
        ) : (
          <div className="document-list">
            {documents.map((doc) => {
              const dom = docDomains[doc.domain] || { name: 'General', color: '#64748b' };
              const isExpanded = expandedSummary === doc.name;
              return (
                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="kb-doc-item">
                    <div className="kb-doc-info">
                      <div className="kb-doc-icon" style={{ background: dom.color + '15', color: dom.color }}>
                        <FileText size={16} />
                      </div>
                      <div className="kb-doc-details">
                        <p title={doc.name}>{doc.name}</p>
                        <span>{doc.size} · {dom.name}</span>
                      </div>
                    </div>
                    <div className="kb-doc-actions">
                      <button 
                        className="meta-badge domain-badge" 
                        onClick={() => setExpandedSummary(isExpanded ? null : doc.name)}
                        style={{ cursor: 'pointer', border: 'none', padding: '4px 6px' }}
                      >
                        {isExpanded ? 'Hide' : 'Summary'}
                      </button>
                      <button className="icon-btn danger" onClick={() => onDelete(doc.name)} title="Delete Document">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="doc-summary">
                      {doc.summary || "No AI summary available for this document."}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
