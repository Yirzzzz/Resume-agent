export type ResumeBasics = {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  summary?: string;
  photo?: string;
};

export type ResumeEducation = {
  school: string;
  degree: string;
  major?: string;
  startDate: string;
  endDate: string;
  highlights?: string[];
};

export type ResumeExperience = {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  highlights?: string[];
};

export type ResumeProject = {
  name: string;
  description?: string;
  highlights?: string[];
  link?: string;
};

export type Resume = {
  basics: ResumeBasics;
  education?: ResumeEducation[];
  experience?: ResumeExperience[];
  projects?: ResumeProject[];
  skills?: string[];
};

export type ResumeRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  data: Resume;
};
