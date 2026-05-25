import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { chromium } from 'playwright';
import { ResumesService } from './resumes.service';
import { TemplatesService } from './templates.service';
import type { Resume, ResumeFileConfig } from './resume.types';

@Controller()
export class ResumesController {
  constructor(
    private readonly resumesService: ResumesService,
    private readonly templatesService: TemplatesService,
  ) {}

  // ---- Backward-compatible legacy routes ----
  @Post('resumes')
  create(@Body() body: unknown) {
    return this.resumesService.create(body);
  }

  @Get('resumes')
  findAll() {
    return this.resumesService.findAll();
  }

  @Get('resumes/:id')
  findOne(@Param('id') id: string) {
    return this.resumesService.findOne(id);
  }

  // ---- New multi-file routes ----
  @Get('resume-files')
  listResumeFiles() {
    return this.resumesService.listFiles();
  }

  @Get('resume-files/default')
  getDefaultResumeFile() {
    return this.resumesService.getDefaultFile();
  }

  @Get('resume-files/:id')
  getResumeFile(@Param('id') id: string) {
    return this.resumesService.getFile(id);
  }

  @Post('resume-files')
  createResumeFile(
    @Body()
    body: {
      name?: string;
      resume?: unknown;
      config?: ResumeFileConfig;
    },
  ) {
    return this.resumesService.createFile({
      name: body?.name,
      resume: body?.resume,
      config: body?.config,
    });
  }

  @Put('resume-files/:id')
  updateResumeFile(
    @Param('id') id: string,
    @Body()
    body: {
      resume: unknown;
      config?: ResumeFileConfig;
    },
  ) {
    return this.resumesService.updateFile(id, body.resume, body.config);
  }

