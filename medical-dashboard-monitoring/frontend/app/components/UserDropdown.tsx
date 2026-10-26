'use client';

import { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { useLanguage } from './LanguageProvider';

interface UserDropdownProps {
  username: string;
  /** role dari backend, sudah lowercase (admin/farmasi/operator) */
  role: string;
  onLogoutClick: () => void;
}

/**
 * Dropdown user: kartu info + Logout.
 * Fase B belum menampilkan menu Akun karena rute /account belum dibuat
 * (menghindari dead link); Fase C menambahkannya.
 */
export default function UserDropdown({ username, role, onLogoutClick }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { dict } = useLanguage();

  const getRoleLabel = () => {
    if (role === 'admin') return dict.header.role_admin;
    if (role === 'farmasi') return dict.header.role_farmasi;
    return dict.header.role_operator;
  };

  const initials = username.slice(0, 2).toUpperCase();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-2 bg-bg-elevated border border-border-base rounded-xl pl-1.5 pr-2 py-1 hover:bg-card transition-colors"
      >
        <span className="w-7 h-7 rounded-lg bg-accent text-white text-xs font-bold flex items-center justify-center shrink-0">
          {initials}
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight">
          <span className="text-xs font-semibold text-txt-main">{username}</span>
          <span className="text-[10px] text-txt-sec">{getRoleLabel()}</span>
        </span>
        <ChevronDown
          size={14}
          className={`text-txt-sec transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="glass-panel absolute right-0 mt-2 w-60 p-2 z-50 rounded-xl">
          <div className="flex items-center gap-3 px-2 py-2.5 border-b border-border-base mb-1">
            <span className="w-10 h-10 rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center shrink-0">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-txt-main truncate">{username}</p>
              <p className="text-xs text-txt-sec">{getRoleLabel()}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onLogoutClick();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm text-error hover:bg-error/10 rounded-lg transition-colors font-medium"
          >
            <LogOut size={15} />
            {dict.header.logout}
          </button>
        </div>
      )}
    </div>
  );
}
