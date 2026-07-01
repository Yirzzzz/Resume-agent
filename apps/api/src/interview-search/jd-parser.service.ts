import { Injectable } from '@nestjs/common';
import {
  InterviewSearchInput,
  JdProfile,
} from './types/interview-search.types';

@Injectable()
export class JdParserService {
  private readonly keywordDict = [
    'Python',
    'Spark',
    'RAG',
    'LLM',
    'Agent',
    'MinHash',
    'LSH',
    'Embedding',
    'Tokenizer',
    'SQL',
    '数据清洗',
    '去重',
    '向量检索',
    'Cross-Encoder',
    '预训练',
    '质量评估',
    '语料',
  ];

  async parse(input: InterviewSearchInput): Promise<JdProfile> {
    const raw = `${input.position}\n${input.jd}`;
    const matched = this.keywordDict.filter((k) =>
      raw.toLowerCase().includes(k.toLowerCase()),
    );
    const responsibilities = this.extractByPunctuation(input.jd, 6);
    const requiredSkills = matched.slice(0, 10);
    const roleType = this.detectRoleType(input.position, input.jd);

    return {
      roleType,
      responsibilities,
      requiredSkills,
      technicalKeywords: matched,
      companyAliases: this.expandCompanyAliases(input.company),
      roleAliases: this.expandRoleAliases(input.position, roleType),
    };
  }

  private extractByPunctuation(text: string, max: number): string[] {
    return text
      .split(/[。；;\n]/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 4)
      .slice(0, max);
  }

  private detectRoleType(position: string, jd: string): string {
    const joined = `${position} ${jd}`.toLowerCase();
    if (joined.includes('数据')) return '数据方向岗位';
    if (joined.includes('算法') || joined.includes('模型')) return '算法方向岗位';
    if (joined.includes('后端')) return '后端岗位';
    if (joined.includes('前端')) return '前端岗位';
    return position || '技术岗位';
  }

  private expandCompanyAliases(company: string): string[] {
    const c = company.trim();
    if (!c) return [];
    const aliases = new Set<string>([c]);
    if (c.includes('字节')) aliases.add('ByteDance');
    if (c.includes('智谱')) aliases.add('Zhipu');
    if (c.includes('阿里')) aliases.add('Alibaba');
    return [...aliases];
  }

  private expandRoleAliases(position: string, roleType: string): string[] {
    const aliases = new Set<string>();
    const p = position.trim();
    if (p) aliases.add(p);
    aliases.add(roleType);
    if (p.includes('实习')) aliases.add(p.replace('实习', '').trim());
    if (p.includes('大模型')) aliases.add('LLM');
    return [...aliases].filter(Boolean);
  }
}