  @Patch('resume-files/:id')
  renameResumeFile(
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
    },
  ) {
    return this.resumesService.renameFile(id, body.name);
  }

  @Patch('resume-files/:id/default')
  setDefaultResumeFile(@Param('id') id: string) {
    return this.resumesService.setDefaultFile(id);
  }

  @Delete('resume-files/:id')
  deleteResumeFile(@Param('id') id: string) {
    return this.resumesService.deleteFile(id);
  }

  @Get('templates')
  templates() {
    return this.templatesService.list();
  }

  @Post('export/pdf')
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @Body()
    body: {
      resume: unknown;
      templateId?: string;
      layout?: {
        pageMarginMm?: number;
        bodyFontSizePt?: number;
        lineHeight?: number;
        accentColor?: string;
        fontFamily?: string;
        sectionTitles?: {
          experience?: string;
          projects?: string;
          education?: string;
          skills?: string;
        };
      };
    },
    @Res() res: Response,
  ) {
    const resume = this.resumesService.ensureValidResume(body.resume);
    const html = this.templatesService.renderHtml(
      resume,
      body.templateId ?? 'modern-cn-001',
      body.layout,
    );

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="resume-preview.pdf"',
    );
    return res.send(pdf);
  }

  @Post('interview/simulate')
  async simulateInterview(
    @Body()
    body: {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      resumeFileId?: string;
      resume?: unknown;
      interviewRole?: string;
      companyName?: string;
      targetPosition?: string;
      jobDescription?: string;
      language?: 'zh' | 'en';
      rounds?: number;
    },
  ) {
    const baseUrl = String(
      body.baseUrl ??
        process.env.INTERVIEW_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        '',
    )
      .trim()
      .replace(/\/+$/, '');
    const apiKey = String(
      body.apiKey ??
        process.env.INTERVIEW_API_KEY ??
        process.env.OPENAI_API_KEY ??
        '',
    ).trim();
    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        '缺少模型配置：请在服务端配置 INTERVIEW_BASE_URL / INTERVIEW_API_KEY（或 OPENAI_BASE_URL / OPENAI_API_KEY）',
      );
    }

    const resume = body.resume
      ? this.resumesService.ensureValidResume(body.resume)
      : body.resumeFileId
        ? this.resumesService.getFile(body.resumeFileId).data
        : this.resumesService.getDefaultFile().data;
    const model = String(
      body.model ?? process.env.INTERVIEW_MODEL ?? 'gpt-4o-mini',
    ).trim() || 'gpt-4o-mini';
    const language = body.language === 'en' ? 'en' : 'zh';
    const rounds = Math.min(Math.max(Number(body.rounds ?? 6), 3), 12);
    const companyName = String(body.companyName ?? '').trim();
    const targetPosition = String(body.targetPosition ?? '').trim();
    const interviewRole =
      targetPosition || String(body.interviewRole ?? '').trim() || '技术岗位';
    const jd = String(body.jobDescription ?? '').trim();
    const projectContext = this.extractProjectContext(resume);
    if (projectContext.length === 0) {
      throw new BadRequestException('当前简历缺少项目经历，无法生成项目面试问题');
    }

    const endpoint = `${baseUrl}/chat/completions`;
    const systemPrompt =
      language === 'en'
        ? 'You are a ByteDance P8 interviewer. Return strict JSON only.'
        : '你是字节跳动 P8 技术面试官。只返回 JSON，不要返回其他文本。';
    const userPrompt = `
你是一名具有多年一线工程经验的技术面试官，正在面试「${companyName || '目标公司'}」的「${interviewRole}」候选人。

你的任务不是泛泛生成面试题，而是基于【岗位 JD】和【候选人项目经历】进行真实技术面试追问。
你需要像真实面试官一样，关注候选人的项目是否真实、技术选择是否合理、工程实现是否落地、是否有数据支撑，以及是否能解释关键取舍。

【候选人项目经历】
以下内容只包含项目经历，不包含个人隐私信息：
${JSON.stringify(projectContext, null, 2)}

【岗位 JD】
${jd || '无'}

【面试目标】
请围绕岗位要求和候选人项目，生成 ${rounds} 个高质量面试问题。

【出题原则】
1. 必须优先围绕 JD 中最相关的能力点提问，而不是平均覆盖所有项目。
2. 项目/业务相关问题占 80%，八股/基础问题占 20%。
3. 每个项目问题都必须从候选人简历中的具体表述出发，不能泛泛问概念。
4. 重点追问：
   - 为什么这么做？
   - 具体怎么实现？
   - 和其他方案相比为什么选这个？
   - 遇到了什么工程问题？
   - 效果如何验证？
   - 有没有数据指标支撑？
   - 如果线上部署，延迟、成本、稳定性怎么处理？
   - 如果数据量扩大 10 倍，方案是否还能成立？
5. 如果项目描述缺少量化结果、线上部署、评估指标、消融实验、异常处理、性能优化等信息，要主动生成追问。
6. 如果候选人使用了常见技术方案，例如 RAG、Agent、LangGraph、向量检索、Cross-Encoder、LoRA、DPO、Tool Use、微调、蒸馏、缓存、异步并发、队列、数据库、Embedding、重排序等，需要追问其真实工程细节，而不是只问定义。
7. 问题要体现真实面试官的怀疑感和工程判断力，避免过于友好、宽泛、模板化。
8. 不要只问“你介绍一下项目”，而要问具体矛盾、具体取舍、具体指标。
9. 不要编造候选人没有提供的项目结果。如果项目缺少结果，要把它作为风险点追问。
10. 每个问题都要给出“面试官希望听到的点”，用于后续评分。

【问题类型要求】
请覆盖以下类型中的若干类，不要求全部覆盖，但要优先选择和 JD、项目最相关的：

- 项目真实性追问：确认候选人是否真的做过，而不是只会包装。
- 技术选型追问：为什么选这个技术，不选其他方案。
- 工程落地追问：数据流、模块边界、接口设计、部署、日志、异常处理。
- 性能效率追问：延迟、吞吐、并发、缓存、成本、扩展性。
- 评估指标追问：怎么证明有效，使用什么指标，有没有 baseline。
- 失败案例追问：什么情况下效果不好，如何改进。
- 业务理解追问：项目解决了什么真实问题，用户或下游系统如何使用。
- 基础八股追问：只问与项目强相关的基础知识。

【输出约束】
1. questions 数组长度必须严格等于 ${rounds}。
2. 如果 sourceProject 无法匹配，必须写空字符串，不得编造项目名。
3. expectedAnswer 尽量不超过 120 字，suggestedPreparation 尽量不超过 80 字。
4. 只输出 JSON，不要输出 Markdown，不要输出解释性文字。

JSON 格式如下：
{
  "opening": "string，面试开场白，简短自然",
  "interviewRole": "string，面试岗位",
  "jdFocus": ["string，岗位最关注的能力点"],
  "projectRiskSummary": [
    {
      "projectName": "string",
      "risk": "string，项目中可能被追问或缺少支撑的地方",
      "reason": "string，为什么这是风险点"
    }
  ],
  "questions": [
    {
      "category": "project|fundamental",
      "difficulty": "easy|medium|hard",
      "sourceProject": "string，问题来自哪个项目；基础题可为空",
      "resumeEvidence": "string，问题基于简历中的哪句话或哪个技术点",
      "question": "string，主问题",
      "whyAsk": "string，面试官为什么会问这个问题",
      "focus": "string，本题考察重点",
      "followUp": "string，候选人回答较浅时的继续追问",
      "expectedAnswer": "string，较好的回答应该包含什么",
      "expectedPoints": ["string"],
      "redFlags": ["string，哪些回答会让面试官觉得有问题"],
      "suggestedPreparation": "string，候选人应该如何准备这个问题"
    }
  ],
  "scoreCriteria": [
    "string，评分标准"
  ],
  "tips": [
    "string，面试建议"
  ]
}
`;

    const runCompletion = async (disableThinking: boolean) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          temperature: 0.7,
          enable_thinking: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          ...(disableThinking
            ? {
                enable_thinking: false,
                extra_body: {
                  enable_thinking: false,
                },
              }
            : {}),
        }),
      });

    let upstream = await runCompletion(false);

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new BadRequestException(
        `上游模型调用失败（${upstream.status}）：${errText.slice(0, 500)}`,
      );
    }

    let data = (await upstream.json()) as Record<string, unknown>;
    let content = this.extractTextContent(data);
    if (!content && this.hasEmptyChoices(data)) {
      upstream = await runCompletion(true);
      if (!upstream.ok) {
        const errText = await upstream.text();
        throw new BadRequestException(
          `上游模型调用失败（重试禁用 thinking，${upstream.status}）：${errText.slice(0, 500)}`,
        );
      }
      data = (await upstream.json()) as Record<string, unknown>;
      content = this.extractTextContent(data);
    }
    if (!content) {
      throw new BadRequestException(
        `模型返回为空（响应摘要：${this.responseShapeSummary(data)}）`,
      );
    }

    const parsed = this.tryParseJson(content);
    if (parsed) return this.normalizeInterviewPayload(parsed, interviewRole);
    return {
      opening: language === 'en' ? 'Mock interview started.' : '模拟面试已开始。',
      interviewRole: interviewRole || (language === 'en' ? 'Software Engineer' : '技术岗位'),
      questions: [
        {
          question: content,
          focus:
            language === 'en' ? 'Model raw output fallback' : '模型原始输出兜底',
          followUp: '',
          expectedAnswer:
            language === 'en'
              ? 'Explain context, solution, trade-off and measurable impact.'
              : '说明业务背景、方案设计、关键取舍与量化结果。',
          expectedPoints: [],
        },
      ],
      scoreCriteria: [],
      tips: [],
    };
  }

  @Post('resume/polish')
  async polishResumeContent(
    @Body()
    body: {
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      resumeFileId?: string;
      resume?: unknown;
      jobDescription?: string;
      targetPosition?: string;
      targets?: Array<{
        id: string;
        sectionTitle: string;
        title?: string;
        org?: string;
        period?: string;
        bullets?: string;
      }>;
    },
  ) {
    const targets = Array.isArray(body.targets) ? body.targets : [];
    if (targets.length === 0) {
      throw new BadRequestException('请至少选择一个需要润色的条目');
    }
    if (targets.length > 20) {
      throw new BadRequestException('一次最多润色 20 个条目');
    }

    const baseUrl = String(
      body.baseUrl ??
        process.env.INTERVIEW_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        '',
    )
      .trim()
      .replace(/\/+$/, '');
    const apiKey = String(
      body.apiKey ??
        process.env.INTERVIEW_API_KEY ??
        process.env.OPENAI_API_KEY ??
        '',
    ).trim();
    if (!baseUrl || !apiKey) {
      throw new BadRequestException(
        '缺少模型配置：请在服务端配置 INTERVIEW_BASE_URL / INTERVIEW_API_KEY（或 OPENAI_BASE_URL / OPENAI_API_KEY）',
      );
    }

    const resume = body.resume
      ? this.resumesService.ensureValidResume(body.resume)
      : body.resumeFileId
        ? this.resumesService.getFile(body.resumeFileId).data
        : this.resumesService.getDefaultFile().data;
    const model = String(
      body.model ?? process.env.INTERVIEW_MODEL ?? 'gpt-4o-mini',
    ).trim() || 'gpt-4o-mini';
    const jd = String(body.jobDescription ?? '').trim();
    const targetPosition = String(body.targetPosition ?? '').trim() || '目标岗位';

    const endpoint = `${baseUrl}/chat/completions`;
    const systemPrompt =
      '你是资深技术简历顾问。你只返回 JSON，不返回 Markdown 和额外解释。';
    const userPrompt = `
你需要根据岗位 JD，对候选人选中的简历条目进行“最小改动的强化润色”。

【规则】
1. 只润色用户选中的条目，不要扩展到未选中条目。
2. 不得编造候选人没有提供的经历、结果、指标。
3. 允许重写表达顺序、语句精炼、突出技术决策和业务价值。
4. 如果原文缺少量化数据，只能给“建议补充项”，不能凭空写具体数字。
5. 保留原有语义，修改幅度克制，突出与 JD 的匹配度。
6. 每个条目都给出：
   - polishedTitle/polishedOrg/polishedPeriod/polishedBullets
   - jdRelevance: high|medium|low|none（与岗位 JD 的相关性）
   - jdImprovements: 仅当 jdRelevance 为 high/medium/low 时给 1-3 条“下一步优化建议”；如果 jdRelevance=none 必须为空数组
   - changeSummary: 简述你改了什么、为什么
7. “下一步优化建议”必须具体到可执行动作，禁止空泛话术（如“继续优化”、“加强学习”）。
8. 若条目与 JD 明显无关（如方向不匹配的科研条目），只做表达润色，jdRelevance=none，且 jdImprovements=[]。

【岗位信息】
- 目标岗位：${targetPosition}
- 岗位 JD：${jd || '无'}

【候选人简历上下文（仅辅助理解，不可改写未选中内容）】
${JSON.stringify(this.extractProjectContext(resume), null, 2)}

【待润色条目】
${JSON.stringify(targets, null, 2)}

【输出格式】
只输出 JSON：
{
  "items": [
    {
      "id": "string，对应输入 id",
      "polishedTitle": "string",
      "polishedOrg": "string",
      "polishedPeriod": "string",
      "polishedBullets": "string，多行文本，用\\n分隔",
      "jdRelevance": "high|medium|low|none",
      "jdImprovements": ["string"],
      "changeSummary": "string"
    }
  ]
}
`;

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.4,
        enable_thinking: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new BadRequestException(
        `上游模型调用失败（${upstream.status}）：${errText.slice(0, 500)}`,
      );
    }

    const data = (await upstream.json()) as Record<string, unknown>;
    const content = this.extractTextContent(data);
    if (!content) {
      throw new BadRequestException(
        `模型返回为空（响应摘要：${this.responseShapeSummary(data)}）`,
      );
    }
    const parsed = this.tryParseJson(content);
    if (!parsed) {
      throw new BadRequestException('模型未返回合法 JSON，请重试');
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const normalized = rawItems
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        const id = String(obj.id ?? '').trim();
        if (!id) return null;
        return {
          id,
          polishedTitle: String(obj.polishedTitle ?? '').trim(),
          polishedOrg: String(obj.polishedOrg ?? '').trim(),
          polishedPeriod: String(obj.polishedPeriod ?? '').trim(),
          polishedBullets: String(obj.polishedBullets ?? '').trim(),
          jdRelevance: String(obj.jdRelevance ?? '').trim() || 'medium',
          jdImprovements: Array.isArray(obj.jdImprovements)
            ? obj.jdImprovements.map((x) => String(x).trim()).filter(Boolean)
            : [],
          changeSummary: String(obj.changeSummary ?? '').trim(),
        };
      })
      .filter(Boolean);

    return {
      items: normalized.map((item) => {
        if (!item) return item;
        if (item.jdRelevance === 'none') {
          return { ...item, jdImprovements: [] };
        }
        return item;
      }),
    };
  }

  private tryParseJson(raw: string): Record<string, unknown> | null {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      const matched = raw.match(/```json\s*([\s\S]*?)```/i);
      if (!matched) return null;
      try {
        return JSON.parse(matched[1]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  private extractTextContent(data: Record<string, unknown>): string {
    const directOutput = data.output_text;
    if (typeof directOutput === 'string' && directOutput.trim()) {
      return directOutput.trim();
    }

    const choices = Array.isArray(data.choices) ? data.choices : [];
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') continue;
      const c = choice as Record<string, unknown>;
      const message =
        c.message && typeof c.message === 'object'
          ? (c.message as Record<string, unknown>)
          : null;
      const delta =
        c.delta && typeof c.delta === 'object'
          ? (c.delta as Record<string, unknown>)
          : null;

      const msgContent = message?.content;
      if (typeof msgContent === 'string' && msgContent.trim()) {
        return msgContent.trim();
      }
      if (Array.isArray(msgContent)) {
        const joined = msgContent
          .map((item) =>
            item && typeof item === 'object'
              ? String((item as Record<string, unknown>).text ?? '')
              : '',
          )
          .join('')
          .trim();
        if (joined) return joined;
      }
      if (
        typeof message?.reasoning_content === 'string' &&
        message.reasoning_content.trim()
      ) {
        return message.reasoning_content.trim();
      }
      if (typeof delta?.content === 'string' && delta.content.trim()) {
        return delta.content.trim();
      }
      if (
        typeof delta?.reasoning_content === 'string' &&
        delta.reasoning_content.trim()
      ) {
        return delta.reasoning_content.trim();
      }

      const candidate = this.collectStringsByPreferredKeys(choice, 5);
      if (candidate) return candidate;
    }

    const fallback = this.collectStringsByPreferredKeys(data, 6);
    if (fallback) return fallback;

    return '';
  }

  private collectStringsByPreferredKeys(
    node: unknown,
    maxDepth: number,
  ): string {
    const preferredKeys = new Set([
      'content',
      'text',
      'output_text',
      'reasoning_content',
      'answer',
      'final_answer',
    ]);

    const out: string[] = [];
    const walk = (value: unknown, depth: number) => {
      if (depth > maxDepth || value == null) return;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) out.push(trimmed);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) walk(item, depth + 1);
        return;
      }
      if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (preferredKeys.has(k)) {
            walk(v, depth + 1);
          }
        }
      }
    };

    walk(node, 0);
    return out.join('\n').trim();
  }

  private responseShapeSummary(data: Record<string, unknown>): string {
    const keys = Object.keys(data).slice(0, 12);
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const firstChoice =
      choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)
        : null;
    const choiceKeys = firstChoice ? Object.keys(firstChoice).slice(0, 12) : [];
    const messageKeys =
      firstChoice &&
      firstChoice.message &&
      typeof firstChoice.message === 'object'
        ? Object.keys(firstChoice.message as Record<string, unknown>).slice(
            0,
            12,
          )
        : [];
    const deltaKeys =
      firstChoice &&
      firstChoice.delta &&
      typeof firstChoice.delta === 'object'
        ? Object.keys(firstChoice.delta as Record<string, unknown>).slice(0, 12)
        : [];

    return JSON.stringify({
      keys,
      choicesLength: choices.length,
      choiceKeys,
      messageKeys,
      deltaKeys,
    });
  }

  private hasEmptyChoices(data: Record<string, unknown>): boolean {
    return Array.isArray(data.choices) && data.choices.length === 0;
  }

  private normalizeInterviewPayload(
    payload: Record<string, unknown>,
    fallbackRole: string,
  ) {
    const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
    const questions = rawQuestions
      .map((item) => {
        if (typeof item === 'string') {
          return {
            category: 'project',
            question: item,
            focus: '',
            followUp: '',
            expectedAnswer: '',
            expectedPoints: [],
          };
        }
        if (!item || typeof item !== 'object') return null;
        const obj = item as Record<string, unknown>;
        return {
          category: String(obj.category ?? 'project'),
          question: String(obj.question ?? '').trim(),
          focus: String(obj.focus ?? '').trim(),
          followUp: String(obj.followUp ?? '').trim(),
          expectedAnswer: String(obj.expectedAnswer ?? '').trim(),
          expectedPoints: Array.isArray(obj.expectedPoints)
            ? obj.expectedPoints.map((x) => String(x).trim()).filter(Boolean)
            : [],
        };
      })
      .filter((q) => q && q.question);

    return {
      opening: String(payload.opening ?? '模拟面试已开始。'),
      interviewRole:
        String(payload.interviewRole ?? '').trim() || fallbackRole || '技术岗位',
      questions,
      scoreCriteria: Array.isArray(payload.scoreCriteria)
        ? payload.scoreCriteria.map((x) => String(x).trim()).filter(Boolean)
        : [],
      tips: Array.isArray(payload.tips)
        ? payload.tips.map((x) => String(x).trim()).filter(Boolean)
        : [],
    };
  }

  private extractProjectContext(resume: Resume) {
    const fromProjects = Array.isArray(resume.projects)
      ? resume.projects.map((item) => ({
          name: String((item as Record<string, unknown>).name ?? '').trim(),
          org: String((item as Record<string, unknown>).org ?? '').trim(),
          description: String(
            (item as Record<string, unknown>).description ?? '',
          ).trim(),
          highlights: Array.isArray((item as Record<string, unknown>).highlights)
            ? ((item as Record<string, unknown>).highlights as unknown[])
                .map((x) => String(x).trim())
                .filter(Boolean)
            : [],
        }))
      : [];

    const fromCustomSections = (resume.customSections ?? [])
      .filter((section) => /项目|project/i.test(String(section.title ?? '')))
      .flatMap((section) =>
        (section.items ?? []).map((item) => ({
          name: String(item.title ?? '').trim(),
          org: String(item.org ?? '').trim(),
          period: String(item.period ?? '').trim(),
          highlights: Array.isArray(item.highlights)
            ? item.highlights.map((x) => String(x).trim()).filter(Boolean)
            : [],
        })),
      );

    return [...fromProjects, ...fromCustomSections].filter((x) => {
      const description =
        'description' in x ? String((x as { description?: string }).description ?? '') : '';
      return x.name || x.org || description || (x.highlights?.length ?? 0) > 0;
    });
  }

}
