export type ResumeBasics = {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  summary?: string;
  photo?: string;
  extraInfos?: Array<{
    label: string;
    value: string;
    icon?: string;
  }>;
};

export type ResumeExperience = {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  highlights?: string[];
};

export type ResumeEducation = {
  school: string;
  degree: string;
  major?: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  schoolTags?: string;
  college?: string;
  summary?: string;
  highlights?: string[];
};

export type ResumeCustomSectionItem = {
  title: string;
  org?: string;
  period?: string;
  highlights?: string[];
};

export type ResumeCustomSection = {
  title: string;
  items: ResumeCustomSectionItem[];
};

export type Resume = {
  basics: ResumeBasics;
  education?: ResumeEducation[];
  experience?: ResumeExperience[];
  projects?: Array<Record<string, unknown>>;
  skills?: string[];
  customSections?: ResumeCustomSection[];
};

export type ResumeFileConfig = {
  templateId?: string;
  layout?: {
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
};

export type ResumeRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  data: Resume;
};

export type ResumeFileSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResumeFileRecord = ResumeFileSummary & {
  data: Resume;
  config?: ResumeFileConfig;
};

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  tokens: {
    fontFamily: string;
    accentColor: string;
    textColor: string;
    pageMargin: string;
    bodyFontSize: string;
    lineHeight: number;
  };
};
