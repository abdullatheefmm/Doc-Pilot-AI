import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, Mail, Key, User, Phone, Briefcase, Sparkles, ArrowRight, ArrowLeft, Eye, EyeOff, ChevronDown, Check, Fingerprint, ShieldCheck, X } from 'lucide-react';

export default function Auth({ onAuthSuccess }) {
  const [loading, setLoading] = useState(false);
  
  // Credentials
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Registration fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('engineering');
  const [complianceAgreed, setComplianceAgreed] = useState(false);
  
  // View states
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPass, setIsForgotPass] = useState(false);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  
  // New Registration Flow States
  const [registerStep, setRegisterStep] = useState(1); // 1 or 2
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  
  const [otp, setOtp] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [resendTimer, setResendTimer] = useState(120);

  useEffect(() => {
    let interval = null;
    if (showOtpModal && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
    } else if (!showOtpModal) {
      setResendTimer(120);
    }
    return () => clearInterval(interval);
  }, [showOtpModal, resendTimer]);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Password strength logic
  const calculateStrength = (pwd) => {
    let score = 0;
    if (pwd.length > 5) score += 1;
    if (pwd.length > 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
    return score;
  };

  const strengthScore = calculateStrength(password);
  const strengthText = strengthScore <= 2 ? 'Weak' : strengthScore <= 4 ? 'Good' : 'Strong';
  const strengthColor = strengthScore <= 2 ? '#ef4444' : strengthScore <= 4 ? '#eab308' : '#22c55e';
  const strengthWidth = password.length === 0 ? 0 : (strengthScore / 5) * 100;

  const roles = [
    { id: 'engineering', name: 'Engineering' },
    { id: 'hr', name: 'HR & Policy' },
    { id: 'finance', name: 'Finance' },
    { id: 'legal', name: 'Legal & Compliance' },
    { id: 'product', name: 'Product' },
    { id: 'general', name: 'General' }
  ];

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!fullName || !phone || !email) {
      setError("Please fill out your Name, Phone Number, and Email.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ 
        email,
        options: { shouldCreateUser: true }
      });
      if (error) throw error;
      setSuccessMsg("OTP sent to your email. Please check your inbox.");
      setShowOtpModal(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp) {
      setError("Please enter the OTP.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
      if (error) throw error;
      setSuccessMsg("Email verified! Please set your password and role.");
      setIsEmailVerified(true);
      setShowOtpModal(false);
      setRegisterStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    
    // Handle Registration Step 1 Submission
    if (!isLogin && !isForgotPass && registerStep === 1) {
      handleSendOtp();
      return;
    }
    
    // Handle Registration Step 2 Submission
    if (!isLogin && !isForgotPass && registerStep === 2) {
      if (!employeeId || !password) {
        setError("Please fill out all details and set a password.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (!complianceAgreed) {
        setError("You must agree to the Enterprise Data Handling Policy.");
        return;
      }
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      try {
        const { data, error } = await supabase.auth.updateUser({ 
          password,
          data: {
            full_name: fullName,
            phone_number: phone,
            role: role,
            employee_id: employeeId
          }
        });
        if (error) throw error;
        
        if (data.user) {
          const { error: profileError } = await supabase.from('user_profiles').upsert({ 
              user_id: data.user.id,
              email: email,
              full_name: fullName, 
              phone_number: phone, 
              role: role, 
              employee_id: employeeId,
              status: 'pending'
          }, { onConflict: 'user_id' });
          
          if (profileError) {
             console.error("Failed to save user profile:", profileError);
          }
        }
        
        const sessionData = data.session || (await supabase.auth.getSession()).data.session;
        if (sessionData) {
           onAuthSuccess(sessionData);
        } else {
           setSuccessMsg("Registration complete! Your account is pending Admin approval.");
           setIsLogin(true);
           setRegisterStep(1);
           setIsEmailVerified(false);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    
    try {
      if (isForgotPass) {
        // Forgot Password Mode
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setSuccessMsg("Password reset email sent! Check your inbox.");
      } else if (isLogin) {
        // Login Mode
        const res = await fetch(`http://127.0.0.1:8000/api/auth/resolve-id?emp_id=${encodeURIComponent(employeeId)}&is_admin_login=${isAdminLogin}`);
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.detail || "Could not resolve ID");
        }
        const data = await res.json();
        if (!data.email) throw new Error("Invalid ID. No account found.");
        
        const loginEmail = data.email;

        const { data: authData, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
        if (authData.session) onAuthSuccess(authData.session);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'grid', 
      placeItems: 'center', 
      minHeight: '100vh', 
      width: '100%',
      background: 'radial-gradient(circle at 50% 0%, var(--card-bg-strong) 0%, var(--bg-color) 100%)',
      position: 'relative',
      overflowY: 'auto',
      overflowX: 'hidden',
      padding: '40px 16px',
      boxSizing: 'border-box'
    }}>
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active{
            -webkit-box-shadow: 0 0 0 30px #1a1a1c inset !important;
            -webkit-text-fill-color: white !important;
            transition: background-color 5000s ease-in-out 0s;
        }
        
        .animated-dropdown-content {
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            max-height: 0;
            opacity: 0;
            overflow: hidden;
        }
        
        .animated-dropdown-content.open {
            max-height: 300px;
            opacity: 1;
        }
        
        .dropdown-item {
            padding: 10px 14px;
            cursor: pointer;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .dropdown-item:hover {
            background: rgba(255,255,255,0.05);
        }

        .checkbox-container input {
            position: absolute;
            opacity: 0;
            cursor: pointer;
            height: 0;
            width: 0;
        }
        .checkmark {
            position: absolute;
            top: 0;
            left: 0;
            height: 18px;
            width: 18px;
            background-color: rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 4px;
            transition: all 0.2s;
        }
        .checkbox-container:hover input ~ .checkmark {
            border-color: var(--accent-color);
        }
        .checkbox-container input:checked ~ .checkmark {
            background-color: var(--accent-color);
            border-color: var(--accent-color);
        }
        .checkmark:after {
            content: "";
            position: absolute;
            display: none;
        }
        .checkbox-container input:checked ~ .checkmark:after {
            display: block;
        }
        .checkbox-container .checkmark:after {
            left: 6px;
            top: 2px;
            width: 4px;
            height: 9px;
            border: solid white;
            border-width: 0 2px 2px 0;
            transform: rotate(45deg);
        }

        @keyframes popIn {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      
      {/* Background Glows */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40vw', height: '40vw', background: 'var(--accent-color)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '40vw', height: '40vw', background: 'var(--primary-color)', opacity: 0.05, filter: 'blur(100px)', borderRadius: '50%' }} />

      {/* Main Auth Card */}
      <div className="auth-card" style={{ 
        width: '100%',
        maxWidth: 480, 
        padding: '40px 32px',
        background: 'rgba(20, 20, 22, 0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 24,
        boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{ textAlign: 'center', marginBottom: (!isLogin && !isForgotPass) ? 20 : 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent-color), var(--primary-color))', padding: 12, borderRadius: 16, boxShadow: '0 8px 16px rgba(255,122,24,0.2)' }}>
              <Sparkles size={28} color="#fff" strokeWidth={1.5}/>
            </div>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-color)' }}>
            DocPilot {isAdminLogin ? 'Super Admin' : 'Enterprise'}
          </h2>
          <p style={{ color: 'var(--muted-text)', fontSize: '0.9rem', marginTop: 8 }}>
            {isForgotPass ? 'Reset your password securely' : (isLogin ? (isAdminLogin ? 'Sign in with admin credentials' : 'Sign in to access the knowledge base') : 'Enterprise Onboarding')}
          </p>
        </div>

        {/* Wizard Progress Bar */}
        {(!isLogin && !isForgotPass) && (
           <div style={{ marginBottom: 24, padding: '0 40px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                 <div style={{ position: 'absolute', top: 12, left: 10, right: 10, height: 2, background: 'rgba(255,255,255,0.1)', zIndex: 0 }}>
                    <div style={{ height: '100%', width: registerStep === 1 ? '0%' : '100%', background: 'var(--accent-color)', transition: 'width 0.4s ease' }} />
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>1</div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-color)' }}>Identity</span>
                 </div>
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: registerStep >= 2 ? 'var(--accent-color)' : '#1a1a1c', border: `1px solid ${registerStep >= 2 ? 'var(--accent-color)' : 'rgba(255,255,255,0.2)'}`, color: registerStep >= 2 ? '#fff' : 'var(--muted-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.4s ease' }}>2</div>
                    <span style={{ fontSize: '0.7rem', color: registerStep >= 2 ? 'var(--text-color)' : 'var(--muted-text)' }}>Security</span>
                 </div>
              </div>
           </div>
        )}

        {error && !showOtpModal && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', marginBottom: 20, border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 4, background: '#ef4444', borderRadius: '50%' }}/>
            {error}
          </div>
        )}
        
        {successMsg && !showOtpModal && (
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '12px 16px', borderRadius: 12, fontSize: '0.85rem', marginBottom: 20, border: '1px solid rgba(34, 197, 94, 0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 4, background: '#22c55e', borderRadius: '50%' }}/>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Registration Step 1: Personal Details */}
          {(!isLogin && !isForgotPass && registerStep === 1) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Full Name</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                  <User size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="John Doe" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone Number</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                  <Phone size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required placeholder="+1 234 567 890" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                  <Mail size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="john@enterprise.com" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem' }} />
                </div>
              </div>
            </div>
          )}

          {/* Registration Step 2: Employee ID, Role, Passwords */}
          {(!isLogin && !isForgotPass && registerStep === 2) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee ID</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                  <Fingerprint size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                  <input type="text" value={employeeId} onChange={e => setEmployeeId(e.target.value)} required placeholder="e.g. EMP1024" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem' }} />
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Domain Role</label>
                <div 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-color)', fontSize: '0.9rem' }}>
                    <Briefcase size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                    {roles.find(r => r.id === role)?.name}
                  </div>
                  <ChevronDown size={14} color="var(--muted-text)" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>

                <div 
                  className={`animated-dropdown-content ${dropdownOpen ? 'open' : ''}`}
                  style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#1c1c1f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                >
                  {roles.map(r => (
                    <div 
                      key={r.id} 
                      className="dropdown-item"
                      onClick={() => { setRole(r.id); setDropdownOpen(false); }}
                      style={{ color: role === r.id ? 'var(--text-color)' : 'var(--muted-text)' }}
                    >
                      <span style={{ fontSize: '0.85rem' }}>{r.name}</span>
                      {role === r.id && <Check size={14} color="var(--primary-color)" />}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                  <Key size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                  <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem', letterSpacing: showPassword ? 'normal' : '2px' }} />
                  <div onClick={() => setShowPassword(!showPassword)} style={{ cursor: 'pointer', marginLeft: 10, display: 'flex', color: 'var(--muted-text)' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </div>
                </div>
                {password.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--muted-text)', marginBottom: 4 }}>
                      <span>Password strength</span>
                      <span style={{ color: strengthColor }}>{strengthText}</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${strengthWidth}%`, background: strengthColor, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Confirm Password</label>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: `1px solid ${confirmPassword && password !== confirmPassword ? '#ef4444' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '12px 14px' }}>
                  <Lock size={16} color={confirmPassword && password !== confirmPassword ? '#ef4444' : "var(--muted-text)"} style={{ marginRight: 10 }} />
                  <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="••••••••" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem', letterSpacing: showConfirmPassword ? 'normal' : '2px' }} />
                  <div onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ cursor: 'pointer', marginLeft: 10, display: 'flex', color: 'var(--muted-text)' }}>
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </div>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 6 }}>Passwords do not match</div>
                )}
              </div>

              <div style={{ marginTop: 8 }}>
                <label className="checkbox-container" style={{ display: 'flex', position: 'relative', paddingLeft: 30, cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted-text)', userSelect: 'none', alignItems: 'center', lineHeight: '1.4' }}>
                  <input type="checkbox" checked={complianceAgreed} onChange={(e) => setComplianceAgreed(e.target.checked)} />
                  <span className="checkmark"></span>
                  I agree to the Enterprise Data Handling Policy and acknowledge that actions are audited.
                </label>
              </div>
            </div>
          )}

          {/* Core Credentials Fields for Login & Forgot Pass */}
          {(isLogin || isForgotPass) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeInDown 0.4s ease forwards' }}>
              
              {!isForgotPass && (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isAdminLogin ? "Admin ID" : "Employee ID"}</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                    <Fingerprint size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                    <input type="text" value={employeeId} onChange={e => setEmployeeId(e.target.value)} required placeholder={isAdminLogin ? "e.g. ADM001" : "e.g. EMP1024"} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem' }} />
                  </div>
                </div>
              )}

              {isForgotPass && (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                    <Mail size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="john@enterprise.com" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem' }} />
                  </div>
                </div>
              )}

              {!isForgotPass && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-text)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
                    {isLogin && <span onClick={() => {setIsForgotPass(true); setIsLogin(false);}} style={{ fontSize: '0.75rem', color: 'var(--accent-color)', cursor: 'pointer' }}>Forgot?</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px' }}>
                    <Key size={16} color="var(--muted-text)" style={{ marginRight: 10 }} />
                    <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-color)', fontSize: '0.9rem', letterSpacing: showPassword ? 'normal' : '2px' }} />
                    <div onClick={() => setShowPassword(!showPassword)} style={{ cursor: 'pointer', marginLeft: 10, display: 'flex', color: 'var(--muted-text)' }}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {(!isLogin && !isForgotPass && registerStep > 1) && (
               <button type="button" onClick={() => setRegisterStep(registerStep - 1)} style={{ 
                 background: 'rgba(255,255,255,0.05)', 
                 color: 'var(--text-color)', 
                 border: '1px solid rgba(255,255,255,0.1)', 
                 padding: '14px', 
                 borderRadius: 12, 
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 transition: 'all 0.2s',
               }}>
                 <ArrowLeft size={18} />
               </button>
            )}
            
            <button type="submit" disabled={loading} style={{ 
              flex: 1,
              background: 'linear-gradient(135deg, var(--accent-color), var(--primary-color))', 
              color: '#fff', 
              border: 'none', 
              padding: '14px', 
              borderRadius: 12, 
              cursor: loading ? 'not-allowed' : 'pointer', 
              fontWeight: 600, 
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 12px rgba(255,122,24,0.3)',
              transition: 'all 0.2s'
            }}>
              {loading ? 'Processing...' : (
                isForgotPass ? 'Send Reset Link' : 
                isLogin ? 'Sign In Securely' : 
                (registerStep === 1 ? 'Verify Identity' : 'Complete Registration')
              )}
              {!loading && <ArrowRight size={18} />}
            </button>
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
          {isForgotPass ? (
            <button type="button" onClick={() => { setIsForgotPass(false); setIsLogin(true); }} style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--accent-color)', 
              fontWeight: 600, 
              cursor: 'pointer', 
              fontSize: '0.85rem',
              padding: 0
            }}>
              Back to login
            </button>
          ) : (
            !isAdminLogin && (
              <div style={{ marginBottom: 16 }}>
                <span style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                </span>
                <button type="button" onClick={() => {setIsLogin(!isLogin); setRegisterStep(1);}} style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--accent-color)', 
                  fontWeight: 600, 
                  cursor: 'pointer', 
                  fontSize: '0.85rem',
                  padding: 0
                }}>
                  {isLogin ? "Register now" : "Sign in instead"}
                </button>
              </div>
            )
          )}
          
          {(!isForgotPass) && (
             <button type="button" onClick={() => { setIsAdminLogin(!isAdminLogin); setIsLogin(true); }} style={{ 
               background: 'transparent', 
               border: 'none', 
               color: 'var(--muted-text)', 
               fontWeight: 500, 
               cursor: 'pointer', 
               fontSize: '0.75rem',
               padding: 0,
               textDecoration: 'underline'
             }}>
               {isAdminLogin ? "Back to standard login" : "Login as Super Admin"}
             </button>
          )}
        </div>
      </div>

      {/* OTP Animated Modal Overlay */}
      {showOtpModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #18181b, #121214)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 24,
            padding: '40px',
            width: '90%',
            maxWidth: 400,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            position: 'relative',
            animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}>
            <button 
              onClick={() => setShowOtpModal(false)}
              style={{
                position: 'absolute', top: 20, right: 20,
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: 'var(--muted-text)',
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted-text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              <X size={18} />
            </button>
            
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ 
                width: 64, height: 64, 
                background: 'rgba(255, 122, 24, 0.1)', 
                borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                border: '1px solid rgba(255, 122, 24, 0.2)'
              }}>
                <ShieldCheck size={32} color="var(--accent-color)" />
              </div>
              <h3 style={{ fontSize: '1.4rem', color: '#fff', margin: '0 0 8px 0', fontWeight: 600 }}>Verify Email</h3>
              <p style={{ color: 'var(--muted-text)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                We sent a verification code to <strong style={{color: '#fff'}}>{email}</strong>.<br/>Please enter it below.
              </p>
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 20, border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center' }}>
                {error}
              </div>
            )}
            {successMsg && (
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 20, border: '1px solid rgba(34, 197, 94, 0.2)', textAlign: 'center' }}>
                {successMsg}
              </div>
            )}

            <form onSubmit={handleVerifyOtp}>
              <div style={{ marginBottom: 24 }}>
                <input 
                  type="text" 
                  value={otp} 
                  onChange={e => setOtp(e.target.value)} 
                  required 
                  placeholder="CODE" 
                  maxLength={8}
                  style={{ 
                    width: '100%', 
                    background: 'rgba(0,0,0,0.3)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: 12,
                    padding: '16px',
                    color: '#fff', 
                    fontSize: '1.5rem', 
                    letterSpacing: '8px', 
                    textAlign: 'center',
                    outline: 'none',
                    fontWeight: 'bold',
                    transition: 'all 0.3s'
                  }} 
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent-color)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <button type="submit" disabled={loading} style={{ 
                width: '100%',
                background: 'linear-gradient(135deg, var(--accent-color), var(--primary-color))', 
                color: '#fff', 
                border: 'none', 
                padding: '16px', 
                borderRadius: 12, 
                cursor: loading ? 'not-allowed' : 'pointer', 
                fontWeight: 600, 
                fontSize: '1rem',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 8px 16px rgba(255,122,24,0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 20px rgba(255,122,24,0.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(255,122,24,0.3)'; }}
              >
                {loading ? 'Verifying...' : 'Verify Secure Code'}
              </button>
            </form>

            <div style={{ marginTop: 24, textAlign: 'center', animation: 'fadeIn 0.5s ease' }}>
              {resendTimer > 0 ? (
                <span style={{ color: 'var(--muted-text)', fontSize: '0.85rem' }}>
                  Resend code in <strong style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.9rem' }}>{Math.floor(resendTimer / 60)}:{(resendTimer % 60).toString().padStart(2, '0')}</strong>
                </span>
              ) : (
                <button 
                  type="button" 
                  onClick={() => { setResendTimer(120); handleSendOtp(); }}
                  disabled={loading}
                  style={{ 
                    background: 'transparent', border: 'none', color: 'var(--accent-color)', 
                    fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', 
                    opacity: loading ? 0.5 : 1, padding: '8px 16px', borderRadius: 8,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'rgba(255,122,24,0.1)')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'transparent')}
                >
                  Resend Security Code
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
