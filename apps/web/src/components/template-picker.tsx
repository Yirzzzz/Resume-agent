'use client';

import { useEffect, useRef, useState } from 'react';

export type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  layout?: string;
  tokens?: { accentColor?: string };
};

/** 各版式的纯 CSS 迷你示意图（不依赖图片资源） */
function TemplateThumb({ layout, accent }: { layout?: string; accent: string }) {
  if (layout === 'dual-column') {
    return (
      <div className="tpl-thumb">
        <div className="tpl-thumb-side" style={{ borderRightColor: accent }}>
          <span className="tpl-thumb-dot" style={{ background: accent }} />
          <span className="tpl-thumb-bar w60" />
          <span className="tpl-thumb-bar w80" />
        </div>
        <div className="tpl-thumb-main">
          <span className="tpl-thumb-bar w90" style={{ background: accent }} />
          <span className="tpl-thumb-bar w100" />
          <span className="tpl-thumb-bar w80" />
          <span className="tpl-thumb-bar w90" />
        </div>
      </div>
    );
  }
  if (layout === 'color-block') {
    return (
      <div className="tpl-thumb tpl-thumb-col">
        <div className="tpl-thumb-banner" style={{ background: accent }} />
        <span className="tpl-thumb-bar w60" style={{ background: accent }} />
        <span className="tpl-thumb-bar w100" />
        <span className="tpl-thumb-bar w90" />
      </div>
    );
  }
  if (layout === 'timeline') {
    return (
      <div className="tpl-thumb tpl-thumb-col">
        <span className="tpl-thumb-bar w50" style={{ background: accent }} />
        <div className="tpl-thumb-rail" style={{ borderLeftColor: accent }}>
          <span className="tpl-thumb-bar w90" />
          <span className="tpl-thumb-bar w70" />
          <span className="tpl-thumb-bar w80" />
        </div>
      </div>
    );
  }
  if (layout === 'ats-minimal') {
    return (
      <div className="tpl-thumb tpl-thumb-col">
        <span className="tpl-thumb-bar w40 dark" />
        <span className="tpl-thumb-bar w70" />
        <span className="tpl-thumb-hr" />
        <span className="tpl-thumb-bar w100" />
        <span className="tpl-thumb-bar w90" />
      </div>
    );
  }
  return (
    <div className="tpl-thumb tpl-thumb-col">
      <span className="tpl-thumb-bar w50" style={{ background: accent }} />
      <span className="tpl-thumb-bar w80" />
      <span className="tpl-thumb-bar w40" style={{ background: accent }} />
      <span className="tpl-thumb-bar w100" />
      <span className="tpl-thumb-bar w90" />
    </div>
  );
}

export function TemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: TemplateSummary[];
  value: string;
  onChange: (templateId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // fixed 定位坐标：弹层脱离工具栏容器 overflow:hidden 的裁剪
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const current = templates.find((t) => t.id === value);

  const openPicker = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const popWidth = 340;
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - popWidth - 8),
      );
      setPopPos({ top: rect.bottom + 6, left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onClose = () => setOpen(false);
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [open]);

  return (
    <div className="tpl-picker" ref={wrapRef}>
      <button
        ref={triggerRef}
        className="comic-input tpl-picker-trigger"
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        title="选择简历模板版式"
      >
        <span className="tpl-picker-label">{current?.name ?? '选择模板'}</span>
        <span className="tpl-picker-caret">▾</span>
      </button>
      {open && popPos ? (
        <div
          className="tpl-picker-pop comic-panel"
          style={{ top: popPos.top, left: popPos.left }}
        >
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tpl-card${t.id === value ? ' active' : ''}`}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <TemplateThumb
                layout={t.layout}
                accent={t.tokens?.accentColor ?? '#1f4f8f'}
              />
              <div className="tpl-card-info">
                <div className="tpl-card-name">{t.name}</div>
                <div className="tpl-card-desc">{t.description}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
