'use client';

import { useMemo, useState } from 'react';

type SearchDepth = 'quick' | 'standard' | 'deep';

type SearchQuery = {
  query: string;
  intent: string;
  priority: number;
  platform?: string;
};

type AgentTraceEvent = {
  step: string;
  round?: number;
  message: string;
  data?: unknown;
  createdAt: string;
};

type RankedQuestion = {
  question: string;
  type: string;
  topic: string;
  score: number;
  reason: string;
  frequency: number;
  sourceUrls: string[];
  evidences: string[];
  expectedPoints: string[];
};

type InterviewSearchResponse = {
  taskId: string;
  input: {
    company: string;
    position: string;
    jd: string;
    resume?: string;
    searchDepth: SearchDepth;
  };
  jdProfile: {
    roleType: string;
    responsibilities: string[];
    requiredSkills: string[];
    technicalKeywords: string[];
    companyAliases: string[];
    roleAliases: string[];
  };
  trace: AgentTraceEvent[];
  queries: SearchQuery[];
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceDomain: string;
  }>;
  questions: Array<{
    question: string;
    type: string;
    topic: string;
    evidence: string;
    sourceUrl: string;
  }>;
  clusters: Array<{
    id: string;
    representativeQuestion: string;
    topic: string;
    frequency: number;
    sourceUrls: string[];
  }>;
  rankedQuestions: RankedQuestion[];
  deepInterview: {
    opening: string;
    strategy: string;
    questions: Array<{
      question: string;
      focus: string;
      whyAsk: string;
      followUp: string;
      expectedAnswer: string;
      expectedPoints: string[];
      sourceUrls: string[];
      evidences: string[];
      origin: 'search' | 'synthesis';
    }>;
  };
  report: {
    summary: string;
    jdKeywords: string[];
    experienceDigests: Array<{
      platform: string;
      summary: string;
      sourceUrls: string[];
      evidences: string[];
    }>;
    practiceSet: RankedQuestion[];
    topQuestions: RankedQuestion[];
    jdRelatedQuestions: RankedQuestion[];
    projectFollowupQuestions: RankedQuestion[];
    reviewPlan: Array<{
      topic: string;
      priority: 'high' | 'medium' | 'low';
      reason: string;
      suggestedPreparation: string[];
    }>;
    sourceSummary: {
      totalSources: number;
      readableSources: number;
      sourceDomains: string[];
    };
  };
};

