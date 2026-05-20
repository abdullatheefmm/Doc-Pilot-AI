import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import { Bot, ChevronDown, ChevronRight, Database, Globe, Lock, Download, Moon, Send, Sparkles, SunMedium, ThumbsDown, ThumbsUp, UploadCloud, User, Trash2, X } from 'lucide-react';
import AnalyticsPanel from './components/AnalyticsPanel';
import KnowledgeBasePanel from './components/KnowledgeBasePanel';
import { ConfidenceGauge, PipelineBar, QueryTimeline, RetrievalScoreBars, renderMarkdown, ArchitectureDiagram } from './components/Visuals';

const API_URL = 'http://127.0.0.1:8000/api';
const SESSION_STORAGE_KEY = 'nexus-session-id';
const THEME_STORAGE_KEY = 'nexus-theme';

const createSessionId = () => `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function App() {
  const [sessionId, setSessionId] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  // Pipeline State
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [currentStreamId, setCurrentStreamId] = useState(null);
  
  // Settings & Data
  const [topK, setTopK] = useState(4);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.15);
  const [retrievalMode, setRetrievalMode] = useState('hybrid');
  const [activeDomainFilter, setActiveDomainFilter] = useState('');
  const [documents, setDocuments] = useState([]);
  const [domains, setDomains] = useState([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState('settings'); // settings, analytics, kb
  const [fullScreenAnalytics, setFullScreenAnalytics] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [feedbackState, setFeedbackState] = useState({});
  const [passwordModal, setPasswordModal] = useState({ isOpen: false, file: null, filename: null, url: null, action: null, targetDomain: 'general' });
  const [archModalOpen, setArchModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [toasts, setToasts] = useState([]);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'analytics') setFullScreenAnalytics(false);
  };

  useEffect(() => {
    const existingSession = localStorage.getItem(SESSION_STORAGE_KEY) || createSessionId();
    localStorage.setItem(SESSION_STORAGE_KEY, existingSession);
    setSessionId(existingSession);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (sessionId) {
      fetchDomains();
      fetchDocuments();
      fetchHistory(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming, pipelineStep]);

  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const fetchDomains = async () => {
    try {
      const res = await fetch(`${API_URL}/domains`);
      const data = await res.json();
      setDomains(data.domains || []);
    } catch (e) { console.error(e); }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_URL}/documents`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (e) { console.error(e); }
  };

  const fetchHistory = async (sid) => {
    try {
      const res = await fetch(`${API_URL}/history?session_id=${sid}`);
      const data = await res.json();
      const historyMessages = (data.history || []).map((item, i) => ({
        id: `history-${i}`,
        role: item.role === 'assistant' ? 'assistant' : 'user',
        text: item.content,
        sources: [],
        retrieval_scores: [],
      }));
      setMessages(historyMessages);
    } catch (e) { console.error(e); }
  };

  const handlePasswordSubmit = async () => {
    const { action, filename, file, url, targetDomain } = passwordModal;
    const pwd = adminPassword;
    setPasswordModal({ isOpen: false, file: null, filename: null, url: null, action: null, targetDomain: 'general' });
    setAdminPassword('');
    if (!pwd) return;

    if (action === 'delete') {
      try {
        const res = await fetch(`${API_URL}/documents/${filename}?password=${encodeURIComponent(pwd)}`, { method: 'DELETE' });
        if (res.ok) {
          showToast(`Deleted ${filename}`);
          fetchDocuments();
        } else {
          showToast((await res.json()).detail || 'Failed to delete', 'error');
        }
      } catch (e) { showToast(e.message, 'error'); }
    } else if (action === 'upload') {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_URL}/upload?password=${encodeURIComponent(pwd)}&domain=${encodeURIComponent(targetDomain)}`, {
          method: 'POST', body: formData,
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        showToast(`Indexed ${filename} into ${targetDomain}`);
        fetchDocuments();
        setActiveTab('kb');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        setUploading(false);
      }
    } else if (action === 'ingest-url') {
      setUploading(true);
      try {
        const res = await fetch(`${API_URL}/ingest-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, password: pwd, domain: targetDomain })
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Ingestion failed');
        showToast(`Ingested URL into ${targetDomain}`);
        setUrlInput('');
        fetchDocuments();
        setActiveTab('kb');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleSend = async () => {
    const query = inputValue.trim();
    if (!query || isStreaming || !sessionId) return;

    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text: query }]);
    setInputValue('');
    setIsStreaming(true);
    setPipelineStep(0); // Query Received
    
    const streamId = `assistant-${Date.now()}`;
    setCurrentStreamId(streamId);
    
    setMessages(prev => [...prev, { 
      id: streamId, role: 'assistant', text: '', sources: [], 
      confidence: null, intent: '', rewrittenQuery: '', retrieval_scores: [], timing: {} 
    }]);

    try {
      setPipelineStep(1); // Rewrite
      
      const response = await fetch(`${API_URL}/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, session_id: sessionId, top_k: topK, 
          threshold: similarityThreshold, retrieval_mode: retrievalMode, domain: activeDomainFilter || null 
        }),
      });

      if (!response.ok) throw new Error('Failed to generate answer');

      setPipelineStep(2); // Retrieve

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'meta') {
                setPipelineStep(3); // Ground
                setMessages(prev => prev.map(m => m.id === streamId ? { 
                  ...m, confidence: data.confidence, intent: data.intent, 
                  sources: data.sources, retrieval_scores: data.retrieval_scores,
                  rewrittenQuery: data.rewritten_query, 
                  timing: { retrieve_ms: data.retrieve_ms }
                } : m));
                setPipelineStep(4); // Generate (start streaming text)
              } else if (data.type === 'token') {
                setMessages(prev => prev.map(m => m.id === streamId ? { ...m, text: m.text + data.content } : m));
              } else if (data.type === 'done') {
                setPipelineStep(5); // Cite
                setMessages(prev => prev.map(m => m.id === streamId ? { 
                  ...m, timing: { ...m.timing, generate_ms: data.generate_ms }
                } : m));
              }
            } catch (e) { console.error('SSE JSON parse error', e); }
          }
        }
      }
      setPipelineStep(6); // All Done
    } catch (e) {
      showToast(e.message, 'error');
      setMessages(prev => prev.map(m => m.id === streamId ? { ...m, text: 'An error occurred during generation.' } : m));
    } finally {
      setIsStreaming(false);
      setTimeout(() => setPipelineStep(-1), 2000);
    }
  };

  const handleExportChat = async () => {
    try {
      const res = await fetch(`${API_URL}/export/chat/${sessionId}`);
      const data = await res.json();
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus_chat_export_${Date.now()}.md`;
      a.click();
    } catch (e) { showToast('Export failed', 'error'); }
  };

  const handleClearChat = async () => {
    if (!sessionId) return;
    await fetch(`${API_URL}/history/${sessionId}`, { method: 'DELETE' });
    setMessages([]);
    showToast('Chat history cleared');
  };

  return (
    <div className="app-shell">
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>

      <aside className="sidebar-card">
        <div className="sidebar-header">
          <div className="brand-lockup">
            <div className="brand-orb"><Sparkles size={18} /></div>
            <div>
              <h1>DocPilot AI</h1>
            </div>
          </div>
        </div>

        <div className="sidebar-tabs">
          <button className={`sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabChange('settings')}>Settings</button>
          <button className={`sidebar-tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => handleTabChange('analytics')}>Analytics</button>
          <button className={`sidebar-tab ${activeTab === 'kb' ? 'active' : ''}`} onClick={() => handleTabChange('kb')}>Knowledge</button>
        </div>

        <div className="sidebar-content">
          {activeTab === 'settings' && (
            <div>
              <div className="sidebar-section">
                <label className="setting-label"><strong>Retrieval Domain</strong></label>
                <select className="setting-select" value={activeDomainFilter} onChange={e => setActiveDomainFilter(e.target.value)}>
                  <option value="">All Domains (Global Search)</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="sidebar-section">
                <label className="setting-label"><strong>Retrieval Strategy</strong></label>
                <select className="setting-select" value={retrievalMode} onChange={e => setRetrievalMode(e.target.value)}>
                  <option value="hybrid">Hybrid (FAISS + BM25 + RRF)</option>
                  <option value="semantic">Semantic Only (FAISS)</option>
                  <option value="keyword">Keyword Only (BM25)</option>
                </select>
              </div>
              <div className="sidebar-section">
                <label className="setting-label">
                  <strong>Top K Chunks</strong>
                  <span>{topK}</span>
                </label>
                <input type="range" min="1" max="10" value={topK} onChange={e => setTopK(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }}/>
              </div>
              <div className="sidebar-section">
                <label className="setting-label">
                  <strong>Similarity Match</strong>
                  <span>{similarityThreshold.toFixed(2)}</span>
                </label>
                <input type="range" min="0" max="1" step="0.05" value={similarityThreshold} onChange={e => setSimilarityThreshold(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer' }}/>
              </div>
              
              <div className="sidebar-section" style={{ marginTop: 32 }}>
                <p className="sidebar-title" style={{ marginBottom: 12 }}>Suggested questions</p>
                <div className="suggestion-list">
                  <button className="suggestion-chip" onClick={() => { setInputValue('What are query parameters in FastAPI?'); handleSend(); }}>
                    What are query parameters in FastAPI?
                  </button>
                  <button className="suggestion-chip" onClick={() => { setInputValue('Compare path parameters and query parameters.'); handleSend(); }}>
                    Compare path parameters and query parameters.
                  </button>
                  <button className="suggestion-chip" onClick={() => { setInputValue('Summarize the FastAPI introduction section.'); handleSend(); }}>
                    Summarize the FastAPI introduction section.
                  </button>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'analytics' && (
            <AnalyticsPanel isSidebar={true} onToggleFullScreen={() => setFullScreenAnalytics(!fullScreenAnalytics)} />
          )}
          {activeTab === 'kb' && (
            <KnowledgeBasePanel 
              documents={documents} 
              setDocuments={setDocuments} 
              domains={domains} 
              fetchDocuments={fetchDocuments} 
              onDelete={(filename) => setPasswordModal({ isOpen: true, filename, action: 'delete', targetDomain: 'general' })}
              onViewArchitecture={() => setArchModalOpen(true)}
            />
          )}
        </div>

        {(activeTab === 'settings' || activeTab === 'kb') && (
          <div className="upload-panel">
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                className="secondary-button"
                style={{ flex: 1, padding: '12px 8px' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="PDF, Word, PowerPoint, Excel, CSV, JSON, TXT, Markdown"
              >
                <UploadCloud size={18} style={{ margin: '0 auto 6px' }} />
                <div style={{ fontSize: '.75rem' }}>Upload File</div>
                <div style={{ fontSize: '.65rem', color: 'var(--muted-text)', marginTop: 2 }}>PDF·DOCX·PPTX·XLSX·CSV·JSON</div>
              </button>
              <div style={{ flex: 1, padding: '12px 8px', border: '1px dashed var(--border-color)', borderRadius: 12 }}>
                <Globe size={18} style={{ margin: '0 auto 6px', color: 'var(--muted-text)' }} />
                <div style={{ fontSize: '.75rem', color: 'var(--muted-text)' }}>Ingest URL</div>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.json"
              hidden
              onChange={e => e.target.files?.[0] && setPasswordModal({
                isOpen: true,
                file: e.target.files[0],
                filename: e.target.files[0].name,
                action: 'upload',
                targetDomain: 'general'
              })}
            />
            
            <div className="url-ingest-row">
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://..." disabled={uploading}/>
              <button className="primary-button" style={{ padding: '8px', borderRadius: 10 }} onClick={() => urlInput && setPasswordModal({ isOpen: true, url: urlInput, action: 'ingest-url', targetDomain: 'general' })} disabled={!urlInput || uploading}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </aside>

      <main className="chat-card">
        <header className="chat-header">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {fullScreenAnalytics ? 'Enterprise Analytics Dashboard' : 'Query Knowledge Base'}
              {!fullScreenAnalytics && activeDomainFilter && <span className="meta-badge domain-badge">Scoped to: {domains.find(d => d.id === activeDomainFilter)?.name}</span>}
            </h2>
          </div>
          <div className="header-actions">
            <button className="secondary-button" onClick={handleExportChat} title="Export Chat"><Download size={14} /></button>
            <button className="secondary-button" onClick={handleClearChat} title="Clear Chat"><Trash2 size={14} /></button>
            <div className="status-badge"><span className="status-dot" /> Llama 3.3 Connected</div>
            <button className="theme-toggle" onClick={() => setTheme(p => p === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <SunMedium size={16} /> : <Moon size={16} />}</button>
          </div>
        </header>

        {fullScreenAnalytics ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
            <AnalyticsPanel isSidebar={false} />
          </div>
        ) : (
          <>
            {pipelineStep >= 0 && <PipelineBar activeStep={pipelineStep} />}

            <section className="chat-stream">
          {messages.length === 0 ? (
            <div className="empty-state">
              <Bot size={48} />
              <h3>How can I help you today?</h3>
              <p>Ask a question, and I'll search the enterprise knowledge base to provide a grounded, cited answer.</p>
            </div>
          ) : messages.map((message) => (
            <article key={message.id} className={`message-row ${message.role}`}>
              <div className="avatar">
                {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className="message-panel">
                <div className="message-meta" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <strong>{message.role === 'user' ? 'You' : 'DocPilot AI'}</strong>
                    {message.intent && <span className="meta-badge">Intent: {message.intent}</span>}
                    {message.cached && <span className="meta-badge cached">⚡ Cached Answer</span>}
                  </div>
                  {message.role === 'assistant' && typeof message.confidence === 'number' && (
                    <ConfidenceGauge value={message.confidence} size={36} />
                  )}
                </div>

                <div style={{ minHeight: message.id === currentStreamId ? 24 : 0 }}>
                  {message.role === 'user' ? message.text : renderMarkdown(message.text)}
                  {isStreaming && message.id === currentStreamId && <span className="typing-cursor" />}
                </div>

                {message.sources?.length > 0 && (
                  <details className="citation-panel">
                    <summary>View {message.sources.length} Sources</summary>
                    <RetrievalScoreBars scores={message.retrieval_scores} />
                    <div className="citation-list">
                      {message.sources.map((s, i) => (
                        <div key={i} className="citation-card">
                          <p>{s.document}</p>
                          <span>{s.text}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {message.timing && Object.keys(message.timing).length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ fontSize: '.75rem', color: 'var(--muted-text)', cursor: 'pointer' }}>Pipeline Timing</summary>
                    <QueryTimeline timing={message.timing} />
                  </details>
                )}

                {message.role === 'assistant' && message.text && !isStreaming && (
                  <div className="feedback-row">
                    <button className={`feedback-button ${feedbackState[message.id] === 'helpful' ? 'active' : ''}`} onClick={() => {}}>
                      <ThumbsUp size={14} /> Helpful
                    </button>
                    <button className={`feedback-button ${feedbackState[message.id] === 'not-helpful' ? 'active' : ''}`} onClick={() => {}}>
                      <ThumbsDown size={14} /> Not helpful
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
          <div ref={messagesEndRef} />
        </section>

        <footer className="composer">
          <div className="composer-box">
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={activeDomainFilter ? `Search in ${domains.find(d => d.id === activeDomainFilter)?.name}...` : "Ask a grounded question across all domains..."}
              disabled={isStreaming}
            />
            <button className="primary-button" onClick={handleSend} disabled={isStreaming || !inputValue.trim()} style={{ padding: '8px 16px', borderRadius: 10 }}>
              <Send size={14} /> Send
            </button>
          </div>
        </footer>
          </>
        )}
      </main>

      {/* Password Modal */}
      {passwordModal.isOpen && (
        <div className="modal-overlay" onClick={() => setPasswordModal({ isOpen: false, targetDomain: 'general' })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={18} style={{ color: 'var(--warning-color)' }} /> Admin Action Required
              </h2>
              <button className="icon-btn" onClick={() => setPasswordModal({ isOpen: false, targetDomain: 'general' })}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '.85rem', color: 'var(--muted-text)', marginBottom: 16 }}>
                Authorize {passwordModal.action} for <strong>{passwordModal.filename || passwordModal.url}</strong>
              </p>
              
              {passwordModal.action !== 'delete' && (
                <>
                  <label className="setting-label"><strong>Assign to Domain</strong></label>
                  <select value={passwordModal.targetDomain} onChange={e => setPasswordModal(p => ({ ...p, targetDomain: e.target.value }))}>
                    {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </>
              )}
              
              <label className="setting-label"><strong>Admin Password</strong></label>
              <input type="password" autoFocus value={adminPassword} onChange={e => setAdminPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()} placeholder="Enter password..." />
              
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setPasswordModal({ isOpen: false, targetDomain: 'general' })}>Cancel</button>
                <button className="primary-button" onClick={handlePasswordSubmit}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Architecture Modal */}
      {archModalOpen && (
        <div className="modal-overlay" onClick={() => setArchModalOpen(false)}>
          <div className="modal-content arch-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>System Architecture</h2>
              <button className="icon-btn" onClick={() => setArchModalOpen(false)}><X size={18} /></button>
            </div>
            <div className="arch-svg-wrap">
              <ArchitectureDiagram />
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
    </div>
  );
}
