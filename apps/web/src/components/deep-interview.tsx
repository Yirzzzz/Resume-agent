'use client';

import { useEffect, useMemo, useState } from 'react';

type ResumeFileSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type SessionStatus =
  | 'CREATED'
  | 'PREPARING'
  | 'PREPARE_FAILED'
  | 'READY'
  | 'INTERVIEWING'
  | 'COMPLETED'
  | 'ABORTED';

type InterviewRound = 'tech_first' | 'tech_second' | 'tech_third' | 'manager' | 'hr';
type InterviewMode = 'gentle' | 'realistic' | 'pressure';

type AgentAnswerResponse = {
  action: string;
  acknowledgement: string;
  nextQuestion: string | null;
  progress: {
    questionCount: number;
    maxQuestions: number;
    coveredCompetencies: number;
    totalCompetencies: number;
  };
  sessionStatus: SessionStatus;
};

type SessionResponse = {
  sessionId: string;
  status: SessionStatus;
  progress: {
    traceCount: number;
    questionPoolSize: number;
    sourceCount: number;
    degraded: boolean;
    turnCount: number;
    answeredCount: number;
  };
  traceTail?: Array<{
    id: string;
    step: string;
    summary: string;
    from?: string;
    to?: string;
    createdAt: string;
  }>;
};

type ChatRow = {
  id: string;
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
};

type DeepReport = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  competencySummary?: Array<{
    competencyId: string;
    name: string;
    score: number;
    confidence: number;
    evidenceTurnIds: string[];
  }>;
  claimSummary?: Array<{
    claimId: string;
    status: string;
    content: string;
    evidenceTurnIds: string[];
  }>;
  unresolvedIssues?: Array<{
    issueId: string;
    kind: string;
    description: string;
    relatedClaimId?: string;
  }>;
};

