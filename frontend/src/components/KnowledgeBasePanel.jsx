import React, { useState } from 'react';
import { Database, FileText, Info, Box, Briefcase, FileSignature, Heart, Landmark, Layout, ChevronDown, Trash2, MoreVertical, X } from 'lucide-react';
import CustomDropdown from './CustomDropdown';

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

export default function KnowledgeBasePanel({ documents, setDocuments, domains, fetchDocuments, onDelete, session, userRole, setFullScreenKB, propertiesModal, setPropertiesModal, summaryModal, setSummaryModal }) {
  const [expandedSummary, setExpandedSummary] = useState(null);
  const [showAssets, setShowAssets] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  
  const docDomains = domains.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
  }, {});

  const displayedDomains = userRole === 'super_admin' ? domains : domains.filter(d => d.id === userRole);
  
  const permittedDocuments = userRole === 'super_admin' ? documents : documents.filter(d => d.uploaded_by === session?.user?.email);
  const domainDocuments = userRole === 'super_admin' ? documents : documents.filter(d => d.domain === userRole || d.domain === 'general');
  const displayedDocuments = permittedDocuments.slice(0, 3);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="sidebar-title" style={{ marginBottom: 0 }}>Knowledge Domains</p>
      </div>

      {/* Domain Map */}
      <div className="domain-grid">
        {displayedDomains.map((d) => (
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
        <p className="sidebar-title" style={{ marginBottom: 0, color: showAssets ? 'var(--text-color)' : 'var(--muted-text)' }}>Indexed Assets ({permittedDocuments.length})</p>
        <ChevronDown size={16} style={{ color: 'var(--muted-text)', transform: showAssets ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>
      
      {showAssets && (
        permittedDocuments.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            <Database size={32} strokeWidth={1.5} />
            <p>No knowledge assets indexed yet.</p>
            {domainDocuments.length > 0 && (
              <button 
                className="secondary-button" 
                style={{ width: '100%', marginTop: 16, fontSize: '0.8rem', padding: '8px' }}
                onClick={() => setFullScreenKB(true)}
              >
                View Domain Knowledge Base
              </button>
            )}
          </div>
        ) : (
          <div className="document-list">
            {displayedDocuments.map((doc) => {
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
                    <div className="kb-doc-actions" style={{ position: 'relative' }}>
                      <button 
                        className="icon-btn" 
                        onClick={() => setOpenMenu(openMenu === doc.name ? null : doc.name)}
                      >
                        <MoreVertical size={16} />
                      </button>
                      
                      {openMenu === doc.name && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 4, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 140 }}>
                          <button 
                            onClick={() => { setSummaryModal(doc); setOpenMenu(null); }} 
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-bg-strong)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            Summary
                          </button>
                          <button 
                            onClick={() => { setPropertiesModal(doc); setOpenMenu(null); }} 
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-bg-strong)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            Properties
                          </button>
                          {(userRole === 'super_admin' || doc.uploaded_by === session?.user?.email || doc.uploaded_by === 'Unknown' || !doc.uploaded_by) && (
                            <button 
                              onClick={() => { onDelete(doc.name); setOpenMenu(null); }} 
                              style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--danger-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {domainDocuments.length > 0 && (
              <button 
                className="secondary-button" 
                style={{ width: '100%', marginTop: 8, fontSize: '0.8rem', padding: '6px' }}
                onClick={() => setFullScreenKB(true)}
              >
                View Domain Knowledge Base
              </button>
            )}
          </div>
        )
      )}


    </div>
  );
}

export function AllDocumentsModal({ documents, docDomains, session, userRole, onDelete, setPropertiesModal, setSummaryModal, onClose, isFullScreen }) {
  const [sortBy, setSortBy] = useState('date');
  const [typeFilter, setTypeFilter] = useState('All');
  const [openMenu, setOpenMenu] = useState(null);

  const [ownershipFilter, setOwnershipFilter] = useState('All');

  const getDocType = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'PDF';
    if (ext === 'txt') return 'TXT';
    if (['doc', 'docx'].includes(ext)) return 'WORD';
    if (['ppt', 'pptx'].includes(ext)) return 'PPT';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'EXCEL';
    if (ext === 'json') return 'JSON';
    return ext.toUpperCase();
  };

  const types = ['All', 'PDF', 'WORD', 'EXCEL', 'PPT', 'JSON', 'TXT'];

  const sortOptions = [
    {value: 'date', label: 'Time (Latest First)'},
    {value: 'name', label: 'Alphabetical (A-Z)'},
    {value: 'uploaded_by', label: 'Uploaded By'}
  ];
  const typeOptions = types.map(t => ({value: t, label: t}));
  const ownershipOptions = [
    {value: 'All', label: 'All'},
    {value: 'Me', label: 'Uploaded by Me'},
    {value: 'Others', label: 'Uploaded by Others'}
  ];

  const filteredDocs = documents.filter(d => {
    const matchesType = typeFilter === 'All' || getDocType(d.name) === typeFilter;
    const matchesOwnership = 
      ownershipFilter === 'All' ? true :
      ownershipFilter === 'Me' ? d.uploaded_by === session?.user?.email :
      ownershipFilter === 'Others' ? d.uploaded_by !== session?.user?.email : true;
    return matchesType && matchesOwnership;
  });
  
  const sortedDocs = [...filteredDocs].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'date') return (b.date || '').localeCompare(a.date || '');
    if (sortBy === 'uploaded_by') return (a.uploaded_by || '').localeCompare(b.uploaded_by || '');
    return 0;
  });

  if (isFullScreen) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>Knowledge Base Directory</h2>
          <button className="primary-button" onClick={onClose} style={{ padding: '6px 16px', borderRadius: 8 }}>Back to Chat</button>
        </div>
        
        <div style={{ padding: '16px 0', display: 'flex', gap: 16, borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>Sort:</span>
            <div style={{ height: 34 }}>
              <CustomDropdown value={sortBy} options={sortOptions} onChange={setSortBy} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>Type:</span>
            <div style={{ height: 34 }}>
              <CustomDropdown value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>Ownership:</span>
            <div style={{ height: 34 }}>
              <CustomDropdown value={ownershipFilter} options={ownershipOptions} onChange={setOwnershipFilter} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 24 }}>
          <div className="document-list">
            {sortedDocs.map(doc => {
              const dom = docDomains[doc.domain] || { name: 'General', color: '#64748b' };
              const canDelete = userRole === 'super_admin' || doc.uploaded_by === session?.user?.email || doc.uploaded_by === 'Unknown' || !doc.uploaded_by;
              return (
                <div key={doc.id} className="kb-doc-item" style={{ marginBottom: 16, padding: '16px', background: 'var(--card-bg)' }}>
                  <div className="kb-doc-info">
                    <div className="kb-doc-icon" style={{ background: dom.color + '15', color: dom.color, width: 40, height: 40 }}>
                      <FileText size={20} />
                    </div>
                    <div className="kb-doc-details">
                      <p title={doc.name} style={{ fontSize: '1rem', marginBottom: 4 }}>{doc.name}</p>
                      <span style={{ display: 'flex', gap: 16, fontSize: '0.85rem' }}>
                        <span>{doc.size}</span>
                        <span>{dom.name}</span>
                        <span>{getDocType(doc.name)}</span>
                        <span>By: {doc.uploaded_by || 'Unknown'}</span>
                        {doc.date && doc.date !== 'Unknown' && <span>{doc.date}</span>}
                      </span>
                    </div>
                  </div>
                    <div className="kb-doc-actions" style={{ position: 'relative' }}>
                      <button 
                        className="icon-btn" 
                        onClick={() => setOpenMenu(openMenu === doc.name ? null : doc.name)}
                      >
                        <MoreVertical size={20} />
                      </button>
                      
                      {openMenu === doc.name && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 4, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 140 }}>
                          <button 
                            onClick={() => { setSummaryModal(doc); setOpenMenu(null); }} 
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-bg-strong)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            Summary
                          </button>
                          <button 
                            onClick={() => { setPropertiesModal(doc); setOpenMenu(null); }} 
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-bg-strong)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            Properties
                          </button>
                          {canDelete && (
                            <button 
                              onClick={() => { onDelete(doc.name); setOpenMenu(null); }} 
                              style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--danger-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 800, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>All Indexed Assets</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        
        <div style={{ padding: '16px 24px', display: 'flex', gap: 16, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>Sort:</span>
            <div style={{ height: 34 }}>
              <CustomDropdown value={sortBy} options={sortOptions} onChange={setSortBy} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>Type:</span>
            <div style={{ height: 34 }}>
              <CustomDropdown value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>Ownership:</span>
            <div style={{ height: 34 }}>
              <CustomDropdown value={ownershipFilter} options={ownershipOptions} onChange={setOwnershipFilter} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg-color)' }}>
          <div className="document-list">
            {sortedDocs.map(doc => {
              const dom = docDomains[doc.domain] || { name: 'General', color: '#64748b' };
              const canDelete = userRole === 'super_admin' || doc.uploaded_by === session?.user?.email || doc.uploaded_by === 'Unknown' || !doc.uploaded_by;
              return (
                <div key={doc.id} className="kb-doc-item" style={{ marginBottom: 12 }}>
                  <div className="kb-doc-info">
                    <div className="kb-doc-icon" style={{ background: dom.color + '15', color: dom.color }}>
                      <FileText size={16} />
                    </div>
                    <div className="kb-doc-details">
                      <p title={doc.name}>{doc.name}</p>
                      <span style={{ display: 'flex', gap: 12 }}>
                        <span>{doc.size}</span>
                        <span>{dom.name}</span>
                        <span>{getDocType(doc.name)}</span>
                        <span>By: {doc.uploaded_by || 'Unknown'}</span>
                        {doc.date && doc.date !== 'Unknown' && <span>{doc.date}</span>}
                      </span>
                    </div>
                  </div>
                    <div className="kb-doc-actions" style={{ position: 'relative' }}>
                      <button 
                        className="icon-btn" 
                        onClick={() => setOpenMenu(openMenu === doc.name ? null : doc.name)}
                      >
                        <MoreVertical size={16} />
                      </button>
                      
                      {openMenu === doc.name && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 4, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 140 }}>
                          <button 
                            onClick={() => { setSummaryModal(doc); setOpenMenu(null); }} 
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-bg-strong)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            Summary
                          </button>
                          <button 
                            onClick={() => { setPropertiesModal(doc); setOpenMenu(null); }} 
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--card-bg-strong)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            Properties
                          </button>
                          {canDelete && (
                            <button 
                              onClick={() => { onDelete(doc.name); setOpenMenu(null); }} 
                              style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--danger-color)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.2s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                </div>
              );
            })}
            {sortedDocs.length === 0 && (
              <p style={{ color: 'var(--muted-text)', textAlign: 'center', marginTop: 40 }}>No documents match your filters.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
