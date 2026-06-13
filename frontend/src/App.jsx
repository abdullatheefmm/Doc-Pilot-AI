import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import { Bot, ChevronDown, ChevronRight, Database, Globe, Lock, Download, Moon, Send, Square, Sparkles, SunMedium, ThumbsDown, ThumbsUp, UploadCloud, User, Trash2, X, XCircle, AlertTriangle, Loader2, Ghost, Info, FileText, Paperclip, ImageIcon, Network } from 'lucide-react';
import AnalyticsPanel from './components/AnalyticsPanel';
import KnowledgeBasePanel, { AllDocumentsModal } from './components/KnowledgeBasePanel';
import { ConfidenceGauge, PipelineBar, QueryTimeline, RetrievalScoreBars, renderMarkdown, ArchitectureDiagram } from './components/Visuals';
import Auth from './components/Auth';
import AdminDashboard from './components/AdminDashboard';
import CustomDropdown from './components/CustomDropdown';
import DynamicChartRenderer from './components/DynamicChartRenderer';
import KnowledgeGraphViewer from './components/KnowledgeGraphViewer';
import { supabase } from './supabaseClient';

// Global fetch interceptor for auth headers
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  if (typeof resource === 'string' && resource.startsWith('http://127.0.0.1:8000/api')) {
    const sessionStr = localStorage.getItem('docpilot-session-data');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session?.access_token) {
          config = config || {};
          config.headers = {
            ...config.headers,
            'Authorization': 'Bearer ' + session.access_token
          };
        }
      } catch(e) {}
    }
  }
  return originalFetch(resource, config);
};

const API_URL = 'http://127.0.0.1:8000/api';
const SESSION_STORAGE_KEY = 'nexus-session-id';
const THEME_STORAGE_KEY = 'nexus-theme';

