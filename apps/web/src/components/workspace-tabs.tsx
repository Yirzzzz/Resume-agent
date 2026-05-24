'use client';

import { useState } from 'react';
import { InterviewSimulator } from './interview-simulator';
import { ResumeForm } from './resume-form';

type Template = {
  id: string;
  name: string;
  description: string;
};

export function WorkspaceTabs({
  apiBaseUrl,
  templates,
}: {
  apiBaseUrl: string;
  templates: Template[];
}) {
  const [tab, setTab] = useState<'editor' | 'interview'>('editor');

  return (
    <div>
      <div className="comic-subnav mb-3">
        <button
          className={`comic-subnav-btn ${tab === 'editor' ? 'active' : ''}`}
          type="button"
          onClick={() => setTab('editor')}
        >
          简历编辑
        </button>
        <button
          className={`comic-subnav-btn ${tab === 'interview' ? 'active' : ''}`}
          type="button"
          onClick={() => setTab('interview')}
        >
          AI 模拟面试
        </button>
      </div>

      {tab === 'editor' ? (
        <ResumeForm apiBaseUrl={apiBaseUrl} templates={templates} />
      ) : (
        <InterviewSimulator apiBaseUrl={apiBaseUrl} />
      )}
    </div>
  );
}

