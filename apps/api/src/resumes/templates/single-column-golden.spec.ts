import type { Resume, TemplateDefinition } from '../resume.types';
import { TemplatesService } from '../templates.service';

/**
 * 黄金回归：重构后的 single-column 版式必须与重构前 renderHtml 输出逐字节一致。
 * legacyRenderHtml 是重构前实现的逐字拷贝（仅去掉类包装）。
 */

type LegacyLayoutOptions = {
  pageMarginMm?: number;
  bodyFontSizePt?: number;
  lineHeight?: number;
  headerStyle?: 'default' | 'centered';
  accentColor?: string;
  fontFamily?: string;
  sectionTitles?: {
    experience?: string;
    projects?: string;
    education?: string;
    skills?: string;
  };
};

function legacyRenderHtml(
  resume: Resume,
  t: TemplateDefinition,
  layout?: LegacyLayoutOptions,
) {
  const pageMargin = `${layout?.pageMarginMm ?? Number.parseFloat(t.tokens.pageMargin)}mm`;
  const bodyFontSizePt =
    layout?.bodyFontSizePt ?? Number.parseFloat(t.tokens.bodyFontSize);
  const bodyFontSize = `${bodyFontSizePt}pt`;
  const lineHeight = layout?.lineHeight ?? t.tokens.lineHeight;
  const blockGapPx = Math.max(
    4,
    Math.round(
      bodyFontSizePt * Math.max(0.45, Math.min(0.75, lineHeight * 0.5)),
    ),
  );
  const sectionTitleTopPx = Math.max(
    4,
    Math.round(
      bodyFontSizePt * Math.max(0.35, Math.min(0.5, lineHeight * 0.33)),
    ),
  );
  const sectionTitleBottomPx = Math.max(5, Math.round(blockGapPx * 0.7));
  const listTopPx = Math.max(3, Math.round(blockGapPx * 0.75));
  const lineItemGapPx = Math.max(1, Math.round(blockGapPx * 0.35));
  const listOuterIndentPx = Math.max(10, Math.round(bodyFontSizePt * 1.2));
  const listMarkerIndentPx = Math.max(10, Math.round(bodyFontSizePt * 0.95));
  const detailTopPx = Math.max(1, Math.round(blockGapPx * 0.25));
  const detailLineItemGapPx = Math.max(0, Math.round(blockGapPx * 0.12));
  const sectionContentIndentPx = Math.max(14, Math.round(bodyFontSizePt * 1.6));
  const compactBlockGapPx = Math.max(2, Math.round(blockGapPx * 0.45));
  const educationBlockGapPx = Math.max(2, Math.round(blockGapPx * 0.45));
  const educationListTopPx = Math.max(2, Math.round(blockGapPx * 0.35));
  const educationLineItemGapPx = Math.max(0, Math.round(blockGapPx * 0.15));
  const headerStyle =
    layout?.headerStyle === 'centered' ? 'centered' : 'default';
  const headerBottomGapPx =
    headerStyle === 'centered'
      ? Math.max(2, Math.round(blockGapPx * 0.45))
      : Math.max(3, Math.round(blockGapPx * 0.6));
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
  const contactEmoji = (kind: 'email' | 'phone' | 'location') => {
    if (kind === 'email') return '📧';
    if (kind === 'phone') return '📱';
    return '📍';
  };

  const parseMarkdownListLine = (line: string) => {
    const text = String(line ?? '').trim();
    const unordered = text.match(/^[-*+]\s*(.+)$/);
    if (unordered) return { kind: 'ul' as const, text: unordered[1] };
    const ordered = text.match(/^\d+[.)]\s*(.+)$/);
    if (ordered) return { kind: 'ol' as const, text: ordered[1] };
    return { kind: 'line' as const, text };
  };

  const renderDetailLines = (
    lines: string[],
    mode: 'list' | 'lines',
    detailClass?: string,
  ) => {
    const cleaned = lines.map((line) => String(line).trim()).filter(Boolean);
    if (cleaned.length === 0) return '';

    if (mode === 'list') {
      const firstMarkdownList = parseMarkdownListLine(cleaned[0]);
      const tag = firstMarkdownList.kind === 'ol' ? 'ol' : 'ul';
      const className = detailClass ? ` class="${detailClass}"` : '';
      return `<${tag}${className}>${cleaned
        .map((line) => {
          const parsed = parseMarkdownListLine(line);
          return `<li>${formatInline(parsed.text)}</li>`;
        })
        .join('')}</${tag}>`;
    }

    const detailSuffix = detailClass ? ` ${detailClass}` : '';
    let html = '';
    let activeList:
      | {
          kind: 'ul' | 'ol';
          items: string[];
        }
      | undefined;
    const flushList = () => {
      if (!activeList) return;
      html += `<${activeList.kind} class="line-list${detailSuffix}">${activeList.items
        .map((line) => `<li>${formatInline(line)}</li>`)
        .join('')}</${activeList.kind}>`;
      activeList = undefined;
    };

    cleaned.forEach((line) => {
      const parsed = parseMarkdownListLine(line);
      if (parsed.kind === 'ul' || parsed.kind === 'ol') {
        if (activeList && activeList.kind !== parsed.kind) flushList();
        if (!activeList) activeList = { kind: parsed.kind, items: [] };
        activeList.items.push(parsed.text);
        return;
      }
      flushList();
      html += `<div class="line-item">${formatInline(parsed.text)}</div>`;
    });
    flushList();

    return `<div class="line-block${detailSuffix}">${html}</div>`;
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
      blockClass?: string;
      detailClass?: string;
    }>,
  ) => {
    if (rows.length === 0) return '';
    const titleHtml = title.trim() ? `<h2>${title}</h2>` : '';
    const contentClass = title.trim()
      ? 'section-content'
      : 'section-content no-title';
    const contentHtml = rows
      .map((item) => {
        const head = item.headHtml
          ? item.head
          : `<strong>${formatInline(item.head)}</strong>`;
        const blockClass = ['block', item.blockClass].filter(Boolean).join(' ');
        const bulletHtml =
          item.bullets && item.bullets.length > 0
            ? renderDetailLines(
                item.bullets,
                item.bulletMode ?? 'list',
                item.detailClass,
              )
            : '';
        return `<div class="${blockClass}"><div class="row"><div class="head">${head}</div><span class="time">${formatInline(item.time ?? '')}</span></div>${item.sub ? `<div class="muted">${formatInline(item.sub)}</div>` : ''}${bulletHtml}</div>`;
      })
      .join('');
    return `${titleHtml}<div class="${contentClass}">${contentHtml}</div>`;
  };

  const legacyExperienceBlock = sectionBlock(
    titles.experience,
    (resume.experience ?? []).map((item) => ({
      head: `${item.company ? `<span class="exp-company">${escapeHtml(item.company)}</span>` : ''}${item.company && item.role ? ' - ' : ''}${item.role ? `<span class="exp-role">${escapeHtml(item.role)}</span>` : ''}`,
      headHtml: true,
      sub: '',
      time: `${item.startDate} - ${item.endDate}`,
      bullets: item.highlights ?? [],
      bulletMode: 'lines' as const,
      blockClass: 'compact-block',
    })),
  );

  const legacyProjectsBlock = sectionBlock(
    titles.projects,
    (resume.projects ?? []).map((item) => {
      const projectName = typeof item.name === 'string' ? item.name.trim() : '';
      const projectOrg =
        typeof item.description === 'string' ? item.description.trim() : '';
      const head = `${projectName ? `<span class="proj-name">${escapeHtml(projectName)}</span>` : ''}${projectName && projectOrg ? ' - ' : ''}${projectOrg ? `<span class="proj-org">${escapeHtml(projectOrg)}</span>` : ''}`;
      return {
        head,
        headHtml: true,
        sub: '',
        bullets: Array.isArray(item.highlights)
          ? item.highlights.map((x) => String(x))
          : [],
        bulletMode: 'lines' as const,
        blockClass: 'compact-block',
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
        blockClass: 'edu-block',
        detailClass: 'edu-detail',
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
            const head = `${company ? `<span class="exp-company">${escapeHtml(company)}</span>` : ''}${company && role ? ' - ' : ''}${role ? `<span class="exp-role">${escapeHtml(role)}</span>` : ''}`;
            return {
              head,
              headHtml: true,
              sub: '',
              time: item.period ?? '',
              bullets: item.highlights ?? [],
              bulletMode: 'lines' as const,
              blockClass: 'compact-block',
            };
          }
          if (isProjectLike) {
            const projectName = String(item.title ?? '').trim();
            const projectOrg = String(item.org ?? '').trim();
            const head = `${projectName ? `<span class="proj-name">${escapeHtml(projectName)}</span>` : ''}${projectName && projectOrg ? ' - ' : ''}${projectOrg ? `<span class="proj-org">${escapeHtml(projectOrg)}</span>` : ''}`;
            return {
              head,
              headHtml: true,
              sub: '',
              time: item.period ?? '',
              bullets: item.highlights ?? [],
              bulletMode: 'lines' as const,
              blockClass: 'compact-block',
            };
          }
          if (isResearchLike) {
            const title = String(item.title ?? '').trim();
            const org = String(item.org ?? '').trim();
            return {
              head: title || org,
              sub: title ? (item.org ?? '') : '',
              time: item.period ?? '',
              bullets: item.highlights ?? [],
              bulletMode: 'lines' as const,
              blockClass: 'compact-block',
            };
          }
          const title = String(item.title ?? '').trim();
          const org = String(item.org ?? '').trim();
          return {
            head: title || org,
            sub: title ? (item.org ?? '') : '',
            time: item.period ?? '',
            bullets: item.highlights ?? [],
            bulletMode: 'lines' as const,
            blockClass: 'compact-block',
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
  const metaItemHtml = (icon: string, value: string) =>
    `<span class="meta-item"><span class="meta-icon">${escapeHtml(icon)}</span><span class="meta-text">${escapeHtml(value)}</span></span>`;
  const headerMetaItems = [
    { icon: contactEmoji('email'), value: resume.basics.email },
    { icon: contactEmoji('phone'), value: resume.basics.phone ?? '' },
    { icon: contactEmoji('location'), value: resume.basics.location ?? '' },
  ]
    .filter((item) => String(item.value ?? '').trim())
    .map((item) => metaItemHtml(item.icon, String(item.value)))
    .join('');
  const headerExtraEntries = (resume.basics.extraInfos ?? [])
    .map((item) => ({
      label: String(item.label ?? '').trim(),
      value: String(item.value ?? '').trim(),
      icon: String(item.icon ?? '').trim(),
    }))
    .filter((item) => item.label && item.value);
  const extraItemHtml = (item: (typeof headerExtraEntries)[number]) => {
    const icon = item.icon || iconFromLabel(item.label);
    return metaItemHtml(icon, `${item.label}：${item.value}`);
  };
  const headerExtraItems = headerExtraEntries.map(extraItemHtml).join('');
  const centeredExtraRows: string[] = [];
  headerExtraEntries.slice(0, 4).forEach((item, index) => {
    const rowIndex = Math.floor(index / 2);
    centeredExtraRows[rowIndex] =
      `${centeredExtraRows[rowIndex] ?? ''}${extraItemHtml(item)}`;
  });
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
  const centeredInfoRows = [headerMetaItems, ...centeredExtraRows]
    .filter(Boolean)
    .slice(0, 3)
    .map((row) => `<div class="meta meta-line">${row}</div>`)
    .join('');
  const defaultHeader = `<div class="header"><div class="header-main"><div class="header-info"><h1>${escapeHtml(resume.basics.name)}</h1><div class="meta">${headerMetaItems}</div>${headerExtraItems ? `<div class="meta meta-extra">${headerExtraItems}</div>` : ''}${resume.basics.summary ? `<div class="summary">${formatInline(resume.basics.summary)}</div>` : ''}</div>${headerPhoto}</div></div>`;
  const centeredHeader = `<div class="header header-centered"><div class="header-centered-layout"><div class="header-slot"></div><div class="header-centered-info"><h1>${escapeHtml(resume.basics.name)}</h1>${centeredInfoRows}${resume.basics.summary ? `<div class="summary">${formatInline(resume.basics.summary)}</div>` : ''}</div>${headerPhoto || '<div class="header-slot"></div>'}</div></div>`;
  const header = headerStyle === 'centered' ? centeredHeader : defaultHeader;

  const trailingSections = customSections || legacyRows;
  const bodySections = `${legacyEducationBlock}${trailingSections}`;

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(resume.basics.name)} - Resume</title><style>@page{size:A4;margin:${pageMargin}}body{font-family:${fontFamily};color:${t.tokens.textColor};font-size:${bodyFontSize};line-height:${lineHeight}}h1{margin:0;color:${accentColor};font-size:16pt}h2{margin:${sectionTitleTopPx}px 0 ${sectionTitleBottomPx}px;border-bottom:1px solid #000;color:${accentColor};font-size:12pt}.header{margin-bottom:${headerBottomGapPx}px}.header-main{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.header-info{min-width:0;flex:1 1 auto}.header-centered{text-align:center}.header-centered-layout{display:grid;grid-template-columns:76px minmax(0,1fr) 76px;align-items:start;column-gap:10px}.header-centered-info{min-width:0}.header-centered h1{line-height:1.15}.header-centered .meta{justify-content:center;flex-wrap:nowrap;column-gap:18px;row-gap:0;margin-top:3px}.header-centered .meta-text{white-space:nowrap}.header-centered .avatar-wrap{justify-self:end}.header-centered .avatar{width:60px;height:80px}.meta{color:#000;font-size:9.5pt;line-height:16px;margin-top:4px;display:flex;flex-wrap:wrap;align-items:center;column-gap:14px;row-gap:4px}.meta-extra{margin-top:4px}.meta-item{display:inline-flex;align-items:center;height:16px;line-height:16px;gap:5px}.meta-text{display:inline-block;line-height:16px}.meta-icon{width:14px;min-width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-family:Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif;font-size:11px;line-height:14px;vertical-align:middle}.avatar-wrap{flex:0 0 auto;border:1px solid #d1d5db;padding:2px;background:#fff}.avatar{width:78px;height:104px;object-fit:cover;display:block}.summary{margin-top:8px}.section-content{padding-left:${sectionContentIndentPx}px}.section-content.no-title{padding-left:0}.block{margin-bottom:${blockGapPx}px}.compact-block{margin-bottom:${compactBlockGapPx}px}.compact-block:last-child{margin-bottom:0}.edu-block{margin-bottom:${educationBlockGapPx}px}.edu-block:last-child{margin-bottom:0}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.head{min-width:0;flex:1 1 auto}.time{flex:0 0 auto;white-space:nowrap;color:#000}.edu-school{font-weight:700}.edu-meta{font-weight:400}.exp-company{font-weight:700}.exp-role{font-weight:400}.proj-name{font-weight:700}.proj-org{font-weight:400}.muted{color:#000}ul,ol{margin:${listTopPx}px 0 0 ${listOuterIndentPx}px;padding-left:${listMarkerIndentPx}px}li{margin:${lineItemGapPx}px 0}ul.edu-detail,ol.edu-detail{margin-top:${educationListTopPx}px}.edu-detail li{margin:${educationLineItemGapPx}px 0}.line-block{margin-top:${detailTopPx}px}.line-block.edu-detail{margin-top:${educationListTopPx}px}.line-list{margin:${detailLineItemGapPx}px 0 0 ${listOuterIndentPx}px;padding-left:${listMarkerIndentPx}px}.line-list:first-child{margin-top:0}.line-list li{margin:${detailLineItemGapPx}px 0}.line-item{margin:${detailLineItemGapPx}px 0}.line-block .line-item:first-child{margin-top:0}.line-block .line-item:last-child{margin-bottom:0}.edu-detail .line-item{margin:${educationLineItemGapPx}px 0}</style></head><body>${header}${bodySections}${skills ? `<h2>${titles.skills}</h2><div class="section-content">${formatInline(skills)}</div>` : ''}</body></html>`;
}

const sampleResume: Resume = {
  basics: {
    name: '张三 <Dev> & "Q"',
    email: 'zhang@example.com',
    phone: '13800000000',
    location: '上海',
    summary: '专注**高并发**与*检索*系统，__可靠性__优先。',
    photo: 'data:image/png;base64,iVBORw0KGgo=',
    extraInfos: [
      { label: '求职状态', value: '在职-月内到岗', icon: '💼' },
      { label: '个人网站', value: 'https://me.example.com', icon: '' },
      { label: '研究方向', value: 'RAG 与智能体', icon: '🔬' },
    ],
  },
  education: [
    {
      school: '某某大学',
      degree: '硕士',
      major: '计算机科学',
      startDate: '2022-09',
      endDate: '2025-06',
      gpa: '3.8/4.0',
      schoolTags: '985/双一流',
      college: '计算机学院',
      summary: '方向为信息检索',
      highlights: ['学校标签: 985/双一流', '方向为信息检索', 'GPA: 3.8'],
    },
  ],
  customSections: [
    {
      title: '工作/实习经历',
      items: [
        {
          title: '后端工程师',
          org: '某科技公司',
          period: '2023-07 ~ 至今',
          highlights: [
            '- 负责**订单链路**重构，QPS 提升 3 倍',
            '- 主导缓存一致性方案',
            '1. 建立压测基线',
            '2. 完成灰度发布',
            '普通描述行（非列表）',
          ],
        },
      ],
    },
    {
      title: '项目经历',
      items: [
        {
          title: 'RAG 检索平台',
          org: '个人项目',
          period: '2026',
          highlights: ['- RRF 融合 BM25 与向量召回', '- 延迟 P99 从 300ms 降到 120ms'],
        },
      ],
    },
    {
      title: '科研/校园经历',
      items: [
        {
          title: '多模态评估研究',
          org: '实验室',
          period: '2025',
          highlights: ['发表论文一篇'],
        },
      ],
    },
    {
      title: '自定义奖项',
      items: [{ title: 'ACM 区域赛银牌', org: '', period: '2024', highlights: [] }],
    },
  ],
  skills: ['TypeScript', 'NestJS', 'PostgreSQL'],
};

const legacyResume: Resume = {
  basics: { name: 'Legacy User', email: 'l@example.com' },
  experience: [
    {
      company: 'OldCo',
      role: 'Engineer',
      startDate: '2020',
      endDate: '2022',
      highlights: ['- did things', 'plain line'],
    },
  ],
  projects: [
    { name: 'OldProj', description: 'legacy', highlights: ['- p1', '- p2'] },
  ],
  skills: ['Java'],
};

describe('single-column golden regression (refactor must not change output)', () => {
  const service = new TemplatesService();
  const layoutVariants: Array<LegacyLayoutOptions | undefined> = [
    undefined,
    {
      pageMarginMm: 9,
      bodyFontSizePt: 11.5,
      lineHeight: 1.6,
      headerStyle: 'centered',
      accentColor: '#b42318',
      fontFamily: 'KaiTi, STKaiti, serif',
      sectionTitles: { skills: '技能特长' },
    },
    { headerStyle: 'default', bodyFontSizePt: 8.5, lineHeight: 1.0 },
  ];

  it.each(['modern-cn-001'])(
    'matches legacy output for %s across layout variants',
    (templateId) => {
      const t = service.getById(templateId);
      for (const layout of layoutVariants) {
        expect(service.renderHtml(sampleResume, templateId, layout)).toBe(
          legacyRenderHtml(sampleResume, t, layout),
        );
        expect(service.renderHtml(legacyResume, templateId, layout)).toBe(
          legacyRenderHtml(legacyResume, t, layout),
        );
      }
    },
  );
});
