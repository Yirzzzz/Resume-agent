import type { Resume, TemplateDefinition } from '../../resume.types';
import {
  buildCustomSectionBlocks,
  buildEducationBlock,
  buildLegacyBlocks,
  computeSpacing,
  escapeHtml,
  formatInline,
  plainContactLines,
  sharedBlockCss,
  sharedListCss,
  type LayoutOptions,
} from '../render-helpers';

/** 极简 ATS 单栏：无 emoji/头像/装饰色块，纯文本联系行，机器可读优先 */
export function renderAtsMinimal(
  resume: Resume,
  t: TemplateDefinition,
  layout?: LayoutOptions,
): string {
  const pageMargin = `${layout?.pageMarginMm ?? Number.parseFloat(t.tokens.pageMargin)}mm`;
  const bodyFontSizePt =
    layout?.bodyFontSizePt ?? Number.parseFloat(t.tokens.bodyFontSize);
  const lineHeight = layout?.lineHeight ?? t.tokens.lineHeight;
  const s = computeSpacing(bodyFontSizePt, lineHeight);
  const fontFamily = layout?.fontFamily ?? t.tokens.fontFamily;
  const centered = layout?.headerStyle === 'centered';
  const eduTitle = layout?.sectionTitles?.education ?? '教育经历';
  const skillsTitle = layout?.sectionTitles?.skills ?? 'Skills';

  const contactLines = plainContactLines(resume)
    .map((line) => `<div class="contact-line">${escapeHtml(line)}</div>`)
    .join('');
  const customSections = buildCustomSectionBlocks(resume).join('');
  const legacyRows = buildLegacyBlocks(resume, {
    experience: layout?.sectionTitles?.experience ?? 'Experience',
    projects: layout?.sectionTitles?.projects ?? 'Projects',
  });
  const educationBlock = buildEducationBlock(resume, eduTitle);
  const skills = (resume.skills ?? []).join(', ');

  const header = `<div class="header${centered ? ' centered' : ''}"><h1>${escapeHtml(resume.basics.name)}</h1>${contactLines}${resume.basics.summary ? `<div class="summary">${formatInline(resume.basics.summary)}</div>` : ''}</div>`;

  // ATS 版式刻意不渲染 emoji 图标与头像；主题色仅用于分隔线，保证黑白打印可读
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(resume.basics.name)} - Resume</title><style>@page{size:A4;margin:${pageMargin}}body{font-family:${fontFamily};color:#111;font-size:${bodyFontSizePt}pt;line-height:${lineHeight};margin:0}h1{margin:0;font-size:15pt;letter-spacing:0.02em}h2{margin:${s.sectionTitleTopPx}px 0 ${s.sectionTitleBottomPx}px;font-size:11pt;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #111}.header{margin-bottom:${Math.max(3, Math.round(s.blockGapPx * 0.6))}px}.header.centered{text-align:center}.contact-line{font-size:9.5pt;margin-top:2px}.summary{margin-top:6px}.section-content{padding-left:0}.muted{color:#111}.time{color:#111}.meta-icon{display:none}${sharedBlockCss(s)}${sharedListCss(s)}</style></head><body>${header}${educationBlock}${customSections || legacyRows}${skills ? `<h2>${skillsTitle}</h2><div class="section-content">${formatInline(skills)}</div>` : ''}</body></html>`;
}
