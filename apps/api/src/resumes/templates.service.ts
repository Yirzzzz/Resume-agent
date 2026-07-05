import { Injectable, NotFoundException } from '@nestjs/common';
import { Resume, TemplateDefinition } from './resume.types';
import type { LayoutOptions } from './templates/render-helpers';
import { renderSingleColumn } from './templates/layouts/single-column';

const MODERN_CN_TEMPLATE_ID = 'modern-cn-001';

@Injectable()
export class TemplatesService {
  private readonly templates: TemplateDefinition[] = [
    {
      id: MODERN_CN_TEMPLATE_ID,
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
    const t =
      this.templates.find((template) => template.id === templateId) ??
      this.templates[0];
    return renderSingleColumn(resume, t, layout);
  }
}
