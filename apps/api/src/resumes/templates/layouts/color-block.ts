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

/** 色块现代风：主题色 header 色块 + 姓名反白 + 模块标题左色条 */
export function renderColorBlock(
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

  const banner = `<div class="banner${centered ? ' centered' : ''}"><div class="banner-info"><h1>${escapeHtml(resume.basics.name)}</h1><div class="meta">${headerMetaItems}</div>${headerExtraItems ? `<div class="meta meta-extra">${headerExtraItems}</div>` : ''}${resume.basics.summary ? `<div class="summary">${formatInline(resume.basics.summary)}</div>` : ''}</div>${headerPhoto}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(resume.basics.name)} - Resume</title><style>@page{size:A4;margin:${pageMargin}}body{font-family:${fontFamily};color:${t.tokens.textColor};font-size:${bodyFontSizePt}pt;line-height:${lineHeight};margin:0}.banner{background:${accentColor};color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:flex-start;gap:14px;border-radius:2px;margin-bottom:${Math.max(4, Math.round(s.blockGapPx * 0.8))}px}.banner.centered{flex-direction:column;align-items:center;text-align:center}.banner-info{min-width:0;flex:1 1 auto}.banner h1{margin:0;color:#fff;font-size:16pt}.banner .meta{display:flex;flex-wrap:wrap;column-gap:14px;row-gap:3px;font-size:9.5pt;margin-top:5px;color:rgba(255,255,255,0.95)}.banner .summary{margin-top:7px;font-size:9.5pt;color:rgba(255,255,255,0.95)}.banner .avatar-wrap{flex:0 0 auto;border:2px solid rgba(255,255,255,0.85);padding:2px;background:#fff}.banner .avatar{width:72px;height:96px;object-fit:cover;display:block}h2{margin:${s.sectionTitleTopPx}px 0 ${s.sectionTitleBottomPx}px;color:${accentColor};font-size:12pt;border-left:4px solid ${accentColor};padding-left:8px;border-bottom:none}.section-content{padding-left:12px}.muted{color:#000}.time{color:#000}${sharedBlockCss(s)}${sharedListCss(s)}</style></head><body>${banner}${educationBlock}${customSections || legacyRows}${skills ? `<h2>${skillsTitle}</h2><div class="section-content">${formatInline(skills)}</div>` : ''}</body></html>`;
}