type LongTermMemoryEntry = {
  id: string;
  resumeFileId: string;
  kind:
    | 'recurring_weakness'
    | 'improvement'
    | 'trained_project'
    | 'training_focus';
  conclusion: string;
  evidenceSessionIds: string[];
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

const memoryKindLabels: Record<LongTermMemoryEntry['kind'], string> = {
  recurring_weakness: '反复薄弱点',
  improvement: '进步信号',
  trained_project: '已训练项目',
  training_focus: '训练重点',
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function DeepInterview({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [resumeFiles, setResumeFiles] = useState<ResumeFileSummary[]>([]);
  const [resumeFileId, setResumeFileId] = useState('');
  const [company, setCompany] = useState('字节跳动');
  const [position, setPosition] = useState('后端工程师');
  const [jobDescription, setJobDescription] = useState('');
  const [round, setRound] = useState<InterviewRound>('tech_first');
  const [mode, setMode] = useState<InterviewMode>('realistic');
  const [maxQuestions, setMaxQuestions] = useState(6);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [progress, setProgress] = useState<AgentAnswerResponse['progress'] | null>(null);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [answer, setAnswer] = useState('');
  const [report, setReport] = useState<DeepReport | null>(null);
  const [longTermMemory, setLongTermMemory] = useState<LongTermMemoryEntry[]>([]);
  const [memoryDeletingId, setMemoryDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPrepare = useMemo(
    () => Boolean(resumeFileId && company.trim() && position.trim()),
    [company, position, resumeFileId],
  );
  const canAnswer = session?.status === 'INTERVIEWING' && answer.trim() && !busy;

  const loadLongTermMemory = async (targetResumeFileId = resumeFileId) => {
    if (!targetResumeFileId) {
      setLongTermMemory([]);
      return;
    }
    const resp = await fetch(
      `${apiBaseUrl}/api/interview-agent/memory?resumeFileId=${encodeURIComponent(targetResumeFileId)}`,
      { cache: 'no-store' },
    );
    const data = (await resp.json()) as LongTermMemoryEntry[] | { message?: string };
    if (!resp.ok) {
      throw new Error(
        typeof (data as { message?: string }).message === 'string'
          ? (data as { message?: string }).message
          : `加载长期记忆失败（${resp.status}）`,
      );
    }
    setLongTermMemory(data as LongTermMemoryEntry[]);
  };

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const resp = await fetch(`${apiBaseUrl}/resume-files`, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`加载简历文件失败（${resp.status}）`);
        const data = (await resp.json()) as ResumeFileSummary[];
        setResumeFiles(data);
        setResumeFileId(data.find((x) => x.isDefault)?.id ?? data[0]?.id ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载简历文件失败');
      }
    };
    void loadFiles();
  }, [apiBaseUrl]);

  useEffect(() => {
    void loadLongTermMemory(resumeFileId).catch((e) =>
      setError(e instanceof Error ? e.message : '加载长期记忆失败'),
    );
  }, [apiBaseUrl, resumeFileId]);

  const appendRows = (...nextRows: ChatRow[]) => {
    setRows((prev) => [...prev, ...nextRows]);
  };

  const createPrepareAndStart = async () => {
    if (!canPrepare) return;
    setBusy(true);
    setError(null);
    setRows([]);
    setProgress(null);
    setReport(null);
    try {
      const created = await postJson<SessionResponse>('/api/interview-agent/sessions', {
        resumeFileId,
        company: company.trim(),
        position: position.trim(),
        jobDescription: jobDescription.trim(),
        interviewRound: round,
        mode,
        maxQuestions,
      });
      setSession(created);
      appendRows({
        id: uid(),
        role: 'system',
        text: 'PREPARING',
      });

      const prepared = await postJson<SessionResponse>(
        `/api/interview-agent/sessions/${created.sessionId}/prepare`,
        {},
      );
      setSession(prepared);
      if (prepared.status !== 'READY') {
        const failure = [...(prepared.traceTail ?? [])]
          .reverse()
          .find((t) => t.step === 'prepare_failed');
        throw new Error(
          failure?.summary ?? `准备失败（${prepared.status}），请稍后重试`,
        );
      }
      appendRows({
        id: uid(),
        role: 'system',
        text: `READY · ${prepared.progress.questionPoolSize} questions · ${prepared.progress.sourceCount} sources`,
      });

      const started = await postJson<AgentAnswerResponse>(
        `/api/interview-agent/sessions/${created.sessionId}/start`,
        {},
      );
      setProgress(started.progress);
      setSession((prev) =>
        prev ? { ...prev, status: started.sessionStatus } : prev,
      );
      appendRows(
        { id: uid(), role: 'system', text: started.acknowledgement },
        ...(started.nextQuestion
          ? [{ id: uid(), role: 'interviewer' as const, text: started.nextQuestion }]
          : []),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '深度面试启动失败');
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async () => {
    if (!session || !canAnswer) return;
    const text = answer.trim();
    setAnswer('');
    setBusy(true);
    setError(null);
    appendRows({ id: uid(), role: 'candidate', text });
    try {
      const data = await postJson<AgentAnswerResponse>(
        `/api/interview-agent/sessions/${session.sessionId}/answer`,
        { answer: text },
      );
      setProgress(data.progress);
      setSession((prev) =>
        prev ? { ...prev, status: data.sessionStatus } : prev,
      );
      appendRows(
        { id: uid(), role: 'system', text: `${data.action} · ${data.acknowledgement}` },
        ...(data.nextQuestion
          ? [{ id: uid(), role: 'interviewer' as const, text: data.nextQuestion }]
          : []),
      );
      if (data.sessionStatus === 'COMPLETED') {
        await loadReport(session.sessionId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交回答失败');
      setAnswer(text);
    } finally {
      setBusy(false);
    }
  };

  const endInterview = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<AgentAnswerResponse>(
        `/api/interview-agent/sessions/${session.sessionId}/end`,
        {},
      );
      setProgress(data.progress);
      setSession((prev) =>
        prev ? { ...prev, status: data.sessionStatus } : prev,
      );
      appendRows({ id: uid(), role: 'system', text: data.acknowledgement });
      await loadReport(session.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '结束面试失败');
    } finally {
      setBusy(false);
    }
  };

  const loadReport = async (sessionId: string) => {
    const resp = await fetch(`${apiBaseUrl}/api/interview-agent/sessions/${sessionId}/report`, {
      cache: 'no-store',
    });
    const data = (await resp.json()) as DeepReport | { message?: string };
    if (!resp.ok) {
      throw new Error(
        typeof (data as { message?: string }).message === 'string'
          ? (data as { message?: string }).message
          : `加载报告失败（${resp.status}）`,
      );
    }
    setReport(data as DeepReport);
    await loadLongTermMemory();
  };

  const deleteMemoryEntry = async (entryId: string) => {
    setMemoryDeletingId(entryId);
    setError(null);
    try {
      const resp = await fetch(`${apiBaseUrl}/api/interview-agent/memory/${entryId}`, {
        method: 'DELETE',
      });
      const data = (await resp.json()) as { deletedId?: string; message?: string };
      if (!resp.ok) {
        throw new Error(
          typeof data.message === 'string'
            ? data.message
            : `删除长期记忆失败（${resp.status}）`,
        );
      }
      setLongTermMemory((prev) => prev.filter((entry) => entry.id !== entryId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除长期记忆失败');
    } finally {
      setMemoryDeletingId(null);
    }
  };

  const postJson = async <T,>(path: string, body: unknown): Promise<T> => {
    const resp = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await resp.json()) as T | { message?: string };
    if (!resp.ok) {
      throw new Error(
        typeof (data as { message?: string }).message === 'string'
          ? (data as { message?: string }).message
          : `请求失败（${resp.status}）`,
      );
    }
    return data as T;
  };

  return (
    <div className="comic-panel p-3 interview-panel deep-interview-panel">
      <div className="comic-banner">DEEP INTERVIEW AGENT</div>

      <div className="interview-two-col">
        <div className="interview-left">
          <div className="interview-block interview-config-block">
            <div className="interview-block-tag">Agent 配置</div>
            <div className="interview-grid">
              <label className="comic-label interview-label">
                简历 JSON 文件
                <select
                  className="comic-input"
                  value={resumeFileId}
                  onChange={(e) => setResumeFileId(e.target.value)}
                >
                  {resumeFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name}
                      {file.isDefault ? '（默认）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="comic-label interview-label">
                问题上限
                <input
                  className="comic-input"
                  type="number"
                  min={3}
                  max={20}
                  value={maxQuestions}
                  onChange={(e) =>
                    setMaxQuestions(Math.min(20, Math.max(3, Number(e.target.value) || 6)))
                  }
                />
              </label>
            </div>
            <div className="interview-context-grid mt-2">
              <label className="comic-label interview-label">
                轮次
                <select
                  className="comic-input"
                  value={round}
                  onChange={(e) => setRound(e.target.value as InterviewRound)}
                >
                  <option value="tech_first">技术一面</option>
                  <option value="tech_second">技术二面</option>
                  <option value="tech_third">技术三面</option>
                  <option value="manager">主管面</option>
                  <option value="hr">HR 面</option>
                </select>
              </label>
              <label className="comic-label interview-label">
                模式
                <select
                  className="comic-input"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as InterviewMode)}
                >
                  <option value="gentle">温和</option>
                  <option value="realistic">真实</option>
                  <option value="pressure">压力</option>
                </select>
              </label>
            </div>
          </div>

          <div className="interview-block interview-config-block mt-2">
            <div className="interview-block-tag">岗位上下文</div>
            <div className="interview-context-grid">
              <label className="comic-label interview-label">
                公司
                <input
                  className="comic-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </label>
              <label className="comic-label interview-label">
                岗位
                <input
                  className="comic-input"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </label>
            </div>
            <label className="comic-label block">
              JD / 岗位描述
              <textarea
                className="comic-input interview-jd"
                rows={6}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </label>
          </div>

          <div className="deep-control-row mt-3">
            <button
              className="comic-btn interview-start-btn"
              type="button"
              disabled={!canPrepare || busy || session?.status === 'INTERVIEWING'}
              onClick={() => void createPrepareAndStart()}
            >
              {busy && !session ? '准备中...' : '启动深度面试'}
            </button>
            <button
              className="comic-btn alt"
              type="button"
              disabled={!session || busy || session.status === 'COMPLETED'}
              onClick={() => void endInterview()}
            >
              结束
            </button>
          </div>

          {progress ? (
            <div className="deep-progress-strip mt-3">
              <span>
                {progress.questionCount}/{progress.maxQuestions}
              </span>
              <span>
                {progress.coveredCompetencies}/{progress.totalCompetencies}
              </span>
              <span>{session?.status ?? 'CREATED'}</span>
            </div>
          ) : null}
          {error ? <div className="comic-error mt-3">{error}</div> : null}
          {report ? (
            <div className="deep-report-card mt-3">
              <div className="interview-block-tag">复盘报告</div>
              <p className="deep-report-summary">{report.summary}</p>
              <div className="deep-report-grid">
                <div>
                  <div className="deep-report-title">优势</div>
                  <ul>
                    {report.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="deep-report-title">改进</div>
                  <ul>
                    {report.weaknesses.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {report.competencySummary?.length ? (
                <div className="deep-report-section">
                  <div className="deep-report-title">能力画像</div>
                  <div className="deep-report-pills">
                    {report.competencySummary.map((item) => (
                      <span key={item.competencyId}>
                        {item.name} {item.score}/5 · {Math.round(item.confidence * 100)}%
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {report.claimSummary?.length ? (
                <div className="deep-report-section">
                  <div className="deep-report-title">Claim 证据</div>
                  <div className="deep-claim-list">
                    {report.claimSummary.slice(0, 6).map((claim) => (
                      <div key={claim.claimId} className="deep-claim-item">
                        <b>{claim.status}</b>
                        <span>{claim.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="deep-memory-card mt-3">
            <div className="interview-block-tag">长期记忆</div>
            {longTermMemory.length ? (
              <div className="deep-memory-list">
                {longTermMemory.map((entry) => (
                  <div key={entry.id} className="deep-memory-item">
                    <div className="deep-memory-head">
                      <span>{memoryKindLabels[entry.kind]}</span>
                      <button
                        className="deep-memory-delete"
                        type="button"
                        disabled={memoryDeletingId === entry.id}
                        onClick={() => void deleteMemoryEntry(entry.id)}
                      >
                        {memoryDeletingId === entry.id ? '删除中' : '删除'}
                      </button>
                    </div>
                    <p>{entry.conclusion}</p>
                    <div className="deep-memory-meta">
                      {entry.occurrences} 次 · {entry.evidenceSessionIds.length} 场 ·{' '}
                      {new Date(entry.lastSeenAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="deep-memory-empty">暂无长期记忆。</p>
            )}
          </div>
        </div>

        <div className="interview-right">
          <div className="interview-result action-lines-stage deep-chat-stage">
            <div className="interview-block-tag interview-question-tag">对话</div>
            <div className="deep-chat-list">
              {rows.length === 0 ? (
                <p className="interview-opening empty">启动后显示深度面试对话。</p>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className={`deep-chat-row ${row.role}`}>
                    <div className="deep-chat-role">
                      {row.role === 'candidate'
                        ? '候选人'
                        : row.role === 'interviewer'
                          ? '面试官'
                          : '系统'}
                    </div>
                    <div className="deep-chat-text">{row.text}</div>
                  </div>
                ))
              )}
            </div>

            <div className="deep-answer-box">
              <textarea
                className="comic-input deep-answer-input"
                rows={5}
                value={answer}
                disabled={session?.status !== 'INTERVIEWING' || busy}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <button
                className="comic-btn deep-answer-btn"
                type="button"
                disabled={!canAnswer}
                onClick={() => void submitAnswer()}
              >
                发送回答
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
