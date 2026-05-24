import { Injectable, NotFoundException } from '@nestjs/common';
import { Resume, TemplateDefinition } from './resume.types';

type LayoutOptions = {
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

@Injectable()
export class TemplatesService {
  private readonly templates: TemplateDefinition[] = [
    {
      id: 'modern-cn-001',
      name: 'Modern CN',
      description: '中文单栏，信息密度均衡。',
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
      tokens: {
        fontFamily: 'Georgia, Times New Roman, serif',
        accentColor: '#374151',
        textColor: '#111827',
        pageMargin: '15mm',
        bodyFontSize: '10.5pt',
        lineHeight: 1.45,
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
    const pageMargin = `${layout?.pageMarginMm ?? Number.parseFloat(t.tokens.pageMargin)}mm`;
    const bodyFontSize = `${layout?.bodyFontSizePt ?? Number.parseFloat(t.tokens.bodyFontSize)}pt`;
    const lineHeight = layout?.lineHeight ?? t.tokens.lineHeight;
    const accentColor = layout?.accentColor ?? t.tokens.accentColor;
    const fontFamily = layout?.fontFamily ?? t.tokens.fontFamily;
    const titles = {
      experience: layout?.sectionTitles?.experience ?? 'Experience',
      projects: layout?.sectionTitles?.projects ?? 'Projects',
      education: layout?.sectionTitles?.education ?? '教育经历',
      skills: layout?.sectionTitles?.skills ?? 'Skills',
    };

    const escapeHtml = (text: string) =>
      text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

    const formatInline = (text: string) => {
      let out = escapeHtml(String(text ?? ''));
      out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      out = out.replace(/__(.+?)__/g, '<u>$1</u>');
      out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
      return out;
    };

    const sectionBlock = (
      title: string,
      rows: Array<{
        head: string;
        headHtml?: boolean;
        sub?: string;
        time?: string;
        bullets?: string[];
        bulletMode?: 'list' | 'lines';
      }>,
    ) => {
      if (rows.length === 0) return '';
      const titleHtml = title.trim() ? `<h2>${title}</h2>` : '';
      return `${titleHtml}${rows
        .map((item) => {
          const head = item.headHtml
            ? item.head
            : `<strong>${formatInline(item.head)}</strong>`;
          const bulletHtml =
            item.bullets && item.bullets.length > 0
              ? item.bulletMode === 'lines'
                ? `<div class="line-block">${item.bullets.map((h) => `<div class="line-item">${formatInline(h)}</div>`).join('')}</div>`
                : `<ul>${item.bullets.map((h) => `<li>${formatInline(h)}</li>`).join('')}</ul>`
              : '';
          return `<div class="block"><div class="row"><div class="head">${head}</div><span class="time">${formatInline(item.time ?? '')}</span></div>${item.sub ? `<div class="muted">${formatInline(item.sub)}</div>` : ''}${bulletHtml}</div>`;
        })
        .join('')}`;
    };

    const legacyExperienceBlock = sectionBlock(
      titles.experience,
      (resume.experience ?? []).map((item) => ({
        head:
          `${item.company ? `<span class="exp-company">${escapeHtml(item.company)}</span>` : ''}${item.company && item.role ? ' - ' : ''}${item.role ? `<span class="exp-role">${escapeHtml(item.role)}</span>` : ''}` ||
          '经历',
        headHtml: true,
        sub: '',
        time: `${item.startDate} - ${item.endDate}`,
        bullets: item.highlights ?? [],
        bulletMode: 'lines',
      })),
    );

    const legacyProjectsBlock = sectionBlock(
      titles.projects,
      (resume.projects ?? []).map((item) => {
        const projectName =
          typeof item.name === 'string' ? item.name.trim() : '';
        const projectOrg =
          typeof item.description === 'string' ? item.description.trim() : '';
        const head =
          `${projectName ? `<span class="proj-name">${escapeHtml(projectName)}</span>` : ''}${projectName && projectOrg ? ' - ' : ''}${projectOrg ? `<span class="proj-org">${escapeHtml(projectOrg)}</span>` : ''}` ||
          '项目经历';
        return {
          head,
          headHtml: true,
          sub: '',
          bullets: Array.isArray(item.highlights)
            ? item.highlights.map((x) => String(x))
            : [],
          bulletMode: 'lines' as const,
        };
      }),
    );

    const legacyEducationBlock = sectionBlock(
      titles.education,
      (resume.education ?? []).map((item) => {
        const school = String(item.school ?? '').trim();
        const degree = String(item.degree ?? '').trim();
        const major = String(item.major ?? '').trim();
        const college = String(item.college ?? '').trim();
        const gpa = String(item.gpa ?? '').trim();
        const startDate = String(item.startDate ?? '').trim();
        const endDate = String(item.endDate ?? '').trim();

        const eduMeta = [degree, major, college, gpa ? `GPA ${gpa}` : '']
          .filter(Boolean)
          .join(' ');
        const leftText = [
          school ? `<span class="edu-school">${escapeHtml(school)}</span>` : '',
          school && eduMeta ? ' —— ' : '',
          eduMeta ? `<span class="edu-meta">${escapeHtml(eduMeta)}</span>` : '',
        ]
          .filter(Boolean)
          .join('');
        const dateText = [startDate, endDate].filter(Boolean).join(' - ');
        const oneLine = leftText || '教育经历';

        const computedBullets =
          Array.isArray(item.highlights) && item.highlights.length > 0
            ? item.highlights
                .map((x) => String(x))
                .filter(
                  (line) =>
                    !line.startsWith('GPA:') && !line.startsWith('所在学院:'),
                )
            : [
                item.schoolTags ? `学校标签: ${item.schoolTags}` : '',
                item.summary ? `简介: ${item.summary}` : '',
              ].filter(Boolean);

        return {
          head: oneLine,
          headHtml: true,
          sub: '',
          time: dateText,
          bullets: computedBullets,
        };
      }),
    );

    const legacyRows = [legacyExperienceBlock, legacyProjectsBlock].join('');

    const customSections = (resume.customSections ?? [])
      .map((section) => {
        const isWorkLike = /实习|工作/.test(section.title);
        const isProjectLike = /项目/.test(section.title);
        const isResearchLike = /科研|校园/.test(section.title);
        return sectionBlock(
          section.title,
          (section.items ?? []).map((item) => {
            if (isWorkLike) {
              const company = String(item.org ?? '').trim();
              const role = String(item.title ?? '').trim();
              const head =
                `${company ? `<span class="exp-company">${escapeHtml(company)}</span>` : ''}${company && role ? ' - ' : ''}${role ? `<span class="exp-role">${escapeHtml(role)}</span>` : ''}` ||
                '经历';
              return {
                head,
                headHtml: true,
                sub: '',
                time: item.period ?? '',
                bullets: item.highlights ?? [],
                bulletMode: 'lines' as const,
              };
            }
            if (isProjectLike) {
              const projectName = String(item.title ?? '').trim();
              const projectOrg = String(item.org ?? '').trim();
              const head =
                `${projectName ? `<span class="proj-name">${escapeHtml(projectName)}</span>` : ''}${projectName && projectOrg ? ' - ' : ''}${projectOrg ? `<span class="proj-org">${escapeHtml(projectOrg)}</span>` : ''}` ||
                '项目经历';
              return {
                head,
                headHtml: true,
                sub: '',
                time: item.period ?? '',
                bullets: item.highlights ?? [],
                bulletMode: 'lines' as const,
              };
            }
            if (isResearchLike) {
              const title = String(item.title ?? '').trim();
              const org = String(item.org ?? '').trim();
              return {
                head: title || org,
                sub: title ? item.org ?? '' : '',
                time: item.period ?? '',
                bullets: item.highlights ?? [],
                bulletMode: 'lines' as const,
              };
            }
            const title = String(item.title ?? '').trim();
            const org = String(item.org ?? '').trim();
            return {
              head: title || org,
              sub: title ? item.org ?? '' : '',
              time: item.period ?? '',
              bullets: item.highlights ?? [],
              bulletMode: 'lines' as const,
            };
          }),
        );
      })
      .join('');

    const skills = (resume.skills ?? []).join(' · ');
    const iconFromLabel = (label: string) => {
      if (label.includes('求职') || label.includes('职业')) return '💼';
      if (
        label.includes('意向') ||
        label.includes('岗位') ||
        label.includes('目标')
      )
        return '🎯';
      if (
        label.includes('网站') ||
        label.includes('链接') ||
        label.includes('主页')
      )
        return '🔗';
      if (
        label.includes('研究') ||
        label.includes('方向') ||
        label.includes('课题')
      )
        return '🔬';
      return '⭐';
    };
    const headerMetaItems = [
      { icon: '✉', value: resume.basics.email },
      { icon: '☎', value: resume.basics.phone ?? '' },
      { icon: '⌂', value: resume.basics.location ?? '' },
    ]
      .filter((item) => String(item.value ?? '').trim())
      .map(
        (item) =>
          `<span class="meta-item"><span class="meta-icon">${item.icon}</span><span>${escapeHtml(String(item.value))}</span></span>`,
      )
      .join('');
    const headerExtraItems = (resume.basics.extraInfos ?? [])
      .map((item) => ({
        label: String(item.label ?? '').trim(),
        value: String(item.value ?? '').trim(),
        icon: String(item.icon ?? '').trim(),
      }))
      .filter((item) => item.label && item.value)
      .map((item) => {
        const icon = item.icon || iconFromLabel(item.label);
        return `<span class="meta-item"><span class="meta-icon">${escapeHtml(icon)}</span><span>${escapeHtml(item.label)}：${escapeHtml(item.value)}</span></span>`;
      })
      .join('');
    const normalizedPhoto = String(resume.basics.photo ?? '').trim();
    const photoSrc =
      normalizedPhoto.startsWith('data:image/') ||
      normalizedPhoto.startsWith('https://') ||
      normalizedPhoto.startsWith('http://')
        ? normalizedPhoto
        : '';
    const headerPhoto = photoSrc
      ? `<div class="avatar-wrap"><img class="avatar" src="${escapeHtml(photoSrc)}" alt="profile photo" /></div>`
      : '';

    const trailingSections = customSections || legacyRows;
    const bodySections = `${legacyEducationBlock}${trailingSections}`;

    return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(resume.basics.name)} - Resume</title><style>@page{size:A4;margin:${pageMargin}}body{font-family:${fontFamily};color:${t.tokens.textColor};font-size:${bodyFontSize};line-height:${lineHeight}}h1{margin:0;color:${accentColor};font-size:20pt}h2{margin:14px 0 8px;border-bottom:1px solid #e5e7eb;color:${accentColor};font-size:12pt}.header{margin-bottom:10px}.header-main{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.header-info{min-width:0;flex:1 1 auto}.meta{color:#4b5563;font-size:9.5pt;margin-top:4px;display:flex;flex-wrap:wrap;gap:10px 14px}.meta-extra{margin-top:6px}.meta-item{display:inline-flex;align-items:center;gap:5px}.meta-icon{font-size:9pt;line-height:1}.avatar-wrap{flex:0 0 auto;border:1px solid #d1d5db;padding:2px;background:#fff}.avatar{width:78px;height:104px;object-fit:cover;display:block}.summary{margin-top:8px}.block{margin-bottom:8px}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.head{min-width:0;flex:1 1 auto}.time{flex:0 0 auto;white-space:nowrap;color:#4b5563}.edu-school{font-weight:700}.edu-meta{font-weight:400}.exp-company{font-weight:700}.exp-role{font-weight:400}.proj-name{font-weight:700}.proj-org{font-weight:400}.muted{color:#6b7280}ul{margin:6px 0 0 16px;padding:0}li{margin:2px 0}.line-block{margin-top:6px}.line-item{margin:2px 0}</style></head><body><div class="header"><div class="header-main"><div class="header-info"><h1>${escapeHtml(resume.basics.name)}</h1><div class="meta">${headerMetaItems}</div>${headerExtraItems ? `<div class="meta meta-extra">${headerExtraItems}</div>` : ''}${resume.basics.summary ? `<div class="summary">${formatInline(resume.basics.summary)}</div>` : ''}</div>${headerPhoto}</div></div>${bodySections}${skills ? `<h2>${titles.skills}</h2><div>${formatInline(skills)}</div>` : ''}</body></html>`;
  }
}
