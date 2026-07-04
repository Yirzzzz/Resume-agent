import { Injectable } from '@nestjs/common';
import {
  resolveInterviewApiKey,
  resolveInterviewBaseUrl,
  resolveInterviewEnableThinking,
  resolveInterviewModel,
} from '../llm/interview-provider.config';
import {
  DeepInterviewQuestion,
  DeepInterviewResult,
  InterviewSearchInput,
  JdProfile,
  RankedQuestion,
} from './types/interview-search.types';

type StyleBlueprint = {
  commonAsks: string[];
  frequentFocus: string[];
  followupPatterns: string[];
};

type ResumeAnchor = {
  label: string;
  kind: 'experience' | 'project' | 'section' | 'skill';
};

@Injectable()
export class DeepInterviewComposerService {
  async compose(params: {
    input: InterviewSearchInput;
    profile: JdProfile;
    ranked: RankedQuestion[];
  }): Promise<DeepInterviewResult> {
    const { input, profile, ranked } = params;
    const resumeAnchors = this.extractResumeAnchors(input.resume);
    const filtered = this.filterRelevant(input, profile, ranked);
    const topN = this.targetQuestionCount(input.searchDepth);
    const candidates = filtered.slice(0, Math.max(topN, 16));
    const style = this.buildStyleBlueprint(candidates);

    const llm = await this.composeWithLlm(
      input,
      profile,
      candidates,
      topN,
      style,
      resumeAnchors,
    );
    if (llm) return llm;

    return this.composeByRules(
      input,
      profile,
      candidates,
      topN,
      style,
      resumeAnchors,
    );
  }

