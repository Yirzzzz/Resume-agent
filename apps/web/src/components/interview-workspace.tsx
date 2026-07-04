'use client';

import { useState } from 'react';
import { DeepInterview } from './deep-interview';
import { InterviewSimulator } from './interview-simulator';

export function InterviewWorkspace({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [mode, setMode] = useState<'basic' | 'deep'>('basic');

  return (
    <div className="interview-workspace">
      <div className="interview-mode-switch" role="tablist" aria-label="面试模式">
        <button
          className={`interview-mode-btn ${mode === 'basic' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={mode === 'basic'}
          onClick={() => setMode('basic')}
        >
          标准模拟
        </button>
        <button
          className={`interview-mode-btn ${mode === 'deep' ? 'active' : ''}`}
          type="button"
          role="tab"
          aria-selected={mode === 'deep'}
          onClick={() => setMode('deep')}
        >
          深度面试
        </button>
      </div>

      {mode === 'basic' ? (
        <InterviewSimulator apiBaseUrl={apiBaseUrl} />
      ) : (
        <DeepInterview apiBaseUrl={apiBaseUrl} />
      )}
    </div>
  );
}
