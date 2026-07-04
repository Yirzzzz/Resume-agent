import type { Resume } from '../resume.types';

/**
 * 模板共享渲染助手。所有函数只输出带 class 的纯标记（不含内联尺寸），
 * 间距/颜色等由各版式的 <style> 决定 —— 这使同一套内容构建可复用于不同版式。
 * 逻辑自原 templates.service.renderHtml 逐字迁出，行为不变。
 */

export type LayoutOptions = {
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

export const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const formatInline = (text: string) => {
  let out = escapeHtml(String(text ?? ''));
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__(.+?)__/g, '<u>$1</u>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return out;
};

export const contactEmoji = (kind: 'email' | 'phone' | 'location') => {
  if (kind === 'email') return '📧';
  if (kind === 'phone') return '📱';
  return '📍';
};

export const parseMarkdownListLine = (line: string) => {
  const text = String(line ?? '').trim();
  const unordered = text.match(/^[-*+]\s*(.+)$/);
  if (unordered) return { kind: 'ul' as const, text: unordered[1] };
  const ordered = text.match(/^\d+[.)]\s*(.+)$/);
  if (ordered) return { kind: 'ol' as const, text: ordered[1] };
  return { kind: 'line' as const, text };
};

export const renderDetailLines = (
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

export type SectionRow = {
  head: string;
  headHtml?: boolean;
  sub?: string;
  time?: string;
  bullets?: string[];
  bulletMode?: 'list' | 'lines';
  blockClass?: string;
  detailClass?: string;
};

export const sectionBlock = (title: string, rows: SectionRow[]) => {
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

export const iconFromLabel = (label: string) => {
  if (label.includes('求职') || label.includes('职业')) return '💼';
  if (label.includes('意向') || label.includes('岗位') || label.includes('目标'))
    return '🎯';
  if (label.includes('网站') || label.includes('链接') || label.includes('主页'))
    return '🔗';
  if (label.includes('研究') || label.includes('方向') || label.includes('课题'))
    return '🔬';
  return '⭐';
};

export const metaItemHtml = (icon: string, value: string) =>
  `<span class="meta-item"><span class="meta-icon">${escapeHtml(icon)}</span><span class="meta-text">${escapeHtml(value)}</span></span>`;

/** 头部所需的结构化数据（联系方式/附加信息/头像/摘要），供各版式自行组装 */
export function buildHeaderData(resume: Resume) {
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

  return {
    headerMetaItems,
    headerExtraEntries,
    headerExtraItems,
    centeredExtraRows,
    photoSrc,
    headerPhoto,
  };
}

/** 联系方式/附加信息的纯文本行（无 emoji），供 ATS 版式使用 */
export function plainContactLines(resume: Resume): string[] {
  const contacts = [
    resume.basics.email,
    resume.basics.phone,
    resume.basics.location,
  ]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' | ');
  const extras = (resume.basics.extraInfos ?? [])
    .map((item) => ({
      label: String(item.label ?? '').trim(),
      value: String(item.value ?? '').trim(),
    }))
    .filter((item) => item.label && item.value)
    .map((item) => `${item.label}: ${item.value}`)
    .join(' | ');
  return [contacts, extras].filter(Boolean);
}

/** 教育经历块（沿用原逻辑，含 highlights 兼容清洗） */
export function buildEducationBlock(resume: Resume, title: string) {
  return sectionBlock(
    title,
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
}

/** 自定义模块 → SectionRow 组（沿用原 isWorkLike/isProjectLike 分类逻辑） */
export function buildCustomSectionBlocks(resume: Resume): string[] {
  return (resume.customSections ?? []).map((section) => {
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
  });
}

/** 旧字段（experience/projects 顶层数组）的兼容块 */
export function buildLegacyBlocks(
  resume: Resume,
  titles: { experience: string; projects: string },
) {
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

  return `${legacyExperienceBlock}${legacyProjectsBlock}`;
}

export type SpacingMetrics = ReturnType<typeof computeSpacing>;

/** 列表/行块的通用 CSS（各版式共享同一 markdown 渲染节奏） */
export function sharedListCss(s: SpacingMetrics): string {
  return `ul,ol{margin:${s.listTopPx}px 0 0 ${s.listOuterIndentPx}px;padding-left:${s.listMarkerIndentPx}px}li{margin:${s.lineItemGapPx}px 0}ul.edu-detail,ol.edu-detail{margin-top:${s.educationListTopPx}px}.edu-detail li{margin:${s.educationLineItemGapPx}px 0}.line-block{margin-top:${s.detailTopPx}px}.line-block.edu-detail{margin-top:${s.educationListTopPx}px}.line-list{margin:${s.detailLineItemGapPx}px 0 0 ${s.listOuterIndentPx}px;padding-left:${s.listMarkerIndentPx}px}.line-list:first-child{margin-top:0}.line-list li{margin:${s.detailLineItemGapPx}px 0}.line-item{margin:${s.detailLineItemGapPx}px 0}.line-block .line-item:first-child{margin-top:0}.line-block .line-item:last-child{margin-bottom:0}.edu-detail .line-item{margin:${s.educationLineItemGapPx}px 0}`;
}

/** 块结构/行头/联系方式 meta 的通用 CSS */
export function sharedBlockCss(s: SpacingMetrics): string {
  return `.block{margin-bottom:${s.blockGapPx}px}.compact-block{margin-bottom:${s.compactBlockGapPx}px}.compact-block:last-child{margin-bottom:0}.edu-block{margin-bottom:${s.educationBlockGapPx}px}.edu-block:last-child{margin-bottom:0}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.head{min-width:0;flex:1 1 auto}.time{flex:0 0 auto;white-space:nowrap}.edu-school{font-weight:700}.edu-meta{font-weight:400}.exp-company{font-weight:700}.exp-role{font-weight:400}.proj-name{font-weight:700}.proj-org{font-weight:400}.meta-item{display:inline-flex;align-items:center;gap:5px}.meta-icon{width:14px;min-width:14px;display:inline-flex;align-items:center;justify-content:center;font-family:Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif;font-size:11px}`;
}

/** 由字号/行高推导的全套间距（px），各版式共用同一节奏 */
export function computeSpacing(bodyFontSizePt: number, lineHeight: number) {
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
  return {
    blockGapPx,
    sectionTitleTopPx,
    sectionTitleBottomPx: Math.max(5, Math.round(blockGapPx * 0.7)),
    listTopPx: Math.max(3, Math.round(blockGapPx * 0.75)),
    lineItemGapPx: Math.max(1, Math.round(blockGapPx * 0.35)),
    listOuterIndentPx: Math.max(10, Math.round(bodyFontSizePt * 1.2)),
    listMarkerIndentPx: Math.max(10, Math.round(bodyFontSizePt * 0.95)),
    detailTopPx: Math.max(1, Math.round(blockGapPx * 0.25)),
    detailLineItemGapPx: Math.max(0, Math.round(blockGapPx * 0.12)),
    sectionContentIndentPx: Math.max(14, Math.round(bodyFontSizePt * 1.6)),
    compactBlockGapPx: Math.max(2, Math.round(blockGapPx * 0.45)),
    educationBlockGapPx: Math.max(2, Math.round(blockGapPx * 0.45)),
    educationListTopPx: Math.max(2, Math.round(blockGapPx * 0.35)),
    educationLineItemGapPx: Math.max(0, Math.round(blockGapPx * 0.15)),
  };
}