  private filterRelevant(
    input: InterviewSearchInput,
    profile: JdProfile,
    ranked: RankedQuestion[],
  ): RankedQuestion[] {
    const kw = [
      input.company,
      input.position,
      ...profile.technicalKeywords,
      ...profile.roleAliases,
    ]
      .map((x) => String(x ?? '').toLowerCase().trim())
      .filter(Boolean);

    const score = (q: RankedQuestion) => {
      const text = `${q.question} ${q.topic} ${q.reason}`.toLowerCase();
      const hits = kw.filter((k) => text.includes(k)).length;
      const roleBonus =
        /项目|实现|优化|数据|算法|模型|训练|评估|tokenizer|spark|python/i.test(
          q.question,
        )
          ? 1
          : 0;
      return q.score + hits * 0.08 + roleBonus * 0.05;
    };

    return [...ranked]
      .map((q) => ({ q, s: score(q) }))
      .filter((x) => x.s >= 0.22)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.q);
  }

  private buildStyleBlueprint(candidates: RankedQuestion[]): StyleBlueprint {
    const asks = [
      '为什么选这个方案，不选其他方案',
      '请展开具体实现细节与模块边界',
      '请给出量化指标与验证方法',
      '如果线上部署，延迟/成本/稳定性如何权衡',
      '数据规模放大后，方案是否还能成立',
      '失败案例是什么，如何修复',
    ];

    const focusCounter = new Map<string, number>();
    for (const c of candidates) {
      const topic = String(c.topic ?? '').trim();
      if (!topic) continue;
      focusCounter.set(topic, (focusCounter.get(topic) ?? 0) + 1);
    }
    const frequentFocus = [...focusCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map((x) => x[0]);

    const followupPatterns = [
      '请按数据流顺序讲清输入、处理中间态、输出及失败兜底。',
      '请给出一次你亲自做过的优化，包含前后指标对比。',
      '如果我把约束改成更高并发或更低成本，你会怎么改。',
    ];

    return {
      commonAsks: asks,
      frequentFocus,
      followupPatterns,
    };
  }

  private async composeWithLlm(
    input: InterviewSearchInput,
    profile: JdProfile,
    candidates: RankedQuestion[],
    count: number,
    style: StyleBlueprint,
    resumeAnchors: ResumeAnchor[],
  ): Promise<DeepInterviewResult | null> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) return null;
    try {
      const baseUrl = this.resolveBaseUrl().replace(/\/+$/, '');
      const model = this.resolveModel();
      const endpoint = `${baseUrl}/chat/completions`;
      const enableThinking = resolveInterviewEnableThinking(baseUrl);
      const prompt = `
你是资深技术面试官。你的任务是：
- 先学习“候选问题池”里的出题逻辑（关注点、追问路径、评估方式），
- 再基于 JD 与岗位生成一套“新的面试题”。

重要：
1) 不要直接复用候选问题原句。
2) 题目要体现你“学到的出题方式”，但题干必须重写。
3) 每题必须带可追溯证据：sourceUrls / evidences 只能从候选池挑选，不可编造。
4) 与岗位/JD弱相关的候选问题要丢弃。
5) 项目/业务相关问题约占 80%，基础题约占 20%。
6) 如果提供了 resumeAnchors，至少 70% 题目必须显式围绕某个简历锚点提问（例如“在你的X项目中…”）。
7) 输出题量严格等于 ${count}。
8) 输出只要 JSON。

输入：
- company: ${input.company}
- position: ${input.position}
- jd: ${input.jd}
- roleType: ${profile.roleType}
- technicalKeywords: ${profile.technicalKeywords.join(', ')}
- resume(optional): ${input.resume ?? '无'}
- resumeAnchors: ${JSON.stringify(resumeAnchors, null, 2)}
- styleBlueprint: ${JSON.stringify(style, null, 2)}
- candidates: ${JSON.stringify(candidates.slice(0, 28), null, 2)}

输出 JSON：
{
  "opening": "string",
  "strategy": "string，描述你提炼出的出题逻辑",
  "questions": [
    {
      "question": "string，重写后的新题",
      "focus": "string",
      "whyAsk": "string",
      "followUp": "string",
      "expectedAnswer": "string",
      "expectedPoints": ["string"],
      "sourceUrls": ["string"],
      "evidences": ["string"],
      "origin": "synthesis"
    }
  ]
}
`;

      const body: Record<string, unknown> = {
        model,
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: '你是面试题生成器，只返回JSON。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      };
      if (enableThinking !== undefined) {
        body.enable_thinking = enableThinking;
      }

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as Record<string, unknown>;
      const content = this.extractTextContent(data);
      const parsed = this.tryParseJson(content);
      if (!parsed) return null;
      const opening = String(parsed.opening ?? '').trim() || '深度模拟面试已生成。';
      const strategy = String(parsed.strategy ?? '').trim() || '学习面经出题逻辑后按JD重写题目';
      const rows = Array.isArray(parsed.questions) ? parsed.questions : [];
      const questions = rows
        .map((x) => this.normalizeQuestion(x))
        .filter((x): x is DeepInterviewQuestion => Boolean(x))
        .map((q) => ({ ...q, origin: 'synthesis' as const }))
        .slice(0, count);
      const anchoredQuestions = this.ensureResumeAnchoredQuestions(
        questions,
        resumeAnchors,
        candidates,
        style,
        count,
      );
      if (anchoredQuestions.length === 0) return null;
      return { opening, strategy, questions: anchoredQuestions };
    } catch {
      return null;
    }
  }

  private composeByRules(
    input: InterviewSearchInput,
    profile: JdProfile,
    candidates: RankedQuestion[],
    count: number,
    style: StyleBlueprint,
    resumeAnchors: ResumeAnchor[],
  ): DeepInterviewResult {
    const keywords = this.collectKeywords(input, profile, resumeAnchors);
    const focusPool = [...style.frequentFocus, ...keywords].filter(Boolean);
    const baseTemplates = [
      (anchor: string, k: string) =>
        `在你的「${anchor}」经历里，围绕「${k}」你最终选的方案是什么？为什么不是另一套可行方案？请给出关键取舍。`,
      (anchor: string, k: string) =>
        `在「${anchor}」落地时，如果把「${k}」链路部署到线上，你如何设计延迟、成本和稳定性的平衡策略？`,
      (anchor: string, k: string) =>
        `你在「${anchor}」里针对「${k}」如何做效果评估？baseline 怎么设，指标怎么验证，结果如何解释？`,
      (anchor: string, k: string) =>
        `结合「${anchor}」，请讲一个「${k}」相关失败场景：触发条件、定位过程、修复动作和复盘结论。`,
      (anchor: string, k: string) =>
        `如果「${anchor}」的数据规模扩大 10 倍，「${k}」实现会先在哪个环节失效？你会如何重构？`,
      (anchor: string, k: string) =>
        `从工程角度看，在「${anchor}」中「${k}」模块的数据流和接口边界怎么划分，如何做监控与异常兜底？`,
    ];

    const out: DeepInterviewQuestion[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < count * 2 && out.length < count; i += 1) {
      const k = focusPool[i % Math.max(1, focusPool.length)] || profile.roleType || input.position || '项目实现';
      const anchor =
        resumeAnchors[i % Math.max(1, resumeAnchors.length)]?.label || '最近项目';
      const tpl = baseTemplates[i % baseTemplates.length];
      const question = tpl(anchor, k).trim();
      const norm = this.norm(question);
      if (seen.has(norm)) continue;
      seen.add(norm);

      const support = this.pickSupport(candidates, `${anchor} ${k}`);
      const expectedPoints = support.expectedPoints.length
        ? support.expectedPoints
        : ['背景与目标', '方案与取舍', '实现细节', '指标与复盘'];

      out.push({
        question,
        focus: `${anchor} / ${k}`,
        whyAsk: `该题对齐你简历锚点「${anchor}」与 JD 关键词「${k}」，并沿用高频面经追问路径。`,
        followUp:
          style.followupPatterns[i % Math.max(1, style.followupPatterns.length)] ||
          '请补充你亲自负责的关键环节和可量化结果。',
        expectedAnswer:
          '回答应包含业务目标、技术选型依据、实现细节、指标结果与失败复盘，避免只讲概念。',
        expectedPoints,
        sourceUrls: support.sourceUrls,
        evidences: support.evidences,
        origin: 'synthesis',
      });
    }

    return {
      opening: `基于 ${input.company || '目标公司'} / ${input.position || '目标岗位'} 的面经风格与JD约束，已生成深度模拟面试题。`,
      strategy: '先提炼面经出题模式，再按JD与简历锚点重写新题（非原题召回）',
      questions: out.slice(0, count),
    };
  }

  private pickSupport(
    candidates: RankedQuestion[],
    keyword: string,
  ): { sourceUrls: string[]; evidences: string[]; expectedPoints: string[] } {
    const key = keyword.toLowerCase();
    const sorted = [...candidates]
      .map((c) => {
        const text = `${c.question} ${c.topic} ${c.reason}`.toLowerCase();
        const hit = text.includes(key) ? 1 : 0;
        return { c, s: c.score + hit * 0.2 };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.c);

    const urls = [...new Set(sorted.flatMap((x) => x.sourceUrls || []).filter(Boolean))].slice(0, 3);
    const evidences = [...new Set(sorted.flatMap((x) => x.evidences || []).filter(Boolean))].slice(0, 2);
    const expectedPoints = [...new Set(sorted.flatMap((x) => x.expectedPoints || []).filter(Boolean))].slice(0, 5);

    return {
      sourceUrls: urls,
      evidences,
      expectedPoints,
    };
  }

  private collectKeywords(
    input: InterviewSearchInput,
    profile: JdProfile,
    resumeAnchors: ResumeAnchor[],
  ): string[] {
    const jdFromText = (input.jd.match(/[A-Za-z][A-Za-z0-9_\-+]{1,20}|[\u4e00-\u9fa5]{2,8}/g) || [])
      .map((x) => x.trim())
      .filter((x) => x.length >= 2)
      .filter((x) => !/负责|以及|能够|具备|相关|经验|优先|岗位|职位/.test(x));

    return [
      ...profile.technicalKeywords,
      ...profile.requiredSkills,
      ...profile.roleAliases,
      ...resumeAnchors.map((x) => x.label),
      ...jdFromText,
    ]
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .slice(0, 18);
  }

  private ensureResumeAnchoredQuestions(
    questions: DeepInterviewQuestion[],
    resumeAnchors: ResumeAnchor[],
    candidates: RankedQuestion[],
    style: StyleBlueprint,
    count: number,
  ): DeepInterviewQuestion[] {
    if (questions.length === 0) return questions;
    if (resumeAnchors.length === 0) return questions.slice(0, count);

    const anchorLabels = resumeAnchors.map((x) => x.label).filter(Boolean);
    const hasAnchor = (text: string) =>
      anchorLabels.some((label) => text.includes(label));

    const anchored = questions.filter((q) => hasAnchor(`${q.question} ${q.focus}`));
    const targetMin = Math.max(1, Math.ceil(count * 0.7));
    if (anchored.length >= targetMin) return questions.slice(0, count);

    const merged: DeepInterviewQuestion[] = [...questions];
    let patchCursor = 0;
    while (merged.filter((q) => hasAnchor(`${q.question} ${q.focus}`)).length < targetMin) {
      const idx = patchCursor % merged.length;
      const anchor = anchorLabels[patchCursor % anchorLabels.length];
      const q = merged[idx];
      const support = this.pickSupport(candidates, anchor);
      merged[idx] = {
        ...q,
        question: `在你的「${anchor}」经历里，${q.question}`,
        focus: q.focus ? `${anchor} / ${q.focus}` : anchor,
        sourceUrls: q.sourceUrls?.length ? q.sourceUrls : support.sourceUrls,
        evidences: q.evidences?.length ? q.evidences : support.evidences,
        followUp:
          q.followUp ||
          style.followupPatterns[patchCursor % Math.max(1, style.followupPatterns.length)] ||
          '请补充你在该经历中的具体负责范围与指标。',
      };
      patchCursor += 1;
      if (patchCursor > merged.length * 3) break;
    }
    return merged.slice(0, count);
  }

  private extractResumeAnchors(resumeRaw?: string): ResumeAnchor[] {
    const text = String(resumeRaw ?? '').trim();
    if (!text) return [];

    const anchors: ResumeAnchor[] = [];
    const seen = new Set<string>();
    const push = (label: string, kind: ResumeAnchor['kind']) => {
      const normalized = label.replace(/\s+/g, ' ').trim();
      if (!normalized || normalized.length < 2) return;
      if (/教育|校园|school|college/i.test(normalized)) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      anchors.push({ label: normalized, kind });
    };

    const parsed = this.tryParseJson(text);
    if (parsed) {
      const exp = (parsed as { experience?: unknown[] }).experience;
      if (Array.isArray(exp)) {
        for (const row of exp) {
          if (!row || typeof row !== 'object') continue;
          const company = String((row as { company?: unknown }).company ?? '').trim();
          const role = String((row as { role?: unknown }).role ?? '').trim();
          push([company, role].filter(Boolean).join(' - '), 'experience');
        }
      }

      const projects = (parsed as { projects?: unknown[] }).projects;
      if (Array.isArray(projects)) {
        for (const row of projects) {
          if (!row || typeof row !== 'object') continue;
          const title = String(
            (row as { name?: unknown; title?: unknown; project?: unknown }).name ??
              (row as { title?: unknown }).title ??
              (row as { project?: unknown }).project ??
              '',
          ).trim();
          const org = String((row as { org?: unknown }).org ?? '').trim();
          push([title, org].filter(Boolean).join(' - '), 'project');
        }
      }

      const sections = (parsed as { customSections?: unknown[] }).customSections;
      if (Array.isArray(sections)) {
        for (const section of sections) {
          if (!section || typeof section !== 'object') continue;
          const title = String((section as { title?: unknown }).title ?? '').trim();
          if (title) push(title, 'section');
          const items = (section as { items?: unknown[] }).items;
          if (Array.isArray(items)) {
            for (const item of items) {
              if (!item || typeof item !== 'object') continue;
              const itemTitle = String((item as { title?: unknown; name?: unknown }).title ?? (item as { name?: unknown }).name ?? '').trim();
              const org = String((item as { org?: unknown }).org ?? '').trim();
              push([itemTitle, org].filter(Boolean).join(' - '), 'section');
            }
          }
        }
      }

      const skills = (parsed as { skills?: unknown[] }).skills;
      if (Array.isArray(skills)) {
        for (const skill of skills.slice(0, 12)) {
          push(String(skill ?? '').trim(), 'skill');
        }
      }
    }

    if (anchors.length === 0) {
      const regex =
        /"(company|role|name|title|project|org)"\s*:\s*"([^"]{2,80})"/g;
      let match: RegExpExecArray | null = regex.exec(text);
      while (match) {
        push(match[2], 'project');
        match = regex.exec(text);
      }
    }

    return anchors.slice(0, 14);
  }

  private normalizeQuestion(node: unknown): DeepInterviewQuestion | null {
    if (!node || typeof node !== 'object') return null;
    const obj = node as Record<string, unknown>;
    const question = String(obj.question ?? '').trim();
    if (!question) return null;
    return {
      question,
      focus: String(obj.focus ?? '').trim(),
      whyAsk: String(obj.whyAsk ?? '').trim(),
      followUp: String(obj.followUp ?? '').trim(),
      expectedAnswer: String(obj.expectedAnswer ?? '').trim(),
      expectedPoints: Array.isArray(obj.expectedPoints)
        ? obj.expectedPoints.map((x) => String(x).trim()).filter(Boolean)
        : [],
      sourceUrls: Array.isArray(obj.sourceUrls)
        ? obj.sourceUrls.map((x) => String(x).trim()).filter(Boolean)
        : [],
      evidences: Array.isArray(obj.evidences)
        ? obj.evidences.map((x) => String(x).trim()).filter(Boolean)
        : [],
      origin: 'synthesis',
    };
  }

  private targetQuestionCount(depth: InterviewSearchInput['searchDepth']): number {
    if (depth === 'quick') return 8;
    if (depth === 'standard') return 12;
    return 16;
  }

  private resolveApiKey(): string {
    return resolveInterviewApiKey();
  }

  private resolveBaseUrl(): string {
    return resolveInterviewBaseUrl();
  }

  private resolveModel(): string {
    return resolveInterviewModel();
  }

  private extractTextContent(data: Record<string, unknown>): string {
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0];
    if (!first || typeof first !== 'object') return '';
    const message = (first as { message?: { content?: unknown } }).message;
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;
    return '';
  }

  private tryParseJson(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const matched = text.match(/```json\s*([\s\S]*?)```/i);
      if (!matched) return null;
      try {
        return JSON.parse(matched[1]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  private norm(text: string): string {
    return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
  }
}
