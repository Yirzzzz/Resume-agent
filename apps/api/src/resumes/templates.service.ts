import { Injectable, NotFoundException } from '@nestjs/common';
import { Resume, TemplateDefinition } from './resume.types';
import type { LayoutOptions } from './templates/render-helpers';
import { renderSingleColumn } from './templates/layouts/single-column';
import { renderDualColumn } from './templates/layouts/dual-column';
import { renderAtsMinimal } from './templates/layouts/ats-minimal';
import { renderColorBlock } from './templates/layouts/color-block';
import { renderTimeline } from './templates/layouts/timeline';

@Injectable()
export class TemplatesService {
  private readonly templates: TemplateDefinition[] = [
    {
      id: 'modern-cn-001',
      name: 'Modern CN',
      description: '中文单栏，信息密度均衡。',
      layout: 'single-column',
      tokens: {
        fontFamily:
          'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
        accentColor: '#1f4f8f',
        textColor: '#1f2937',
        pageMargin: '14mm',
        bodyFontSize: '10.5pt',
        lineHeight: 1.5,
      },
    },
    {
      id: 'classic-en-001',
      name: 'Classic EN',
      description: 'English classic style for ATS readability.',
      layout: 'single-column',
      tokens: {
        fontFamily: 'Georgia, Times New Roman, serif',
        accentColor: '#374151',
        textColor: '#111827',
        pageMargin: '15mm',
        bodyFontSize: '10.5pt',
        lineHeight: 1.45,
      },
    },
    {
      id: 'dual-column-001',
      name: '双栏侧栏',
      description: '左侧联系方式/技能/教育，右侧经历主栏，信息密度高。',
      layout: 'dual-column',
      tokens: {
        fontFamily:
          'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
        accentColor: '#1f4f8f',
        textColor: '#1f2937',
        pageMargin: '12mm',
        bodyFontSize: '10pt',
        lineHeight: 1.45,
      },
    },
    {
      id: 'ats-001',
      name: '极简 ATS',
      description: '无装饰、纯文本联系行，机器解析友好，适合线上投递。',
      layout: 'ats-minimal',
      tokens: {
        fontFamily: 'SimSun, Songti SC, Georgia, serif',
        accentColor: '#111111',
        textColor: '#111111',
        pageMargin: '15mm',
        bodyFontSize: '10.5pt',
        lineHeight: 1.45,
      },
    },
    {
      id: 'color-block-001',
      name: '色块现代风',
      description: '主题色头部色块 + 色条模块标题，视觉现代。',
      layout: 'color-block',
      tokens: {
        fontFamily:
          'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
        accentColor: '#0f766e',
        textColor: '#1f2937',
        pageMargin: '12mm',
        bodyFontSize: '10.5pt',
        lineHeight: 1.5,
      },
    },
    {
      id: 'timeline-001',
      name: '时间线',
      description: '经历沿垂直时间线排布，突出成长轨迹。',
      layout: 'timeline',
      tokens: {
        fontFamily:
          'PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif',
        accentColor: '#6b21a8',
        textColor: '#1f2937',
        pageMargin: '14mm',
        bodyFontSize: '10.5pt',
        lineHeight: 1.5,
      },
    },
  ];

  list() {
    return this.templates;
  }

  getById(id: string) {
    const found = this.templates.find((t) => t.id === id);
    if (!found) throw new NotFoundException(`Template ${id} not found`);
    return found;
  }

  renderHtml(resume: Resume, templateId: string, layout?: LayoutOptions) {
    const t = this.getById(templateId);
    switch (t.layout) {
      case 'dual-column':
        return renderDualColumn(resume, t, layout);
      case 'ats-minimal':
        return renderAtsMinimal(resume, t, layout);
      case 'color-block':
        return renderColorBlock(resume, t, layout);
      case 'timeline':
        return renderTimeline(resume, t, layout);
      case 'single-column':
      default:
        return renderSingleColumn(resume, t, layout);
    }
  }
}
