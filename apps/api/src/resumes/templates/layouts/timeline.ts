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

/** 时间线风格：模块内容沿垂直时间线排布，每条经历一个时间节点 */
export function renderTimeline(
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
  const centered = layout?.headerStyle === 'centered';
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
  const skills = (resume.skills ?? []).join(' · ');

  const header = `<div class="header${centered ? ' centered' : ''}"><div class="header-info"><h1>${escapeHtml(resume.basics.name)}</h1><div class="meta">${headerMetaItems}${headerExtraItems}</div>${resume.basics.summary ? `<div class="summary">${formatInline(resume.basics.summary)}</div>` : ''}</div>${headerPhoto}</div>`;

  // 时间线通过 .section-content 左边框 + .block::before 圆点实现，块结构与其他版式一致
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(resume.basics.name)} - Resume</title><style>@page{size:A4;margin:${pageMargin}}body{font-family:${fontFamily};color:${t.tokens.textColor};font-size:${bodyFontSizePt}pt;line-height:${lineHeight};margin:0}h1{margin:0;color:${accentColor};font-size:16pt}h2{margin:${s.sectionTitleTopPx}px 0 ${s.sectionTitleBottomPx}px;color:${accentColor};font-size:12pt;border-bottom:none}.header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:${Math.max(3, Math.round(s.blockGapPx * 0.6))}px}.header.centered{flex-direction:column;align-items:center;text-align:center}.header-info{min-width:0;flex:1 1 auto}.header .meta{display:flex;flex-wrap:wrap;column-gap:14px;row-gap:3px;font-size:9.5pt;margin-top:4px;color:#000}.header .summary{margin-top:7px}.avatar-wrap{flex:0 0 auto;border:1px solid #d1d5db;padding:2px;background:#fff}.avatar{width:78px;height:104px;object-fit:cover;display:block}.section-content{position:relative;margin-left:5px;border-left:2px solid ${accentColor}55;padding-left:16px}.section-content .block{position:relative}.section-content .block::before{content:'';position:absolute;left:-21.5px;top:5px;width:9px;height:9px;border-radius:50%;background:#fff;border:2.5px solid ${accentColor}}.muted{color:#000}.time{color:${accentColor};font-weight:600}${sharedBlockCss(s)}${sharedListCss(s)}</style></head><body>${header}${educationBlock}${customSections || legacyRows}${skills ? `<h2>${skillsTitle}</h2><div class="section-content">${formatInline(skills)}</div>` : ''}</body></html>`;
}
