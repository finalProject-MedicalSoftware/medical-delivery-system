"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  name?: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Dropdown kustom pengganti select bawaan: searchable, keyboard
 * navigable (panah/Enter/Esc), tetap mengirim via hidden input
 * agar cocok dengan server action FormData.
 */
export default function Select({
  name,
  options,
  value,
  defaultValue = "",
  onChange,
  placeholder = "- Pilih -",
  required,
  disabled,
  ariaLabel,
}: CustomSelectProps) {
  const [internal, setInternal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = value !== undefined ? value : internal;
  const selected = options.find((o) => o.value === current);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open ]);

  useEffect(() => {
    if (open) {
      setHighlight(0);
      searchRef.current?.focus();
    }
  }, [open ]);

  function choose(v: string) {
    const opt = options.find((o) => o.value === v);
    if (opt?.disabled) return;
    if (value === undefined) setInternal(v);
    onChange?.(v);
    setOpen(false);
    setQuery("");
  }

  function onButtonKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) choose(opt.value);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onButtonKey}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:opacity-50 ${
          selected ? "text-slate-900" : "text-slate-400"
        }`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
          {options.length > 5 && (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder="Ketik untuk mencari…"
                  aria-label="Cari opsi"
                  className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>
          )}
          <ul
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            className="max-h-56 overflow-auto py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400">Tidak ada opsi cocok</li>
            )}
            {filtered.map((o, i) => {
              const active = o.value === current;
              return (
                <li key={o.value} role="option" aria-selected={active} aria-disabled={o.disabled}>
                  <button
                    type="button"
                    disabled={o.disabled}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(o.value)}
                    title={o.disabled ? "Sudah terisi" : undefined}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      i === highlight ? "bg-slate-100" : ""
                    } ${active ? "font-semibold text-teal-700" : "text-slate-700"}`}
                  >
                    <span className="truncate">{o.label}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
