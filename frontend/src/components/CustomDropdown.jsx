import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

const CustomDropdown = ({ value, options, onChange, showStatusDot }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', height: '100%' }}>
      <div 
        className="custom-dropdown-trigger"
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
            {options.find(o => o.value === value)?.label}
            {showStatusDot && <span className="status-dot blinking" style={{ flexShrink: 0 }} title="Model Active" />}
          </span>
        </div>
        <span className={`dropdown-icon ${open ? 'open' : ''}`}>▼</span>
      </div>
      {open && (
        <div className="custom-dropdown-menu">
          {options.map(opt => (
            <div 
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`custom-dropdown-item ${value === opt.value ? 'selected' : ''}`}
            >
              {opt.label}
              {value === opt.value && <Check size={14} color="var(--accent-color)" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;
