import type { Resume, TemplateDefinition } from '../../resume.types';
import {
  buildCustomSectionBlocks,
  buildEducationBlock,
  buildHeaderData,
  buildLegacyBlocks,
  computeSpacing,
  escapeHtml,
  formatInline,
  type LayoutOptions,
} from '../render-helpers';

/** 经典单栏版式：与重构前 renderHtml 输出保持一致 */
export function renderSingleColumn(
  resume: Resume,
  t: TemplateDefinition,
  layout?: LayoutOptions,
): string {
  const pageMargin = `${layout?.pageMarginMm ?? Number.parseFloat(t.tokens.pageMargin)}mm`;
  const bodyFontSizePt =
    layout?.bodyFontSizePt ?? Number.parseFloat(t.tokens.bodyFontSize);
  const bodyFontSize = `${bodyFontSizePt}pt`;
  const lineHeight = layout?.lineHeight ?? t.tokens.lineHeight;
  const s = computeSpacing(bodyFontSizePt, lineHeight);
  const headerStyle =
    layout?.headerStyle === 'centered' ? 'centered' : 'default';
  const headerBottomGapPx =
    headerStyle === 'centered'
      ? Math.max(2, Math.round(s.blockGapPx * 0.45))
      : Math.max(3, Math.round(s.blockGapPx * 0.6));
  const accentColor = layout?.accentColor ?? t.tokens.accentColor;
  const fontFamily = layout?.fontFamily ?? t.tokens.fontFamily;
  const titles = {
    experience: layout?.sectionTitles?.experience ?? 'Experience',
    projects: layout?.sectionTitles?.projects ?? 'Projects',
    education: layout?.sectionTitles?.education ?? '教育经历',
    skills: layout?.sectionTitles?.skills ?? 'Skills',
  };

  const legacyRows = buildLegacyBlocks(resume, titles);
  const customSections = buildCustomSectionBlocks(resume).join('');
  const legacyEducationBlock = buildEducationBlock(resume, titles.education);
  const skills = (resume.skills ?? []).join(' · ');

  const {
    headerMetaItems,
    headerExtraItems,
    centeredExtraRows,
    headerPhoto,
  } = buildHeaderData(resume);
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

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(resume.basics.name)} - Resume</title><style>@page{size:A4;margin:${pageMargin}}body{font-family:${fontFamily};color:${t.tokens.textColor};font-size:${bodyFontSize};line-height:${lineHeight}}h1{margin:0;color:${accentColor};font-size:16pt}h2{margin:${s.sectionTitleTopPx}px 0 ${s.sectionTitleBottomPx}px;border-bottom:1px solid #000;color:${accentColor};font-size:12pt}.header{margin-bottom:${headerBottomGapPx}px}.header-main{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.header-info{min-width:0;flex:1 1 auto}.header-centered{text-align:center}.header-centered-layout{display:grid;grid-template-columns:76px minmax(0,1fr) 76px;align-items:start;column-gap:10px}.header-centered-info{min-width:0}.header-centered h1{line-height:1.15}.header-centered .meta{justify-content:center;flex-wrap:nowrap;column-gap:18px;row-gap:0;margin-top:3px}.header-centered .meta-text{white-space:nowrap}.header-centered .avatar-wrap{justify-self:end}.header-centered .avatar{width:60px;height:80px}.meta{color:#000;font-size:9.5pt;line-height:16px;margin-top:4px;display:flex;flex-wrap:wrap;align-items:center;column-gap:14px;row-gap:4px}.meta-extra{margin-top:4px}.meta-item{display:inline-flex;align-items:center;height:16px;line-height:16px;gap:5px}.meta-text{display:inline-block;line-height:16px}.meta-icon{width:14px;min-width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-family:Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif;font-size:11px;line-height:14px;vertical-align:middle}.avatar-wrap{flex:0 0 auto;border:1px solid #d1d5db;padding:2px;background:#fff}.avatar{width:78px;height:104px;object-fit:cover;display:block}.summary{margin-top:8px}.section-content{padding-left:${s.sectionContentIndentPx}px}.section-content.no-title{padding-left:0}.block{margin-bottom:${s.blockGapPx}px}.compact-block{margin-bottom:${s.compactBlockGapPx}px}.compact-block:last-child{margin-bottom:0}.edu-block{margin-bottom:${s.educationBlockGapPx}px}.edu-block:last-child{margin-bottom:0}.row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.head{min-width:0;flex:1 1 auto}.time{flex:0 0 auto;white-space:nowrap;color:#000}.edu-school{font-weight:700}.edu-meta{font-weight:400}.exp-company{font-weight:700}.exp-role{font-weight:400}.proj-name{font-weight:700}.proj-org{font-weight:400}.muted{color:#000}ul,ol{margin:${s.listTopPx}px 0 0 ${s.listOuterIndentPx}px;padding-left:${s.listMarkerIndentPx}px}li{margin:${s.lineItemGapPx}px 0}ul.edu-detail,ol.edu-detail{margin-top:${s.educationListTopPx}px}.edu-detail li{margin:${s.educationLineItemGapPx}px 0}.line-block{margin-top:${s.detailTopPx}px}.line-block.edu-detail{margin-top:${s.educationListTopPx}px}.line-list{margin:${s.detailLineItemGapPx}px 0 0 ${s.listOuterIndentPx}px;padding-left:${s.listMarkerIndentPx}px}.line-list:first-child{margin-top:0}.line-list li{margin:${s.detailLineItemGapPx}px 0}.line-item{margin:${s.detailLineItemGapPx}px 0}.line-block .line-item:first-child{margin-top:0}.line-block .line-item:last-child{margin-bottom:0}.edu-detail .line-item{margin:${s.educationLineItemGapPx}px 0}</style></head><body>${header}${bodySections}${skills ? `<h2>${titles.skills}</h2><div class="section-content">${formatInline(skills)}</div>` : ''}</body></html>`;
}
