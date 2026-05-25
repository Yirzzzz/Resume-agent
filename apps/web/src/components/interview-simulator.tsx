'use client';

import { useEffect, useMemo, useState } from 'react';

type ResumeFileSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type InterviewQuestion = {
  category?: string;
  question: string;
  focus?: string;
  followUp?: string;
  expectedAnswer?: string;
  expectedPoints?: string[];
};

type InterviewResult = {
  opening?: string;
  interviewRole?: string;
  questions?: InterviewQuestion[];
  scoreCriteria?: string[];
  tips?: string[];
};

type InterviewHistoryRecord = {
  id: string;
  createdAt: string;
  resumeFileId: string;
  companyName: string;
  targetPosition: string;
  favoriteQuestionIndices: number[];
  result: InterviewResult;
};

const INTERVIEW_HISTORY_STORAGE_KEY = 'resume-agent:interview-history:v2';
const INTERVIEW_HISTORY_LIMIT = 20;

const uid = () => Math.random().toString(36).slice(2, 10);

export function InterviewSimulator({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [rounds, setRounds] = useState(6);
  const [companyName, setCompanyName] = useState('字节跳动');
  const [targetPosition, setTargetPosition] = useState('AI 应用算法工程师');
  const [jobDescription, setJobDescription] = useState('');
  const [resumeFiles, setResumeFiles] = useState<ResumeFileSummary[]>([]);
  const [resumeFileId, setResumeFileId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<InterviewHistoryRecord[]>([]);
  const [draftRecord, setDraftRecord] = useState<InterviewHistoryRecord | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const activeRecord = useMemo(
    () => history.find((x) => x.id === activeHistoryId) ?? null,
    [activeHistoryId, history],
  );
  const displayRecord = draftRecord ?? activeRecord;
  const activeResult = displayRecord?.result ?? null;
  const currentFavorites = displayRecord?.favoriteQuestionIndices ?? [];
  const questions = activeResult?.questions ?? [];
  const currentQuestion =
    questions.length > 0
      ? questions[Math.min(currentQuestionIndex, questions.length - 1)]
      : null;

  useEffect(() => {
    try {
      const rawHistory = localStorage.getItem(INTERVIEW_HISTORY_STORAGE_KEY);
      if (!rawHistory) return;
      const parsed = JSON.parse(rawHistory) as InterviewHistoryRecord[];
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .filter((x) => x && typeof x === 'object')
        .map((item) => ({
          id: String(item.id ?? uid()),
          createdAt: String(item.createdAt ?? new Date().toISOString()),
          resumeFileId: String(item.resumeFileId ?? ''),
          companyName: String(item.companyName ?? ''),
          targetPosition: String(item.targetPosition ?? ''),
          favoriteQuestionIndices: Array.isArray(item.favoriteQuestionIndices)
            ? item.favoriteQuestionIndices
                .map((x) => Number(x))
                .filter((x) => Number.isInteger(x) && x >= 0)
            : [],
          result: (item.result ?? {}) as InterviewResult,
        }));
      setHistory(normalized);
      if (normalized[0]) {
        setActiveHistoryId(normalized[0].id);
        setCurrentQuestionIndex(0);
      }
    } catch {
      // ignore corrupted history
    }
  }, []);

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const resp = await fetch(`${apiBaseUrl}/resume-files`, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`加载简历文件失败（${resp.status}）`);
        const data = (await resp.json()) as ResumeFileSummary[];
        setResumeFiles(data);
        const preferred = data.find((x) => x.isDefault)?.id ?? data[0]?.id ?? '';
        setResumeFileId(preferred);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载简历文件失败');
      }
    };
    void loadFiles();
  }, [apiBaseUrl]);


  const canStart = useMemo(
    () =>
      Boolean(
        resumeFileId && companyName.trim() && targetPosition.trim(),
      ),
    [companyName, resumeFileId, targetPosition],
  );

  const persistHistory = (records: InterviewHistoryRecord[]) => {
    try {
      localStorage.setItem(INTERVIEW_HISTORY_STORAGE_KEY, JSON.stringify(records));
    } catch {
      // ignore storage failure
    }
  };

  const startInterview = async () => {
    if (!canStart) return;
    setLoading(true);
    setError(null);
    setRevealed({});
    try {
      const resp = await fetch(`${apiBaseUrl}/interview/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeFileId,
          companyName: companyName.trim(),
          targetPosition: targetPosition.trim(),
          interviewRole: targetPosition.trim(),
          rounds,
          jobDescription: jobDescription.trim(),
        }),
      });
      const data = (await resp.json()) as InterviewResult | { message?: string };
      if (!resp.ok) {
        const msg =
          typeof (data as { message?: string }).message === 'string'
            ? (data as { message?: string }).message
            : `模拟面试失败（${resp.status}）`;
        throw new Error(msg);
      }

      const nextRecord: InterviewHistoryRecord = {
        id: uid(),
        createdAt: new Date().toISOString(),
        resumeFileId,
        companyName: companyName.trim(),
        targetPosition: targetPosition.trim(),
        favoriteQuestionIndices: [],
        result: data as InterviewResult,
      };
      setDraftRecord(nextRecord);
      setActiveHistoryId('');
      setCurrentQuestionIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '模拟面试失败');
    } finally {
      setLoading(false);
    }
  };

  const saveDraftInterview = () => {
    if (!draftRecord) return;
    const nextHistory = [draftRecord, ...history].slice(0, INTERVIEW_HISTORY_LIMIT);
    setHistory(nextHistory);
    setActiveHistoryId(draftRecord.id);
    setDraftRecord(null);
    setRevealed({});
    persistHistory(nextHistory);
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const goNextQuestion = () => {
    if (questions.length === 0) return;
    setCurrentQuestionIndex((idx) => Math.min(idx + 1, questions.length - 1));
  };

  const goPrevQuestion = () => {
    if (questions.length === 0) return;
    setCurrentQuestionIndex((idx) => Math.max(idx - 1, 0));
  };

  const toggleFavoriteCurrent = () => {
    if (!displayRecord || !currentQuestion) return;
    const idx = currentQuestionIndex;
    const toggle = (list: number[]) =>
      list.includes(idx) ? list.filter((x) => x !== idx) : [...list, idx].sort((a, b) => a - b);

    if (draftRecord && draftRecord.id === displayRecord.id) {
      setDraftRecord({
        ...draftRecord,
        favoriteQuestionIndices: toggle(draftRecord.favoriteQuestionIndices),
      });
      return;
    }

    const nextHistory = history.map((record) =>
      record.id === displayRecord.id
        ? { ...record, favoriteQuestionIndices: toggle(record.favoriteQuestionIndices) }
        : record,
    );
    setHistory(nextHistory);
    persistHistory(nextHistory);
  };

  return (
    <div className="comic-panel p-3 interview-panel">
      <div className="comic-banner">AI MOCK INTERVIEW</div>
      <div className="interview-top-actions">
        <button className="comic-btn alt" type="button" onClick={() => setShowHistoryModal(true)}>
          历史记录
        </button>
      </div>

      <div className="interview-two-col">
        <div className="interview-left">
          <div className="interview-block interview-config-block">
            <div className="interview-block-tag">基础参数</div>
            <div className="interview-grid">
              <label className="comic-label interview-label">
                简历 JSON 文件
                <select
                  className="comic-input"
                  value={resumeFileId}
                  onChange={(e) => setResumeFileId(e.target.value)}
                >
                  {resumeFiles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.isDefault ? '（默认）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="comic-label interview-label">
                题目数量
                <input
                  className="comic-input"
                  type="number"
                  min={3}
                  max={12}
                  value={rounds}
                  onChange={(e) =>
                    setRounds(Math.min(12, Math.max(3, Number(e.target.value) || 6)))
                  }
                />
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
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="例如：字节跳动"
                />
              </label>
              <label className="comic-label interview-label">
                岗位
                <input
                  className="comic-input"
                  value={targetPosition}
                  onChange={(e) => setTargetPosition(e.target.value)}
                  placeholder="例如：AI 应用算法工程师"
                />
              </label>
            </div>
            <label className="comic-label block">
              JD / 岗位描述（可选）
              <textarea
                className="comic-input interview-jd"
                rows={6}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="粘贴岗位描述，提升问题针对性"
              />
            </label>
          </div>

          <div className="mt-3">
            <button
              className="comic-btn interview-start-btn"
              type="button"
              disabled={!canStart || loading}
              onClick={() => void startInterview()}
            >
              {loading ? '生成中...' : '开始模拟面试'}
            </button>
          </div>
          {error ? <div className="comic-error mt-3">{error}</div> : null}
        </div>

        <div className="interview-right">
          <div className="interview-result action-lines-stage">
            <div className="interview-block-tag interview-question-tag">面试问题</div>
            {draftRecord ? (
              <div className="interview-unsaved-note">
                当前为未保存模拟面试
                <button
                  className="comic-btn alt interview-save-btn"
                  type="button"
                  onClick={saveDraftInterview}
                >
                  保存模拟面试
                </button>
              </div>
            ) : null}
            {activeResult?.opening ? (
              <p className="interview-opening">{activeResult.opening}</p>
            ) : (
              <p className="interview-opening empty">选择或生成一次模拟面试后，这里显示问题。</p>
            )}

            {currentQuestion ? (
              <div className="interview-bubble-list">
                <div className="interview-action-card">
                  <div className="interview-bubble">
                    <div className="interview-bubble-head">
                      <span className="interview-badge">
                        {currentQuestion.category === 'fundamental' ? '基础问题' : '项目问题'}
                      </span>
                      {currentQuestion.focus ? (
                        <span className="interview-bubble-focus">{currentQuestion.focus}</span>
                      ) : null}
                    </div>
                    <div className="interview-bubble-q">
                      {currentQuestionIndex + 1}. {currentQuestion.question}
                    </div>
                    {currentQuestion.followUp ? (
                      <div className="interview-bubble-follow">追问：{currentQuestion.followUp}</div>
                    ) : null}
                    <button
                      className={`interview-fav-btn ${currentFavorites.includes(currentQuestionIndex) ? 'active' : ''}`}
                      type="button"
                      onClick={toggleFavoriteCurrent}
                    >
                      {currentFavorites.includes(currentQuestionIndex) ? '★ 已收藏' : '☆ 收藏问题'}
                    </button>
                    <button
                      className="interview-reveal-btn"
                      type="button"
                      onClick={() =>
                        toggleReveal(`${displayRecord?.id ?? 'draft'}-${currentQuestionIndex}`)
                      }
                    >
                      {revealed[`${displayRecord?.id ?? 'draft'}-${currentQuestionIndex}`]
                        ? '隐藏期望答案'
                        : '显示期望答案'}
                    </button>
                    {revealed[`${displayRecord?.id ?? 'draft'}-${currentQuestionIndex}`] ? (
                      <div className="interview-expected">
                        {currentQuestion.expectedAnswer ? (
                          <div className="interview-expected-answer">
                            {currentQuestion.expectedAnswer}
                          </div>
                        ) : null}
                        {Array.isArray(currentQuestion.expectedPoints) &&
                        currentQuestion.expectedPoints.length > 0 ? (
                          <ul className="interview-expected-points">
                            {currentQuestion.expectedPoints.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="interview-next-hero-btn"
                    type="button"
                    onClick={goNextQuestion}
                    disabled={currentQuestionIndex >= questions.length - 1}
                    title="下一个问题"
                  >
                    <span className="next-arrow-glyph">➜</span>
                    <span className="next-arrow-label">NEXT</span>
                  </button>
                </div>
                <div className="interview-nav">
                  <span className="interview-nav-progress">
                    {currentQuestionIndex + 1} / {questions.length}
                  </span>
                  <div className="interview-nav-controls">
                    <button
                      className="interview-next-btn"
                      type="button"
                      onClick={goPrevQuestion}
                      disabled={currentQuestionIndex <= 0}
                      title="上一条问题"
                    >
                      ◀
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showHistoryModal ? (
        <div className="comic-modal-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div className="comic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="comic-modal-head">
              <div className="comic-subtitle">历史模拟记录</div>
              <button className="comic-btn" type="button" onClick={() => setShowHistoryModal(false)}>
                关闭
              </button>
            </div>
            <div className="interview-history-list">
              {history.length === 0 ? (
                <div className="interview-history-empty">暂无历史记录</div>
              ) : (
                history.map((record) => (
                  <button
                    key={record.id}
                    className={`interview-history-item ${record.id === activeHistoryId ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      setActiveHistoryId(record.id);
                      setDraftRecord(null);
                      setCurrentQuestionIndex(0);
                      setRevealed({});
                      setShowHistoryModal(false);
                    }}
                  >
                    <span className="interview-history-role">
                      {record.companyName || '目标公司'} / {record.targetPosition || '技术岗位'}
                      {record.favoriteQuestionIndices.length > 0
                        ? ` ★${record.favoriteQuestionIndices.length}`
                        : ''}
                    </span>
                    <span className="interview-history-time">
                      {new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
