'use client';

import { useRef, type KeyboardEvent } from 'react';

/**
 * 带格式工具栏的 markdown 文本域：
 * - B/I/U 按钮与 Ctrl+B/I/U 快捷键同源（选区包裹 ** / * / __）
 * - 无序/有序列表按钮：对光标所在行或选中多行 toggle 行首标记
 * - 回车自动接续列表标记；空列表行回车退出列表
 * 输出仍是纯 markdown 文本，与既有数据模型完全兼容。
 */

type InlineMarker = '**' | '*' | '__';

function wrapSelection(
  el: HTMLTextAreaElement,
  value: string,
  marker: InlineMarker,
  onChange: (next: string) => void,
) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const selected = value.slice(start, end);
  const wrapped = `${marker}${selected}${marker}`;
  onChange(`${value.slice(0, start)}${wrapped}${value.slice(end)}`);
  requestAnimationFrame(() => {
    el.focus();
    const selectionStart = start + marker.length;
    el.setSelectionRange(selectionStart, selectionStart + selected.length);
  });
}

export function applyTextStyleShortcut(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  let marker: InlineMarker | '' = '';
  if (key === 'b') marker = '**';
  if (key === 'i') marker = '*';
  if (key === 'u') marker = '__';
  if (!marker) return;
  e.preventDefault();
  wrapSelection(e.currentTarget, value, marker, onChange);
}

const UL_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;

/** 选区覆盖的整行范围 [lineStart, lineEnd) */
function selectedLineRange(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndRaw = value.indexOf('\n', end);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  return { lineStart, lineEnd };
}

function toggleListPrefix(
  el: HTMLTextAreaElement,
  value: string,
  kind: 'ul' | 'ol',
  onChange: (next: string) => void,
) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const { lineStart, lineEnd } = selectedLineRange(value, start, end);
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');

  const matcher = kind === 'ul' ? UL_RE : OL_RE;
  const allMarked = lines
    .filter((line) => line.trim())
    .every((line) => matcher.test(line));

  let counter = 0;
  const nextLines = lines.map((line) => {
    if (!line.trim()) return line;
    const ul = line.match(UL_RE);
    const ol = line.match(OL_RE);
    const indent = ul?.[1] ?? ol?.[1] ?? line.match(/^(\s*)/)?.[1] ?? '';
    const text = ul?.[2] ?? ol?.[3] ?? line.trim();
    if (allMarked) return `${indent}${text}`; // 再点一次 = 移除标记
    counter += 1;
    return kind === 'ul' ? `${indent}- ${text}` : `${indent}${counter}. ${text}`;
  });

  const nextBlock = nextLines.join('\n');
  onChange(`${value.slice(0, lineStart)}${nextBlock}${value.slice(lineEnd)}`);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(lineStart, lineStart + nextBlock.length);
  });
}

/** 回车自动接续列表：`- ` / `n. `；空列表行回车 → 清标记退出 */
function handleListEnter(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
): boolean {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return false;
  const el = e.currentTarget;
  const start = el.selectionStart ?? 0;
  if (start !== (el.selectionEnd ?? start)) return false;

  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const line = value.slice(lineStart, start);
  const ul = line.match(UL_RE);
  const ol = line.match(OL_RE);
  if (!ul && !ol) return false;

  e.preventDefault();
  const contentAfterMarker = ul?.[2] ?? ol?.[3] ?? '';
  if (!contentAfterMarker.trim()) {
    // 空列表项：清掉本行标记，退出列表
    const next = `${value.slice(0, lineStart)}${value.slice(start)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(lineStart, lineStart);
    });
    return true;
  }

  const marker = ul
    ? `${ul[1]}- `
    : `${ol![1]}${Number(ol![2]) + 1}. `;
  const insertion = `\n${marker}`;
  const next = `${value.slice(0, start)}${insertion}${value.slice(start)}`;
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + insertion.length;
    el.setSelectionRange(caret, caret);
  });
  return true;
}

const TOOLBAR_BUTTONS: Array<{
  key: string;
  label: string;
  title: string;
  className?: string;
  action:
    | { type: 'wrap'; marker: InlineMarker }
    | { type: 'list'; kind: 'ul' | 'ol' };
}> = [
  { key: 'bold', label: 'B', title: '加粗（Ctrl+B）', className: 'md-btn-bold', action: { type: 'wrap', marker: '**' } },
  { key: 'italic', label: 'I', title: '斜体（Ctrl+I）', className: 'md-btn-italic', action: { type: 'wrap', marker: '*' } },
  { key: 'underline', label: 'U', title: '下划线（Ctrl+U）', className: 'md-btn-underline', action: { type: 'wrap', marker: '__' } },
  { key: 'ul', label: '• 列表', title: '无序列表：选中行加/去 • 圆点', action: { type: 'list', kind: 'ul' } },
  { key: 'ol', label: '1. 列表', title: '有序列表：选中行加/去编号', action: { type: 'list', kind: 'ol' } },
];

export function MarkdownTextarea({
  value,
  onChange,
  rows = 3,
  placeholder,
  className = 'comic-input',
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const runAction = (action: (typeof TOOLBAR_BUTTONS)[number]['action']) => {
    const el = textareaRef.current;
    if (!el) return;
    if (action.type === 'wrap') {
      wrapSelection(el, value, action.marker, onChange);
    } else {
      toggleListPrefix(el, value, action.kind, onChange);
    }
  };

  return (
    <div className="md-editor">
      <div className="md-toolbar" role="toolbar" aria-label="格式工具栏">
        {TOOLBAR_BUTTONS.map((btn) => (
          <button
            key={btn.key}
            type="button"
            className={`md-tool-btn ${btn.className ?? ''}`}
            title={btn.title}
            // onMouseDown+preventDefault 保住 textarea 的选区焦点
            onMouseDown={(e) => {
              e.preventDefault();
              runAction(btn.action);
            }}
          >
            {btn.label}
          </button>
        ))}
        <span className="md-toolbar-hint">支持 **加粗**、- 列表；回车自动接续</span>
      </div>
      <textarea
        ref={textareaRef}
        className={className}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (handleListEnter(e, value, onChange)) return;
          applyTextStyleShortcut(e, value, onChange);
        }}
      />
    </div>
  );
}
