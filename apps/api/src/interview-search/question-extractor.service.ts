import { Injectable } from '@nestjs/common';
import {
  resolveInterviewApiKey,
  resolveInterviewBaseUrl,
  resolveInterviewEnableThinking,
  resolveInterviewModel,
} from '../llm/interview-provider.config';
import {
  ExtractedQuestion,
  JdProfile,
  ReadPage,
} from './types/interview-search.types';

@Injectable()
export class QuestionExtractorService {
  getProviderName(): 'llm' | 'rules' {
    return this.resolveApiKey() ? 'llm' : 'rules';
  }

  async extractFromPage(page: ReadPage, profile: JdProfile): Promise<ExtractedQuestion[]> {
    const apiKey = this.resolveApiKey();
    if (apiKey) {
      const viaLlm = await this.extractViaLlm(page, profile);
      if (viaLlm.length > 0) return viaLlm;
    }
    return this.extractByRules(page, profile);
  }

  private async extractViaLlm(page: ReadPage, profile: JdProfile): Promise<ExtractedQuestion[]> {
    try {
      const apiKey = this.resolveApiKey();
      if (!apiKey) return [];
      const baseUrl = (this.resolveBaseUrl() || 'https://api.openai.com/v1').replace(
        /\/+$/,
        '',
      );
      const model = this.resolveModel() || 'gpt-4o-mini';
      const enableThinking = resolveInterviewEnableThinking(baseUrl);
      const body: Record<string, unknown> = {
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              '你是面经信息抽取器。只从原文抽取真实出现或明确暗示的问题。无信息返回空数组。只返回JSON。',
          },
          {
            role: 'user',
            content: `JD关键词：${profile.technicalKeywords.join(', ')}\n网页正文：${page.content.slice(0, 8000)}\n输出JSON: {"questions":[{"question":"", "type":"technical|project|algorithm|hr|system_design|unknown","topic":"","evidence":"","confidence":0.0,"jdKeywordsMatched":[""]}]}`,
          },
        ],
      };
      if (enableThinking !== undefined) {
        body.enable_thinking = enableThinking;
      }
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) return [];
      const data = (await resp.json()) as Record<string, unknown>;
      const text = this.extractTextContent(data);
      const parsed = this.tryParseJson(text);
      const rows = Array.isArray(parsed?.questions) ? parsed.questions : [];
      return rows
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const obj = row as Record<string, unknown>;
          const question = String(obj.question ?? '').trim();
          if (!question) return null;
          return {
            question,
            normalizedQuestion: this.normalizeQuestion(question),
            type: this.asQuestionType(String(obj.type ?? 'unknown')),
            topic: String(obj.topic ?? '未知').trim() || '未知',
            evidence: String(obj.evidence ?? '').trim().slice(0, 280),
            sourceUrl: page.url,
            confidence: this.safeConfidence(obj.confidence),
            jdKeywordsMatched: Array.isArray(obj.jdKeywordsMatched)
              ? obj.jdKeywordsMatched.map((x) => String(x).trim()).filter(Boolean)
              : [],
          } satisfies ExtractedQuestion;
        })
        .filter((x): x is ExtractedQuestion => Boolean(x));
    } catch {
      return [];
    }
  }

  private extractByRules(page: ReadPage, profile: JdProfile): ExtractedQuestion[] {
    const lines = page.content.split(/[。\n!?！]/).map((x) => x.trim()).filter(Boolean);
    const signals = ['问了', '面试官问', '问题', '一面', '二面', 'hr', '算法题', '项目'];
    const picked = lines.filter((line) => signals.some((k) => line.toLowerCase().includes(k.toLowerCase())));

    return picked.slice(0, 12).map((line) => {
      const q = this.toQuestion(line);
      const matched = profile.technicalKeywords.filter((k) =>
        q.toLowerCase().includes(k.toLowerCase()),
      );
      return {
        question: q,
        normalizedQuestion: this.normalizeQuestion(q),
        type: this.ruleType(q),
        topic: matched[0] ?? '通用',
        evidence: line.slice(0, 280),
        sourceUrl: page.url,
        confidence: 0.5,
        jdKeywordsMatched: matched,
      };
    });
  }

  private toQuestion(text: string): string {
    const cleaned = text.replace(/^.*?(问了|面试官问|问题[:：])/, '').trim();
    if (!cleaned) return '请介绍你负责的项目及关键技术难点？';
    return cleaned.endsWith('？') || cleaned.endsWith('?') ? cleaned : `${cleaned}？`;
  }

  private ruleType(question: string): ExtractedQuestion['type'] {
    const q = question.toLowerCase();
    if (q.includes('算法')) return 'algorithm';
    if (q.includes('项目') || q.includes('怎么做') || q.includes('为什么')) return 'project';
    if (q.includes('hr') || q.includes('自我介绍')) return 'hr';
    if (q.includes('架构') || q.includes('设计')) return 'system_design';
    if (q.includes('python') || q.includes('spark') || q.includes('tokenizer')) return 'technical';
    return 'unknown';
  }

  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[，。！？?、,.!;；:："'`~()\[\]{}<>]/g, '')
      .replace(/(讲一下|说一下|介绍一下|请解释)/g, '')
      .trim();
  }

  private extractTextContent(data: Record<string, unknown>): string {
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const first = choices[0];
    if (!first || typeof first !== 'object') return '';
    const message = (first as { message?: { content?: unknown } }).message;
    if (message && typeof message.content === 'string') return message.content;
    return '';
  }

  private tryParseJson(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const m = text.match(/```json\s*([\s\S]*?)```/i);
      if (!m) return null;
      try {
        return JSON.parse(m[1]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  private asQuestionType(input: string): ExtractedQuestion['type'] {
    const allowed: ExtractedQuestion['type'][] = [
      'technical',
      'project',
      'algorithm',
      'hr',
      'system_design',
      'unknown',
    ];
    return allowed.includes(input as ExtractedQuestion['type'])
      ? (input as ExtractedQuestion['type'])
      : 'unknown';
  }

  private safeConfidence(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.5;
    return Math.max(0, Math.min(1, n));
  }

  private resolveApiKey(): string {
    return resolveInterviewApiKey();
  }

  private resolveBaseUrl(): string {
    return resolveInterviewBaseUrl(undefined, '');
  }

  private resolveModel(): string {
    return resolveInterviewModel(undefined, '');
  }
}