const createSessionId = () => `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const OPENROUTER_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
];

export default function App() {
    const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('docpilot-session-data');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogout = () => {
    localStorage.removeItem('docpilot-session-data');
    setSession(null);
  };


  const [sessionId, setSessionId] = useState('');
  const [incognitoMode, setIncognitoMode] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent) => {
      const newWidth = Math.max(200, Math.min(600, startWidth + (moveEvent.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  const [theme, setTheme] = useState(localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  const textareaRef = useRef(null);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 150) + 'px';
    }
  }, [inputValue]);

  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  
  // Pipeline State
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [currentStreamId, setCurrentStreamId] = useState(null);
  const [abortController, setAbortController] = useState(null);
  const [deleteChatModal, setDeleteChatModal] = useState({ isOpen: false, id: null });
  
  // Settings & Data
  const [topK, setTopK] = useState(4);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.15);
  const [retrievalMode, setRetrievalMode] = useState('hybrid');
  const [activeDomainFilter, setActiveDomainFilter] = useState('');
  const [documents, setDocuments] = useState([]);
  const [domains, setDomains] = useState([]);
  const [chartTheme, setChartTheme] = useState(localStorage.getItem('docpilot-chart-theme') || 'default');
  
  // UI State
  const [userRole, setUserRole] = useState(session?.user?.user_metadata?.role || 'general');
  const [userStatus, setUserStatus] = useState('active'); // Assume active initially unless proven otherwise
  const [userFullName, setUserFullName] = useState(session?.user?.user_metadata?.full_name || 'User Profile');
  const [activeTab, setActiveTab] = useState(userRole === 'super_admin' ? 'admin' : 'settings');

  useEffect(() => {
    if (session?.user?.id) {
      supabase.from('user_profiles').select('role, full_name, phone_number, status').eq('user_id', session.user.id).single()
        .then(({ data }) => {
          if (data) {
            setUserRole(data.role || 'general');
            setUserStatus(data.status || (data.role === 'pending' ? 'pending' : 'active'));
            if (data.full_name) {
              setUserFullName(data.full_name);
              setEditName(data.full_name);
            }
            if (data.phone_number) {
              setEditPhone(data.phone_number);
            }
            if (data.status !== 'pending' && data.status !== 'revoked') {
                if (data.role === 'super_admin') {
                  setActiveTab('admin');
                } else {
                  setActiveDomainFilter(data.role);
                  setActiveTab('settings'); // Force non-admins to stay out of admin tab
                }
            }
          }
        });
    } else {
      setUserRole('general');
      setUserStatus('pending');
    }
  }, [session]);
  const [fullScreenAnalytics, setFullScreenAnalytics] = useState(false);
  const [fullScreenKB, setFullScreenKB] = useState(false);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);
  const [propertiesModal, setPropertiesModal] = useState(null);
  const [summaryModal, setSummaryModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [feedbackState, setFeedbackState] = useState({});
  const [passwordModal, setPasswordModal] = useState({ isOpen: false, file: null, filename: null, url: null, action: null, targetDomain: 'general' });
  const [adminPassword, setAdminPassword] = useState('');
  const [toasts, setToasts] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [selectedModel, setSelectedModel] = useState(OPENROUTER_MODELS[0].id);

  const fetchSessions = async () => {
    try {
      const userId = session?.user?.id;
      const url = userId ? `${API_URL}/history/sessions?user_id=${encodeURIComponent(userId)}` : `${API_URL}/history/sessions`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setChatSessions(data.sessions || []);
      }
    } catch (e) { console.error(e); }
  };

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

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

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState(session?.user?.user_metadata?.full_name || '');
  const [editPhone, setEditPhone] = useState(session?.user?.user_metadata?.phone_number || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    if (session) {
      fetchDomains();
      fetchDocuments();
      fetchSessions();
      if (sessionId) fetchHistory(sessionId);
    }
  }, [session, sessionId]);

  const handleUpdateProfile = async () => {
    setUpdatingProfile(true);
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: editName, phone_number: editPhone })
      });
      if (!res.ok) throw new Error('Failed to update profile');
      showToast('Profile updated successfully!');
      setProfileModalOpen(false);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setUpdatingProfile(false);
    }
  };

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
    if (action === 'delete') {
      try {
        const res = await fetch(`${API_URL}/documents/${filename}?password=${encodeURIComponent(pwd)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
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
        const params = new URLSearchParams({
          domain: targetDomain,
          password: pwd
        });
        const res = await fetch(`${API_URL}/upload?${params.toString()}`, {
          method: 'POST', body: formData,
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        showToast(`Uploaded ${filename} into ${targetDomain}`);
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
          body: JSON.stringify({ url: passwordModal.url, password: pwd, domain: targetDomain, user_id: session?.user?.email })
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

    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text: query, attachedImage }]);
    setInputValue('');
    setAttachedImage(null);
    setIsStreaming(true);
    setPipelineStep(0); // Query Received
    
    const streamId = `assistant-${Date.now()}`;
    setCurrentStreamId(streamId);
    
    setMessages(prev => [...prev, { 
      id: streamId, role: 'assistant', text: '', sources: [], 
      confidence: null, intent: '', rewrittenQuery: '', retrieval_scores: [], timing: {}, chart_data: null, reasoning: '' 
    }]);

    try {
      setPipelineStep(1); // Rewrite
      
      const controller = new AbortController();
      setAbortController(controller);
      
      const response = await fetch(`${API_URL}/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ 
          query, session_id: sessionId, top_k: topK, 
          threshold: similarityThreshold, retrieval_mode: retrievalMode, domain: activeDomainFilter || null,
          search_mode: webSearchEnabled ? "web" : "internal", model: selectedModel,
          user_id: session?.user?.id || null, user_role: userRole || "general",
          incognito: incognitoMode
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
                  timing: { retrieve_ms: data.retrieve_ms },
                  chart_data: data.chart_data,
                  reasoning: data.reasoning
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
      if (e.name === 'AbortError') {
        showToast('Generation stopped', 'info');
      } else {
        showToast(e.message, 'error');
        setMessages(prev => prev.map(m => m.id === streamId ? { ...m, text: 'An error occurred during generation.' } : m));
      }
    } finally {
      setIsStreaming(false);
      setAbortController(null);
      setTimeout(() => setPipelineStep(-1), 2000);
      fetchSessions();
    }
  };

  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
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

  const handleClearChat = () => {
    if (!sessionId) return;
    setDeleteChatModal({ isOpen: true, id: sessionId });
  };

  const handleDeleteSession = (id, e) => {
    e.stopPropagation();
    setDeleteChatModal({ isOpen: true, id });
  };

  const confirmDeleteChat = async () => {
    if (!deleteChatModal.id) return;
    try {
      const res = await fetch(`${API_URL}/history/${deleteChatModal.id}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Bearer ${session.access_token}` } 
      });
      if (res.ok) {
        if (deleteChatModal.id === sessionId) {
          setSessionId(createSessionId());
          setMessages([]);
        }
        fetchSessions();
        showToast('Chat session deleted');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteChatModal({ isOpen: false, id: null });
    }
  };

  if (!session) {
    return (
      <div className="app-container">
        <Auth onAuthSuccess={(s) => {
          localStorage.setItem('docpilot-session-data', JSON.stringify(s));
          setSession(s);
        }} />
      </div>
    );
  }

  if (userStatus === 'pending') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        height: '100vh', width: '100vw', 
        background: 'radial-gradient(circle at 50% 0%, var(--card-bg-strong) 0%, var(--bg-color) 100%)', 
        color: 'var(--text-color)', position: 'relative', overflow: 'hidden'
      }}>
        <style>{`
          @keyframes popIn {
            0% { transform: scale(0.9); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes floatPulse {
            0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
            50% { transform: translateY(-5px) scale(1.02); box-shadow: 0 0 20px 5px rgba(34, 197, 94, 0.2); }
          }
        `}</style>
        
        {/* Background Glows */}
        <div style={{ position: 'absolute', top: '10%', left: '20%', width: '30vw', height: '30vw', background: 'var(--accent-color)', opacity: 0.05, filter: 'blur(80px)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '20%', width: '30vw', height: '30vw', background: 'var(--primary-color)', opacity: 0.05, filter: 'blur(80px)', borderRadius: '50%' }} />
        
        <div style={{
          background: 'linear-gradient(145deg, rgba(24, 24, 27, 0.8), rgba(18, 18, 20, 0.8))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 24,
          padding: '48px 40px',
          textAlign: 'center',
          maxWidth: 460,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          zIndex: 10
        }}>
          <div style={{ 
            width: 80, height: 80, 
            background: 'rgba(34, 197, 94, 0.1)', 
            borderRadius: '50%', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            animation: 'floatPulse 3s infinite ease-in-out'
          }}>
            <Sparkles size={40} color="#22c55e" />
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 12px 0', color: '#fff' }}>You're all set!</h2>
          <p style={{ color: 'var(--muted-text)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: 32 }}>
            Your DocPilot Enterprise account has been successfully created! We are just waiting for a Super Admin to assign your domain access and activate your account.
            <br/><br/>
            You will be notified once you're ready to fly.
          </p>
          <button 
            onClick={handleLogout} 
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              color: 'var(--text-color)', 
              padding: '14px 24px', 
              borderRadius: 12, 
              cursor: 'pointer', 
              transition: 'all 0.2s',
              fontWeight: 600,
              width: '100%'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  if (userStatus === 'revoked') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        height: '100vh', width: '100vw', 
        background: 'radial-gradient(circle at 50% 0%, var(--card-bg-strong) 0%, var(--bg-color) 100%)', 
        color: 'var(--text-color)', position: 'relative', overflow: 'hidden'
      }}>
        {/* Background Glows */}
        <div style={{ position: 'absolute', top: '10%', left: '20%', width: '30vw', height: '30vw', background: '#ef4444', opacity: 0.05, filter: 'blur(80px)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '20%', width: '30vw', height: '30vw', background: '#b91c1c', opacity: 0.05, filter: 'blur(80px)', borderRadius: '50%' }} />
        
        <div style={{
          background: 'linear-gradient(145deg, rgba(24, 24, 27, 0.8), rgba(18, 18, 20, 0.8))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 24,
          padding: '48px 40px',
          textAlign: 'center',
          maxWidth: 460,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(239, 68, 68, 0.1)',
          animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          zIndex: 10
        }}>
          <div style={{ 
            width: 80, height: 80, 
            background: 'rgba(239, 68, 68, 0.1)', 
            borderRadius: '50%', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}>
            <XCircle size={40} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 12px 0', color: '#fff' }}>Access Denied</h2>
          <p style={{ color: 'var(--muted-text)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: 32 }}>
            Your request for a DocPilot Enterprise account has been rejected, or your access has been revoked by a Super Admin.
            <br/><br/>
            If you believe this is a mistake, please contact your IT administrator.
          </p>
          <button 
            onClick={handleLogout} 
            style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              color: '#ef4444', 
              padding: '14px 24px', 
              borderRadius: 12, 
              cursor: 'pointer', 
              transition: 'all 0.2s',
              fontWeight: 600,
              width: '100%'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className={`app-shell ${incognitoMode ? 'ghost-theme' : ''}`}>
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* Custom Delete Chat Modal */}
      {deleteChatModal.isOpen && (
        <div className="modal-overlay" onClick={() => setDeleteChatModal({ isOpen: false, id: null })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: 12, borderRadius: '50%' }}>
                  <AlertTriangle size={24} color="var(--warning-color)" />
                </div>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Delete Chat</h2>
              </div>
              <p style={{ color: 'var(--muted-text)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
                Are you sure you want to permanently delete this chat session? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setDeleteChatModal({ isOpen: false, id: null })}
                  style={{ padding: '8px 16px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-color)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteChat}
                  style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--warning-color)', border: 'none', color: '#fff', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <aside className="sidebar-card" style={{ width: sidebarWidth, flexShrink: 0, position: 'relative' }}>
        <div className="sidebar-header">
          <div className="brand-lockup">
            <div className="brand-orb"><Sparkles size={18} /></div>
            <div>
              <h1>DocPilot AI</h1>
            </div>
          </div>
        </div>

        <div className="sidebar-tabs">
          <button className={`sidebar-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabChange('settings')}>Control</button>
          <button className={`sidebar-tab ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => handleTabChange('analytics')}>Analytics</button>
          <button className={`sidebar-tab ${activeTab === 'kb' ? 'active' : ''}`} onClick={() => handleTabChange('kb')}>Knowledge</button>
          {userRole === 'super_admin' && (
            <button className={`sidebar-tab ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => handleTabChange('admin')} style={{ color: 'var(--accent-color)' }}>Admin</button>
          )}
        </div>

        <div className="sidebar-content">
          {activeTab === 'settings' && (
            <div>
              <div className="sidebar-section">
                <label className="setting-label"><strong>Retrieval Domain Access</strong></label>
                {userRole === 'super_admin' ? (
                  <select className="setting-select" value={activeDomainFilter} onChange={e => setActiveDomainFilter(e.target.value)}>
                    <option value="">All Domains (Global Search)</option>
                    {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                ) : (
                  <div className="setting-select" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--primary-color)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'default' }}>
                    {domains.find(d => d.id === userRole)?.name || userRole} (Restricted)
                  </div>
                )}
              </div>
              <div className="sidebar-section" style={{ zIndex: 12 }}>
                <label className="setting-label"><strong>Retrieval Strategy</strong></label>
                <div style={{ width: '100%', height: '34px', position: 'relative' }}>
                  <CustomDropdown 
                    value={retrievalMode}
                    options={[
                      { value: "hybrid", label: "Hybrid (FAISS + BM25 + RRF)" },
                      { value: "semantic", label: "Semantic Only (FAISS)" },
                      { value: "keyword", label: "Keyword Only (BM25)" }
                    ]}
                    onChange={setRetrievalMode}
                  />
                </div>
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
              <div className="sidebar-section" style={{ zIndex: 11 }}>
                <label className="setting-label"><strong>Chart Theme Style</strong></label>
                <div style={{ width: '100%', height: '34px', position: 'relative' }}>
                  <CustomDropdown 
                    value={chartTheme}
                    options={[
                      { value: "default", label: "Default / Corporate" },
                      { value: "forest", label: "Forest / Organic" },
                      { value: "dark", label: "Dark / Minimalist" },
                      { value: "neutral", label: "Neutral / Hand-drawn" }
                    ]}
                    onChange={(v) => {
                      setChartTheme(v);
                      window.localStorage.setItem('docpilot-chart-theme', v);
                    }}
                  />
                </div>
              </div>
              
              <div className="sidebar-section" style={{ marginTop: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <p className="sidebar-title" style={{ margin: 0 }}>Previous Chats</p>
                  <button onClick={() => { setSessionId(createSessionId()); setMessages([]); }} style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 6, fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={12} /> New Chat
                  </button>
                </div>
                <div className="suggestion-list">
                  {chatSessions.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted-text)', padding: '8px 0' }}>No previous chats yet.</div>
                  ) : (
                    chatSessions.map(cs => (
                      <div key={cs.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button className="suggestion-chip" onClick={() => { setSessionId(cs.id); fetchHistory(cs.id); }} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{cs.title}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--muted-text)' }}>{new Date(cs.created_at).toLocaleDateString()}</div>
                        </button>
                        <button onClick={(e) => handleDeleteSession(cs.id, e)} style={{ background: 'transparent', border: 'none', color: 'var(--muted-text)', cursor: 'pointer', padding: '4px' }} title="Delete Chat">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
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
              session={session}
              userRole={userRole}
              setFullScreenKB={setFullScreenKB}
              propertiesModal={propertiesModal}
              setPropertiesModal={setPropertiesModal}
              summaryModal={summaryModal}
              setSummaryModal={setSummaryModal}
            />
          )}
        </div>

        {activeTab === 'kb' && !fullScreenKB && (
          <div className="upload-panel" style={incognitoMode ? { opacity: 0.5, pointerEvents: 'none', position: 'relative' } : {}}>
            {incognitoMode && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', borderRadius: 12, border: '1px solid var(--warning-color)' }}>
                <div style={{ color: 'var(--warning-color)', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Ghost size={18} /> Uploads Disabled in Ghost Mode
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                className="secondary-button"
                style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Upload Asset"
              >
                  {uploading ? (
                    <>
                      <div className="rich-loader" style={{ marginBottom: 6 }}>
                        <div className="rich-loader-dot"></div>
                        <div className="rich-loader-dot"></div>
                        <div className="rich-loader-dot"></div>
                      </div>
                      <div className="rich-pulse-text">Uploading...</div>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={20} style={{ margin: '0 auto 6px', color: 'var(--accent-color)' }} />
                      <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-color)' }}>Upload File</div>
                    </>
                  )}
              </button>
              <div style={{ flex: 1, padding: '12px 8px', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                <Globe size={20} style={{ margin: '0 auto 6px', color: 'var(--muted-text)' }} />
                <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--muted-text)' }}>Ingest URL</div>
                <div style={{ fontSize: '.65rem', color: 'var(--muted-text)', marginTop: 4 }}>Coming soon</div>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.json"
              hidden
              onChange={e => {
                if (e.target.files?.[0]) {
                  const selectedFile = e.target.files[0];
                  setPasswordModal({
                    isOpen: true,
                    file: selectedFile,
                    filename: selectedFile.name,
                    action: 'upload',
                    targetDomain: userRole === 'super_admin' ? 'general' : userRole
                  });
                }
                e.target.value = null;
              }}
              style={{ display: 'none' }}
            />
            
            <div className="url-ingest-row">
              <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://..." disabled={uploading}/>
              <button className="primary-button" style={{ padding: '8px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => urlInput && setPasswordModal({ isOpen: true, url: urlInput, action: 'ingest-url', targetDomain: userRole === 'super_admin' ? 'general' : userRole })} disabled={!urlInput || uploading}>
                {uploading ? (
                  <div className="rich-loader" style={{ margin: 0 }}>
                    <div className="rich-loader-dot" style={{ width: 4, height: 4 }}></div>
                    <div className="rich-loader-dot" style={{ width: 4, height: 4 }}></div>
                    <div className="rich-loader-dot" style={{ width: 4, height: 4 }}></div>
                  </div>
                ) : <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        )}
        {/* User Profile Footer */}
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.1)' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%' }} 
            onPointerDown={(e) => { 
              if (e.isTrusted && (e.pointerType === 'mouse' || e.pointerType === 'touch')) {
                setProfileModalOpen(true); 
              }
            }}
          >
            <div className="pill" style={{ background: 'var(--accent-color)', color: '#fff' }}>
              {(userFullName || session?.user?.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-color)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {userFullName}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted-text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {session?.user?.email}
              </div>
            </div>
          </div>
        </div>
        <div 
          className="sidebar-resizer"
          onMouseDown={handleMouseDown}
          style={{ 
            width: '6px', 
            cursor: 'col-resize', 
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 50,
            background: 'transparent',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--border-color)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ width: 2, height: 24, background: 'var(--muted-text)', borderRadius: 2, opacity: 0.5 }} />
        </div>
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
            <div className="search-mode-toggle" style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4, marginRight: 8 }}>
              <button 
                className={`mode-btn ${!webSearchEnabled ? 'active' : ''}`}
                onClick={() => setWebSearchEnabled(false)}
                style={{ padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', border: 'none', background: !webSearchEnabled ? 'var(--primary-color)' : 'transparent', color: !webSearchEnabled ? '#fff' : 'var(--muted-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, transition: 'all 0.2s' }}
              >
                <Database size={14} /> Internal Docs
              </button>
              <button 
                className={`mode-btn ${webSearchEnabled ? 'active' : ''}`}
                onClick={() => setWebSearchEnabled(true)}
                style={{ padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', border: 'none', background: webSearchEnabled ? 'var(--primary-color)' : 'transparent', color: webSearchEnabled ? '#fff' : 'var(--muted-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, transition: 'all 0.2s' }}
              >
                <Globe size={14} /> Web Search
              </button>
            </div>
            <button className="secondary-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowKnowledgeGraph(!showKnowledgeGraph)} title="Knowledge Graph View">
              <Network size={18} strokeWidth={2} color={showKnowledgeGraph ? 'var(--accent-color)' : 'var(--text-color)'} />
            </button>
            <button className="secondary-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleExportChat} title="Export Chat">
              <Download size={18} strokeWidth={2} color="var(--text-color)" />
            </button>
            <button className="secondary-button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleClearChat} title="Clear Chat">
              <Trash2 size={18} strokeWidth={2} color="var(--text-color)" />
            </button>
            <button 
              className={`secondary-button ${incognitoMode ? 'active' : ''}`} 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: incognitoMode ? 'var(--accent-color)' : 'var(--text-color)' }}
              onClick={() => {
                const newState = !incognitoMode;
                setIncognitoMode(newState);
                showToast(newState ? "Ghost Mode Active: No history will be saved & Uploads disabled." : "Ghost Mode Off: Normal operation resumed.", newState ? "warning" : "success");
              }} 
              title="Incognito Mode (Do not save history)"
            >
              <Ghost size={18} strokeWidth={2} color={incognitoMode ? 'var(--accent-color)' : 'var(--text-color)'} />
            </button>
            <div className="status-badge" style={{ display: 'flex', alignItems: 'center', padding: '0', border: 'none', background: 'transparent' }}>
              <CustomDropdown
                value={selectedModel}
                options={OPENROUTER_MODELS.map(m => ({ value: m.id, label: m.name }))}
                onChange={setSelectedModel}
                showStatusDot={true}
              />
            </div>
            <button className="theme-toggle" onClick={() => setTheme(p => p === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <SunMedium size={16} /> : <Moon size={16} />}</button>
          </div>
        </header>

        {activeTab === 'admin' ? (
          <div className="tab-pane active" style={{ flex: 1, overflowY: 'auto', animation: 'fadeIn 0.3s ease' }}>
            <AdminDashboard session={session} showToast={showToast} />
          </div>
        ) : fullScreenAnalytics ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
            <AnalyticsPanel isSidebar={false} />
          </div>
        ) : fullScreenKB ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', background: 'var(--bg-color)' }}>
            <AllDocumentsModal 
               documents={userRole === 'super_admin' ? documents : documents.filter(d => d.domain === userRole || d.domain === 'general')} 
               docDomains={domains.reduce((acc, d) => { acc[d.id] = d; return acc; }, {})}
               session={session}
               userRole={userRole}
               onDelete={(filename) => setPasswordModal({ isOpen: true, filename, action: 'delete', targetDomain: 'general' })}
               setPropertiesModal={setPropertiesModal}
               setSummaryModal={setSummaryModal}
               onClose={() => setFullScreenKB(false)}
               isFullScreen={true}
            />
          </div>
        ) : (
          <>
            {pipelineStep >= 0 && <PipelineBar activeStep={pipelineStep} />}

            <section className="chat-stream">
          {messages.length === 0 ? (
            incognitoMode ? (
              <div className="empty-state ghost-empty-state">
                <div className="ghost-icon-wrapper ghost-float-animation" style={{ display: 'inline-block' }}>
                  <Ghost size={56} strokeWidth={1.5} />
                </div>
                <h3 style={{ marginTop: 24, marginBottom: 8, color: 'var(--primary-color)' }}>Ghost Mode Active</h3>
                <p style={{ maxWidth: 400, margin: '0 auto', lineHeight: 1.5, color: 'var(--muted-text)' }}>
                  You are completely off the grid.<br />Your chat history and uploads will not be saved.
                </p>
              </div>
            ) : (
              <div className="empty-state">
                <Bot size={48} />
                <h3>How can I help you today?</h3>
                <p>Ask a question, and I'll search the enterprise knowledge base to provide a grounded, cited answer.</p>
              </div>
            )
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
                    {message.cached && <span className="meta-badge cached">Ã¢Å¡Â¡ Cached Answer</span>}
                  </div>
                  {message.role === 'assistant' && typeof message.confidence === 'number' && (
                    <ConfidenceGauge value={message.confidence} size={36} />
                  )}
                </div>

                <div style={{ minHeight: message.id === currentStreamId ? 24 : 0 }}>
                  {message.role === 'user' ? (
                    <div>
                      {message.text}
                      {message.attachedImage && (
                        <div style={{ marginTop: 8 }}>
                          <img src={message.attachedImage} alt="User Attachment" style={{ maxWidth: 200, borderRadius: 8, border: '1px solid var(--border-color)' }} />
                        </div>
                      )}
                    </div>
                  ) : renderMarkdown(message.text)}
                  
                  {message.chart_data && (
                    <DynamicChartRenderer data={message.chart_data.data} type={message.chart_data.type} xKey={message.chart_data.xKey} yKey={message.chart_data.yKey} />
                  )}

                  {isStreaming && message.id === currentStreamId && !message.text && (
                    <div className="rich-loader" style={{ margin: '10px 0', justifyContent: 'flex-start' }}>
                      <div className="rich-loader-dot" style={{ background: 'var(--accent-color)', width: 6, height: 6 }}></div>
                      <div className="rich-loader-dot" style={{ background: 'var(--accent-color)', width: 6, height: 6 }}></div>
                      <div className="rich-loader-dot" style={{ background: 'var(--accent-color)', width: 6, height: 6 }}></div>
                    </div>
                  )}
                  {isStreaming && message.id === currentStreamId && message.text && <span className="typing-cursor" />}
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

                {message.reasoning && (
                  <details className="citation-panel" style={{ marginTop: 8, background: 'var(--card-bg-strong)', border: '1px solid var(--border-color)' }}>
                    <summary style={{ color: 'var(--muted-text)' }}>View Agentic Reasoning Trace</summary>
                    <div style={{ padding: 12, fontSize: '0.85rem', color: 'var(--text-color)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {message.reasoning}
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

        {showKnowledgeGraph && (
          <div style={{ position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, background: 'var(--bg-color)', zIndex: 100, padding: 24, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Knowledge Graph Explorer</h2>
              <button className="icon-btn" onClick={() => setShowKnowledgeGraph(false)}><X size={20} /></button>
            </div>
            <KnowledgeGraphViewer domain={activeDomainFilter || userRole} token={session?.access_token} />
          </div>
        )}

        <footer className="composer" style={{ position: 'relative' }}>
          {webSearchEnabled && (
            <div style={{ position: 'absolute', top: '-35px', left: '0', right: '0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(10px)' }}>
                <Globe size={12} /> ⚠️ You are using live Web Search. Results may not be as accurate or secure as internal documents.
              </div>
            </div>
          )}
          <div className="composer-box" style={{ flexDirection: 'column', gap: '10px', padding: '12px 16px', alignItems: 'stretch' }}>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isStreaming && inputValue.trim()) handleSend();
                }
              }}
              placeholder={userRole !== 'super_admin' ? `Ask a question strictly in ${domains.find(d => d.id === userRole)?.name || userRole}...` : activeDomainFilter ? `Search in ${domains.find(d => d.id === activeDomainFilter)?.name}...` : "Ask a grounded question across all domains..."}
              disabled={isStreaming}
              style={{ width: '100%', fontSize: '0.95rem', minHeight: '24px', maxHeight: '150px', resize: 'none', overflowY: 'auto', background: 'transparent', border: 'none', color: 'inherit', outline: 'none' }}
              rows={1}
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 500, color: webSearchEnabled ? '#3b82f6' : 'var(--muted-text)', cursor: 'pointer', transition: 'color 0.2s' }}>
                  <div style={{
                    width: 36, height: 20, borderRadius: 10, background: webSearchEnabled ? '#3b82f6' : 'var(--card-bg-strong)',
                    position: 'relative', transition: 'background 0.3s', border: '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2,
                      left: webSearchEnabled ? 18 : 2, transition: 'left 0.3s'
                    }} />
                  </div>
                  <input type="checkbox" checked={webSearchEnabled} onChange={e => setWebSearchEnabled(e.target.checked)} style={{ display: 'none' }} />
                  <Globe size={14} /> Web Search
                </label>
                
                <div style={{ position: 'relative' }}>
                  <button className="icon-btn" style={{ padding: 6, color: attachedImage ? 'var(--accent-color)' : 'var(--muted-text)' }} onClick={() => imageInputRef.current?.click()} disabled={isStreaming} title="Attach Image for Vision AI">
                    <Paperclip size={18} />
                  </button>
                  <input type="file" ref={imageInputRef} accept="image/*" hidden onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setAttachedImage(reader.result);
                      reader.readAsDataURL(file);
                    }
                  }} />
                  {attachedImage && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: 'var(--panel-bg)', padding: 4, borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                      <img src={attachedImage} alt="preview" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                      <button className="icon-btn" onClick={() => setAttachedImage(null)} style={{ padding: 2 }}><X size={14}/></button>
                    </div>
                  )}
                </div>
              </div>

              {isStreaming ? (
                <button className="primary-button" onClick={handleStopGeneration} style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--warning-color)', color: '#fff', boxShadow: 'none' }}>
                  <Square size={14} fill="currentColor" /> Stop
                </button>
              ) : (
                <button className="primary-button" onClick={handleSend} disabled={!inputValue.trim() && !attachedImage} style={{ padding: '8px 16px', borderRadius: 10 }}>
                  <Send size={14} /> Send
                </button>
              )}
            </div>
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
                <Lock size={18} style={{ color: 'var(--warning-color)' }} /> Action Required
              </h2>
              <button className="icon-btn" onClick={() => setPasswordModal({ isOpen: false, targetDomain: 'general' })}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '.85rem', color: 'var(--muted-text)', marginBottom: 16 }}>
                Authorize {passwordModal.action} for <strong>{passwordModal.filename || passwordModal.url}</strong>
              </p>
              
              {passwordModal.action !== 'delete' && userRole === 'super_admin' && (
                <>
                  <label className="setting-label"><strong>Assign to Domain</strong></label>
                  <select value={passwordModal.targetDomain} onChange={e => setPasswordModal(p => ({ ...p, targetDomain: e.target.value }))}>
                    {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </>
              )}
              
              <label className="setting-label"><strong>Your Account Password</strong></label>
              <input type="password" autoFocus value={adminPassword} onChange={e => setAdminPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()} placeholder="Enter password..." />
              
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setPasswordModal({ isOpen: false, targetDomain: 'general' })}>Cancel</button>
                <button className="primary-button" onClick={handlePasswordSubmit}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* User Profile Modal */}
      {profileModalOpen && (
        <div className="modal-overlay" onClick={() => setProfileModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 450, animation: 'fadeInDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            <div className="modal-header" style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
                <User size={20} color="var(--primary-color)" /> My Profile & Activity
              </h2>
              <button className="icon-btn" onClick={() => setProfileModalOpen(false)}><X size={18} /></button>
            </div>
            
            <div className="modal-body">
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ background: 'var(--accent-color)', color: '#fff', width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 700 }}>
                  {(userFullName || session?.user?.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-color)' }}>{userFullName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>{session?.user?.email}</div>
                  <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600 }}>
                    {userRole === 'super_admin' ? 'Super Admin' : domains.find(d => d.id === userRole)?.name || userRole}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Profile Details</h3>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <label className="setting-label">Full Name</label>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 8, color: '#fff', outline: 'none' }} />
                  </div>
                  <div>
                    <label className="setting-label">Phone Number</label>
                    <input type="text" value={editPhone} onChange={e => setEditPhone(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 8, color: '#fff', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="primary-button" onClick={handleUpdateProfile} disabled={updatingProfile} style={{ padding: '8px 16px', borderRadius: 8 }}>
                      {updatingProfile ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted-text)' }}>
                  Total Chat Sessions: <strong>{chatSessions.length}</strong>
                </div>
                {confirmSignOut ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => setConfirmSignOut(false)} style={{ background: 'transparent', color: 'var(--text-color)', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '6px' }}>Cancel</button>
                    <button onClick={handleLogout} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Confirm Sign Out</button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setConfirmSignOut(true)} 
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '8px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                  >
                    <Lock size={14} /> Sign Out
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {propertiesModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400, boxShadow: 'var(--panel-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Info size={20} style={{ color: 'var(--accent-color)' }} /> Asset Properties</h2>
              <button className="icon-btn" onClick={() => setPropertiesModal(null)}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Filename</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 500, wordBreak: 'break-all' }}>{propertiesModal.name}</div>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Size</div>
                  <div style={{ fontSize: '0.95rem' }}>{propertiesModal.size}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Domain</div>
                  <div style={{ fontSize: '0.95rem' }}>{domains.find(d => d.id === propertiesModal.domain)?.name || propertiesModal.domain}</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Uploaded By</div>
                <div style={{ fontSize: '0.95rem' }}>{propertiesModal.uploaded_by || 'Unknown'}</div>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Last Modified</div>
                  <div style={{ fontSize: '0.95rem' }}>{propertiesModal.date || 'Unknown'}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Access Frequency</div>
                  <div style={{ fontSize: '0.95rem' }}>{propertiesModal.access_count || 0} hits</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>AI Trust Score</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--accent-color)' }}>{propertiesModal.trust_metrics?.ai_score || 85} / 100</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-text)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Community Rating</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 500 }}>
                      <ThumbsUp size={14} /> {propertiesModal.trust_metrics?.upvotes || 0}
                    </div>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 500 }}>
                      <ThumbsDown size={14} /> {propertiesModal.trust_metrics?.downvotes || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary-button" onClick={() => setPropertiesModal(null)} style={{ padding: '8px 24px', borderRadius: 8 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {summaryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 24, width: '90%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--panel-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={20} style={{ color: 'var(--accent-color)' }} /> AI Summary</h2>
              <button className="icon-btn" onClick={() => setSummaryModal(null)}><X size={20} /></button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-color)' }}>
              {summaryModal.summary || "No AI summary available for this document."}
            </div>
            
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
              <button className="primary-button" onClick={() => setSummaryModal(null)} style={{ padding: '8px 24px', borderRadius: 8 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
    </div>
  );
}




