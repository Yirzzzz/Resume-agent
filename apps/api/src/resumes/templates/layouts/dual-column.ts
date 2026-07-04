import type { Resume, TemplateDefinition } from '../../resume.types';
import {
  buildCustomSectionBlocks,
  buildEducationBlock,
  buildHeaderData,
  buildLegacyBlocks,
  computeSpacing,
  escapeHtml,
  formatInline,
  sharedBlockCss,
  sharedListCss,
  type LayoutOptions,
} from '../render-helpers';

/** 左右双栏：左窄栏（头像/联系/技能/教育），右宽栏（简介+经历模块） */
export function renderDualColumn(
  resume: Resume,
  t: TemplateDefinition,
  layout?: LayoutOptions,
): string {
  const pageMargin = `${layout?.pageMarginMm ?? Number.parseFloat(t.tokens.pageMargin)}mm`;
  const bodyFontSizePt =
    layout?.bodyFontSizePt ?? Number.parseFloat(t.tokens.bodyFontSize);
  const lineHeight = layout?.lineHeight ?? t.tokens.lineHeight;
  const s = computeSpacing(bodyFontSizePt, lineHeight);
  const accentColor = layout?.accentColor ?? t.tokens.accentColor;
  const fontFamily = layout?.fontFamily ?? t.tokens.fontFamily;
  const eduTitle = layout?.sectionTitles?.education ?? '教育经历';
  const skillsTitle = layout?.sectionTitles?.skills ?? '技能';

  const { headerMetaItems, headerExtraItems, headerPhoto } =
    buildHeaderData(resume);
  const customSections = buildCustomSectionBlocks(resume).join('');
  const legacyRows = buildLegacyBlocks(resume, {
    experience: layout?.sectionTitles?.experience ?? 'Experience',
    projects: layout?.sectionTitles?.projects ?? 'Projects',
  });
  const educationBlock = buildEducationBlock(resume, eduTitle);
  const skillItems = (resume.skills ?? [])
    .map((skill) => `<div class="skill-chip">${formatInline(skill)}</div>`)
    .join('');

  const sidebar = `<aside class="side">${headerPhoto}<h1>${escapeHtml(resume.basics.name)}</h1><div class="side-meta">${headerMetaItems}${headerExtraItems}</div>${skillItems ? `<h2>${skillsTitle}</h2><div class="skill-list">${skillItems}</div>` : ''}${educationBlock ? `<div class="side-edu">${educationBlock}</div>` : ''}</aside>`;
  const main = `<main class="main">${resume.basics.summary ? `<div class="summary">${formatInline(resume.basics.summary)}</div>` : ''}${customSections || legacyRows}</main>`;

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(resume.basics.name)} - Resume</title><style>@page{size:A4;margin:${pageMargin}}body{font-family:${fontFamily};color:${t.tokens.textColor};font-size:${bodyFontSizePt}pt;line-height:${lineHeight};margin:0}.layout{display:grid;grid-template-columns:62mm minmax(0,1fr);column-gap:6mm}h1{margin:6px 0 2px;color:${accentColor};font-size:15pt;word-break:break-all}h2{margin:${s.sectionTitleTopPx}px 0 ${s.sectionTitleBottomPx}px;color:${accentColor};font-size:11.5pt;border-bottom:1px solid ${accentColor}}.side{border-right:2px solid ${accentColor};padding-right:5mm}.side .avatar-wrap{border:1px solid #d1d5db;padding:2px;background:#fff;width:fit-content}.side .avatar{width:78px;height:104px;object-fit:cover;display:block}.side-meta{display:flex;flex-direction:column;row-gap:4px;font-size:9pt;margin-top:4px}.side-meta .meta-item{display:flex}.skill-list{display:flex;flex-wrap:wrap;gap:4px}.skill-chip{border:1px solid ${accentColor};color:${accentColor};border-radius:3px;padding:1px 6px;font-size:8.5pt}.side-edu .section-content{padding-left:0}.side-edu .row{flex-direction:column;gap:2px}.side-edu .time{color:#555;font-size:8.5pt}.main .section-content{padding-left:0}.summary{margin-bottom:${s.blockGapPx}px}.muted{color:#000}.time{color:#000}${sharedBlockCss(s)}${sharedListCss(s)}</style></head><body><div class="layout">${sidebar}${main}</div></body></html>`;
}