export default function InterviewSearchPage() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

  const [company, setCompany] = useState('智谱 AI');
  const [position, setPosition] = useState('大模型数据实习生');
  const [jd, setJd] = useState(
    '参与大规模语料清洗、去重、质量评估、Tokenizer 分析、预训练数据策略实验，熟悉 Python/Spark 优先。',
  );
  const [resume, setResume] = useState('');
  const [searchDepth, setSearchDepth] = useState<SearchDepth>('quick');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InterviewSearchResponse | null>(null);

  const traceRoundSummary = useMemo(() => {
    if (!result) return [];
    return result.trace
      .filter((x) => x.step === 'coverage_reviewed' || x.step === 'start_round')
      .map((x) => ({
        round: x.round ?? (typeof (x.data as { round?: number })?.round === 'number'
          ? Number((x.data as { round?: number }).round)
          : 0),
        step: x.step,
        message: x.message,
        data: x.data,
      }));
  }, [result]);

  const finalQuestions = useMemo(() => {
    if (!result) return [];
    const deep = result.deepInterview?.questions ?? [];
    if (deep.length > 0) {
      return deep.map((q, idx) => ({
        index: idx + 1,
        question: q.question,
        type: q.origin,
        topic: q.focus || '综合',
        sourceUrls: q.sourceUrls ?? [],
        evidences: q.evidences ?? [],
      }));
    }
    return result.rankedQuestions.slice(0, 30).map((q, idx) => ({
      index: idx + 1,
      question: q.question,
      type: q.type,
      topic: q.topic,
      sourceUrls: q.sourceUrls ?? [],
      evidences: q.evidences ?? [],
    }));
  }, [result]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${apiBaseUrl}/api/interview-search/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company.trim(),
          position: position.trim(),
          jd: jd.trim(),
          resume: resume.trim() || undefined,
          searchDepth,
        }),
      });
      const data = (await resp.json()) as InterviewSearchResponse | { message?: string };
      if (!resp.ok) {
        throw new Error((data as { message?: string }).message ?? `请求失败(${resp.status})`);
      }
      setResult(data as InterviewSearchResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : '运行失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full p-3 lg:p-4">
      <div className="mb-4 comic-hero-wall">
        <div className="comic-hero-panel">
          <h1 className="comic-hero-main">JD-aware Interview DeepSearch Agent</h1>
        </div>
      </div>

      <div className="comic-panel p-3">
        <div className="comic-banner">SEARCH INPUT</div>
        <div className="interview-two-col">
          <div className="interview-left">
            <div className="interview-block interview-config-block">
              <div className="interview-block-tag">基础参数</div>
              <div className="interview-grid">
                <label className="comic-label interview-label">
                  公司名称
                  <input
                    className="comic-input"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="例如：字节跳动"
                  />
                </label>
                <label className="comic-label interview-label">
                  岗位名称
                  <input
                    className="comic-input"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="例如：大模型数据实习生"
                  />
                </label>
              </div>
              <label className="comic-label block mt-2">
                JD 文本
                <textarea
                  className="comic-input interview-jd"
                  rows={7}
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                />
              </label>
              <label className="comic-label block mt-2">
                候选人简历 / 项目经历（可选）
                <textarea
                  className="comic-input interview-jd"
                  rows={5}
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  placeholder="可粘贴项目经历，提升项目追问预测质量"
                />
              </label>
              <label className="comic-label block mt-2">
                搜索深度
                <select
                  className="comic-input"
                  value={searchDepth}
                  onChange={(e) => setSearchDepth(e.target.value as SearchDepth)}
                >
                  <option value="quick">quick (1 round)</option>
                  <option value="standard">standard (2 rounds)</option>
                  <option value="deep">deep (3 rounds)</option>
                </select>
              </label>
              <div className="mt-3">
                <button
                  className="comic-btn interview-start-btn"
                  type="button"
                  onClick={() => void run()}
                  disabled={loading || !company.trim() || !position.trim() || !jd.trim()}
                >
                  {loading ? '搜索中...' : '开始搜索'}
                </button>
              </div>
              {error ? <div className="comic-error mt-3">{error}</div> : null}
            </div>
          </div>

          <div className="interview-right">
            <div className="interview-result action-lines-stage">
              <div className="interview-block-tag">运行过程</div>
              {!result ? (
                <p className="interview-opening empty">运行后这里会展示 Agent trace 与轮次信息。</p>
              ) : (
                <div className="interview-history-list">
                  <div className="interview-history-item">
                    <span className="interview-history-role">TaskId: {result.taskId}</span>
                    <span className="interview-history-time">
                      rounds: {new Set(result.trace.map((x) => x.round).filter(Boolean)).size || 1}
                    </span>
                  </div>
                  {traceRoundSummary.map((x, idx) => (
                    <div key={`${x.step}-${idx}`} className="interview-history-item">
                      <span className="interview-history-role">
                        Round {x.round || '-'} · {x.step}
                      </span>
                      <span className="interview-history-time">{x.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {result ? (
        <div className="comic-panel p-3 mt-3">
          <div className="comic-banner">面试问题输出</div>
          <div className="interview-block interview-config-block">
            <div className="interview-block-tag">JD 关键词</div>
            <div className="meta">{result.report.jdKeywords.join(' | ') || '无'}</div>
          </div>
          <div className="interview-block mt-2">
            <div className="interview-block-tag">各平台面经总结</div>
            <div className="interview-history-list">
              {(result.report.experienceDigests ?? []).map((d, idx) => (
                <div key={`${d.platform}-${idx}`} className="interview-history-item">
                  <span className="interview-history-role">
                    {d.platform}
                  </span>
                  <span className="interview-history-time">来源 {d.sourceUrls.length} 条</span>
                  <div className="text-xs mt-1">{d.summary}</div>
                  <div className="text-xs mt-1">
                    证据：{d.evidences.length > 0 ? d.evidences.slice(0, 2).join(' / ') : '无'}
                  </div>
                  <div className="text-xs mt-1">
                    支撑链接：
                    {d.sourceUrls.length === 0 ? (
                      ' 无'
                    ) : (
                      <>
                        {' '}
                        {d.sourceUrls.slice(0, 3).map((url, i) => (
                          <a
                            key={`${url}-${i}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline ml-1"
                          >
                            [{i + 1}]
                          </a>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="interview-block mt-2">
            <div className="interview-block-tag">套题输出（带支撑链接）</div>
            {result.deepInterview?.opening ? (
              <div className="interview-opening">{result.deepInterview.opening}</div>
            ) : null}
            {result.deepInterview?.strategy ? (
              <div className="interview-unsaved-note">{result.deepInterview.strategy}</div>
            ) : null}
            <div className="interview-history-list">
              {(result.report.practiceSet?.length
                ? finalQuestions
                : finalQuestions
              ).map((q, idx) => (
                <div key={`${q.question}-${idx}`} className="interview-history-item">
                  <span className="interview-history-role">
                    {idx + 1}. {q.question}
                  </span>
                  <span className="interview-history-time">
                    {q.type} · {q.topic}
                  </span>
                  <div className="text-xs mt-1">
                    证据：{(q.evidences ?? []).length > 0 ? (q.evidences ?? []).slice(0, 2).join(' / ') : '无'}
                  </div>
                  <div className="text-xs mt-1">
                    支撑链接：
                    {(q.sourceUrls ?? []).length === 0 ? (
                      ' 无'
                    ) : (
                      <>
                        {' '}
                        {(q.sourceUrls ?? []).slice(0, 3).map((url, i) => (
                          <a
                            key={`${url}-${i}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline ml-1"
                          >
                            [{i + 1}]
                          </a>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
