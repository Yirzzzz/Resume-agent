'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

type Template = { id: string; name: string; description: string };
type Entry = { title: string; org: string; period: string; bullets: string };
type Section = { id: string; title: string; enabled: boolean; items: Entry[] };

type LayoutOptions = {
  pageMarginMm: number;
  bodyFontSizePt: number;
  lineHeight: number;
  sectionTitles: { skills: string };
  accentColor: string;
  fontFamily: string;
};

type ResumeFileConfig = {
  templateId?: string;
  layout?: Partial<LayoutOptions>;
};

type ResumePayload = {
  basics: {
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
  education?: Array<{
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
  }>;
  customSections?: Array<{
    title: string;
    items: Array<{
      title: string;
      org?: string;
      period?: string;
      highlights?: string[];
    }>;
  }>;
  skills?: string[];
};

type ResumeFileSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type ResumeFileRecord = ResumeFileSummary & {
  data: ResumePayload;
  config?: ResumeFileConfig;
};

type SaveResponse = { id: string };

type EducationFormEntry = {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  gpa: string;
  schoolTags: string;
  college: string;
  summary: string;
};

type ExtraInfoEntry = {
  id: string;
  label: string;
  value: string;
  icon: string;
};

type PolishTarget = {
  id: string;
  sectionTitle: string;
  title: string;
  org: string;
  period: string;
  bullets: string;
};

type PolishResultItem = {
  id: string;
  polishedTitle: string;
  polishedOrg: string;
  polishedPeriod: string;
  polishedBullets: string;
  jdRelevance?: 'high' | 'medium' | 'low' | 'none' | string;
  jdImprovements: string[];
  changeSummary: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const defaultEntry = (): Entry => ({ title: '', org: '', period: '', bullets: '' });
const DEGREE_OPTIONS = ['中专', '大专', '本科', '硕士', '博士', 'MBA'] as const;
const EDUCATION_SUMMARY_PLACEHOLDER = '这里写你的个人简介，突出方向与成果。';
const DEFAULT_TEMPLATE_ID = 'modern-cn-001';
const DEFAULT_LAYOUT: LayoutOptions = {
  pageMarginMm: 14,
  bodyFontSizePt: 10.5,
  lineHeight: 1.45,
  sectionTitles: { skills: '技能' },
  accentColor: '#1f4f8f',
  fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
};
const FONT_SIZE_RANGE = { min: 8, max: 16, step: 0.1 } as const;
const LINE_HEIGHT_RANGE = { min: 1, max: 2.2, step: 0.05 } as const;
const PROFILE_PHOTO_MAX_SIZE = 2 * 1024 * 1024;
const EXTRA_INFO_ICON_OPTIONS = [
  { value: '💼', label: '求职/职业' },
  { value: '🎯', label: '目标/意向' },
  { value: '🔗', label: '链接/网站' },
  { value: '🔬', label: '研究/学术' },
  { value: '🧭', label: '方向/定位' },
  { value: '⭐', label: '亮点/其他' },
] as const;
const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false });
};

const defaultEducationEntry = (): EducationFormEntry => ({
  id: uid(),
  school: '',
  degree: '本科',
  major: '',
  startDate: '',
  endDate: '',
  gpa: '',
  schoolTags: '',
  college: '',
  summary: EDUCATION_SUMMARY_PLACEHOLDER,
});

const defaultExtraInfoEntry = (
  patch?: Partial<Omit<ExtraInfoEntry, 'id'>>,
): ExtraInfoEntry => ({
  id: uid(),
  label: '',
  value: '',
  icon: '⭐',
  ...patch,
});

function educationFromResume(
  education: ResumePayload['education'] | undefined,
): EducationFormEntry[] {
  if (!education || education.length === 0) return [defaultEducationEntry()];

  return education.map((item) => {
    const highlights = Array.isArray(item.highlights)
      ? item.highlights.map((line) => String(line).trim()).filter(Boolean)
      : [];

    const summaryLines = highlights
      .filter(
        (line) =>
          !line.startsWith('GPA:') &&
          !line.startsWith('所在学院:') &&
          !line.startsWith('学校标签:'),
      )
      .map((line) => (line.startsWith('简介:') ? line.slice(3).trim() : line))
      .filter(Boolean);

    const tagsFromHighlight =
      highlights.find((line) => line.startsWith('学校标签:'))?.slice(5).trim() ?? '';

    const summaryValue =
      String(item.summary ?? '').trim() || summaryLines.join('\n') || EDUCATION_SUMMARY_PLACEHOLDER;

    return {
      id: uid(),
      school: String(item.school ?? ''),
      degree: String(item.degree ?? '本科') || '本科',
      major: String(item.major ?? ''),
      startDate: String(item.startDate ?? ''),
      endDate: String(item.endDate ?? ''),
      gpa: String(item.gpa ?? ''),
      schoolTags: String(item.schoolTags ?? '').trim() || tagsFromHighlight,
      college: String(item.college ?? ''),
      summary: summaryValue,
    };
  });
}

function educationToResume(
  educationEntries: EducationFormEntry[],
): NonNullable<ResumePayload['education']> {
  return educationEntries
    .map((entry) => {
      const cleanSummary = entry.summary.trim();
      const effectiveSummary =
        cleanSummary === EDUCATION_SUMMARY_PLACEHOLDER ? '' : cleanSummary;
      return {
      school: entry.school.trim(),
      degree: entry.degree.trim() || '本科',
      major: entry.major.trim(),
      startDate: entry.startDate.trim(),
      endDate: entry.endDate.trim(),
      gpa: entry.gpa.trim(),
      schoolTags: entry.schoolTags.trim(),
      college: entry.college.trim(),
      summary: effectiveSummary,
    };
    })
    .filter(
      (entry) =>
        entry.school ||
        entry.major ||
        entry.startDate ||
        entry.endDate ||
        entry.gpa ||
        entry.schoolTags ||
        entry.college ||
        entry.summary,
    )
    .map((entry) => {
      const summaryLines = entry.summary
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      return {
        school: entry.school,
        degree: entry.degree,
        major: entry.major || undefined,
        startDate: entry.startDate,
        endDate: entry.endDate,
        gpa: entry.gpa || undefined,
        schoolTags: entry.schoolTags || undefined,
        college: entry.college || undefined,
        summary: entry.summary || undefined,
        highlights: [
          entry.schoolTags ? `学校标签: ${entry.schoolTags}` : '',
          ...summaryLines,
        ].filter(Boolean),
      };
    });
}

function moveByStep<T>(list: T[], fromIdx: number, step: -1 | 1): T[] {
  const toIdx = fromIdx + step;
  if (fromIdx < 0 || fromIdx >= list.length) return list;
  if (toIdx < 0 || toIdx >= list.length) return list;
  const next = [...list];
  const [picked] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, picked);
  return next;
}

function applyTextStyleShortcut(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (next: string) => void,
) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();

  let marker = '';
  if (key === 'b') marker = '**';
  if (key === 'i') marker = '*';
  if (key === 'u') marker = '__';
  if (!marker) return;

  e.preventDefault();

  const el = e.currentTarget;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const selected = value.slice(start, end);
  const wrapped = `${marker}${selected}${marker}`;
  const next = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
  onChange(next);

  requestAnimationFrame(() => {
    const selectionStart = start + marker.length;
    const selectionEnd = selectionStart + selected.length;
    el.setSelectionRange(selectionStart, selectionEnd);
  });
}

function createDefaultSections(): Section[] {
  return [
    {
      id: uid(),
      title: '工作/实习经历',
      enabled: true,
      items: [
        {
          title: '前端工程师',
          org: '某科技公司',
          period: '2022-07 ~ 至今',
          bullets: '负责核心页面重构\n首屏性能提升 40%\n沉淀组件库规范',
        },
      ],
    },
    {
      id: uid(),
      title: '项目经历',
      enabled: true,
      items: [
        {
          title: '简历 Agent 平台',
          org: '个人项目',
          period: '2026',
          bullets: '支持模板切换与 PDF 导出\n支持简历润色与模拟面试',
        },
      ],
    },
    {
      id: uid(),
      title: '科研/校园经历',
      enabled: true,
      items: [
        {
          title: '多模态简历评估研究',
          org: '实验室',
          period: '2025',
          bullets: '建立简历质量评估指标\n完成 A/B 测试分析',
        },
      ],
    },
  ];
}

function sectionsFromResume(resume: ResumePayload): Section[] {
  const sections = (resume.customSections ?? [])
    .map((section) => ({
      id: uid(),
      title: section.title ?? '未命名模块',
      enabled: true,
      items: (section.items ?? []).map((item) => ({
        title: String(item.title ?? ''),
        org: String(item.org ?? ''),
        period: String(item.period ?? ''),
        bullets: Array.isArray(item.highlights) ? item.highlights.join('\n') : '',
      })),
    }))
    .map((section) => ({
      ...section,
      items: section.items.length > 0 ? section.items : [defaultEntry()],
    }));

  return sections.length > 0 ? sections : createDefaultSections();
}

const ToolIcon = ({ kind }: { kind: 'template' | 'font' | 'line' | 'margin' }) => {
  if (kind === 'template') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M3 10h18M9 10v10" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === 'font') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19L12 5l7 14M8 14h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'line') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 6h8M8 18h8M6 8v8M18 8v8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
};

const TrashIcon = () => (
  <span className="trash-emoji" aria-hidden="true">
    🗑
  </span>
);

export function ResumeForm({ apiBaseUrl, templates }: { apiBaseUrl: string; templates: Template[] }) {
  const [name, setName] = useState('你的姓名');
  const [email, setEmail] = useState('you@example.com');
  const [phone, setPhone] = useState('13800000000');
  const [location, setLocation] = useState('上海');
  const [summary, setSummary] = useState('在这里写你的个人简介，突出方向与成果。');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [extraInfos, setExtraInfos] = useState<ExtraInfoEntry[]>([]);
  const [skills, setSkills] = useState('TypeScript, React, Next.js');
  const [showSkills, setShowSkills] = useState(true);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? DEFAULT_TEMPLATE_ID);

  const [sections, setSections] = useState<Section[]>(createDefaultSections);
  const [educationEntries, setEducationEntries] = useState<EducationFormEntry[]>([
    defaultEducationEntry(),
  ]);

  const [layout, setLayout] = useState<LayoutOptions>(DEFAULT_LAYOUT);

  const [files, setFiles] = useState<ResumeFileSummary[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [switchTargetId, setSwitchTargetId] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loadedVersion, setLoadedVersion] = useState(0);
  const previewUrlRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [showPolishModal, setShowPolishModal] = useState(false);
  const [selectedPolishKeys, setSelectedPolishKeys] = useState<string[]>([]);
  const [polishLoading, setPolishLoading] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishJd, setPolishJd] = useState('');
  const [polishResults, setPolishResults] = useState<Record<string, PolishResultItem>>({});
  const [previewMode, setPreviewMode] = useState<'pdf' | 'polish'>('pdf');
  const [polishSelectedSnapshot, setPolishSelectedSnapshot] = useState<PolishTarget[]>([]);
  const [activePolishTargetId, setActivePolishTargetId] = useState('');

  const enabledSections = sections.filter((s) => s.enabled);
  const polishTargets = useMemo<PolishTarget[]>(() => {
    const targets: PolishTarget[] = [];
    sections.forEach((section, sIdx) => {
      if (!section.enabled) return;
      const isEducation = /教育|校园|education/i.test(section.title);
      if (isEducation) return;
      section.items.forEach((item, iIdx) => {
        const hasContent =
          item.title.trim() ||
          item.org.trim() ||
          item.period.trim() ||
          item.bullets.trim();
        if (!hasContent) return;
        targets.push({
          id: `section-${sIdx}-${iIdx}`,
          sectionTitle: section.title.trim() || '未命名模块',
          title: item.title.trim(),
          org: item.org.trim(),
          period: item.period.trim(),
          bullets: item.bullets.trim(),
        });
      });
    });
    if (showSkills && skills.trim()) {
      targets.push({
        id: 'skills-0',
        sectionTitle: '技能',
        title: '技能',
        org: '',
        period: '',
        bullets: skills
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
          .join('\n'),
      });
    }
    return targets;
  }, [sections, showSkills, skills]);

  const resumePayload = useMemo<ResumePayload>(
    () => ({
      basics: {
        name,
        email,
        phone,
        location,
        summary,
        photo: profilePhoto.trim() || undefined,
        extraInfos: extraInfos
          .map((item) => ({
            label: item.label.trim(),
            value: item.value.trim(),
            icon: item.icon.trim() || undefined,
          }))
          .filter((item) => item.label || item.value),
      },
      education: educationToResume(educationEntries),
      customSections: enabledSections.map((section) => ({
        title: section.title,
        items: section.items
          .filter(
            (i) =>
              i.title.trim() ||
              i.org.trim() ||
              i.period.trim() ||
              i.bullets
                .split('\n')
                .map((x) => x.trim())
                .some(Boolean),
          )
          .map((i) => ({
            title: i.title,
            org: i.org,
            period: i.period,
            highlights: i.bullets
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
          })),
      })),
      skills: showSkills
        ? skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    }),
    [
      name,
      email,
      phone,
      location,
      summary,
      profilePhoto,
      extraInfos,
      educationEntries,
      enabledSections,
      showSkills,
      skills,
    ],
  );

  const latestRef = useRef({ resumePayload, templateId, layout });
  useEffect(() => {
    latestRef.current = { resumePayload, templateId, layout };
  }, [resumePayload, templateId, layout]);

  const applyResumeToForm = useCallback((resume: ResumePayload) => {
    setName(resume.basics?.name ?? '你的姓名');
    setEmail(resume.basics?.email ?? 'you@example.com');
    setPhone(resume.basics?.phone ?? '13800000000');
    setLocation(resume.basics?.location ?? '上海');
    setSummary(resume.basics?.summary ?? '在这里写你的个人简介，突出方向与成果。');
    setProfilePhoto(resume.basics?.photo ?? '');
    setExtraInfos(
      Array.isArray(resume.basics?.extraInfos)
        ? resume.basics.extraInfos.map((item) =>
            defaultExtraInfoEntry({
              label: String(item.label ?? ''),
              value: String(item.value ?? ''),
              icon: String(item.icon ?? '⭐') || '⭐',
            }),
          )
        : [],
    );

    const resumeSkills = Array.isArray(resume.skills) ? resume.skills : [];
    setShowSkills(resumeSkills.length > 0);
    setSkills(resumeSkills.join(', '));

    setEducationEntries(educationFromResume(resume.education));
    setSections(sectionsFromResume(resume));
  }, []);

  const requestJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(`${apiBaseUrl}${path}`, init);
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error('内容过大（如头像过大），请压缩图片后重试');
        }
        let msg = '请求失败';
        try {
          msg = await res.text();
        } catch {
          // ignore
        }
        throw new Error(msg || '请求失败');
      }
      return (await res.json()) as T;
    },
    [apiBaseUrl],
  );

  const refreshFiles = useCallback(
    async (preferId?: string) => {
      const list = await requestJson<ResumeFileSummary[]>('/resume-files');
      setFiles(list);

      if (list.length === 0) {
        setActiveFileId(null);
        return null;
      }

      const pickedId =
        (preferId && list.some((f) => f.id === preferId) ? preferId : null) ??
        (activeFileId && list.some((f) => f.id === activeFileId) ? activeFileId : null) ??
        list.find((f) => f.isDefault)?.id ??
        list[0].id;

      setActiveFileId(pickedId);
      setSwitchTargetId(pickedId);
      return pickedId;
    },
    [activeFileId, requestJson],
  );

  const loadFile = useCallback(
    async (id: string) => {
      const file = await requestJson<ResumeFileRecord>(`/resume-files/${id}`);
      setActiveFileId(file.id);
      setSwitchTargetId(file.id);
      const nextTemplateId = file.config?.templateId ?? templates[0]?.id ?? DEFAULT_TEMPLATE_ID;
      setTemplateId(nextTemplateId);
      setLayout({
        ...DEFAULT_LAYOUT,
        ...file.config?.layout,
        sectionTitles: {
          ...DEFAULT_LAYOUT.sectionTitles,
          ...(file.config?.layout?.sectionTitles ?? {}),
        },
      });
      applyResumeToForm(file.data);
      setSaved({ id: file.id });
      setLoadedVersion((v) => v + 1);
    },
    [applyResumeToForm, requestJson, templates],
  );

  const bootstrapFiles = useCallback(async () => {
    setFileLoading(true);
    setError(null);
    try {
      const pickedId = await refreshFiles();
      if (pickedId) {
        await loadFile(pickedId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载简历文件失败');
    } finally {
      setFileLoading(false);
    }
  }, [loadFile, refreshFiles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void bootstrapFiles();
    }, 0);
    return () => clearTimeout(timer);
  }, [bootstrapFiles]);

  function updateSection(sectionId: string, patch: Partial<Section>) {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { id: uid(), title: '新模块', enabled: true, items: [defaultEntry()] },
    ]);
  }

  function removeSection(sectionId: string) {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  }

  function moveSection(sectionId: string, step: -1 | 1) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === sectionId);
      if (idx < 0) return prev;
      return moveByStep(prev, idx, step);
    });
  }

  function addItem(sectionId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, items: [...s.items, defaultEntry()] } : s,
      ),
    );
  }

  function removeItem(sectionId: string, idx: number) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        if (s.items.length <= 1) return s;
        return { ...s, items: s.items.filter((_, i) => i !== idx) };
      }),
    );
  }

  function updateItem(sectionId: string, idx: number, key: keyof Entry, value: string) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const next = [...s.items];
        next[idx] = { ...next[idx], [key]: value };
        return { ...s, items: next };
      }),
    );
  }

  function moveItem(sectionId: string, idx: number, step: -1 | 1) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return { ...s, items: moveByStep(s.items, idx, step) };
      }),
    );
  }

  function addEducationEntry() {
    setEducationEntries((prev) => [...prev, defaultEducationEntry()]);
  }

  function updateEducationEntry(
    idx: number,
    key: keyof Omit<EducationFormEntry, 'id'>,
    value: string,
  ) {
    setEducationEntries((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  function removeEducationEntry(idx: number) {
    setEducationEntries((prev) => {
      if (prev.length <= 1) return [defaultEducationEntry()];
      return prev.filter((_, i) => i !== idx);
    });
  }

  function moveEducationEntry(idx: number, step: -1 | 1) {
    setEducationEntries((prev) => moveByStep(prev, idx, step));
  }

  function handleProfilePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片格式的头像文件');
      return;
    }

    if (file.size > PROFILE_PHOTO_MAX_SIZE) {
      setError('头像文件不能超过 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      if (!value.startsWith('data:image/')) {
        setError('头像读取失败，请重试');
        return;
      }
      setProfilePhoto(value);
      setError(null);
    };
    reader.onerror = () => {
      setError('头像读取失败，请重试');
    };
    reader.readAsDataURL(file);
  }

  function addExtraInfo(patch?: Partial<Omit<ExtraInfoEntry, 'id'>>) {
    setExtraInfos((prev) => [...prev, defaultExtraInfoEntry(patch)]);
  }

  function updateExtraInfo(
    idx: number,
    key: keyof Omit<ExtraInfoEntry, 'id'>,
    value: string,
  ) {
    setExtraInfos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  function removeExtraInfo(idx: number) {
    const title = extraInfos[idx]?.label?.trim() || `附加信息第${idx + 1}条`;
    if (!confirmDelete(`附加信息「${title}」`)) return;
    setExtraInfos((prev) => prev.filter((_, i) => i !== idx));
  }

  function confirmDelete(targetName: string): boolean {
    return window.confirm(`确定删除 ${targetName} 吗？`);
  }

  function handleDeleteSection(sectionId: string, sectionTitle: string) {
    const title = sectionTitle.trim() || '未命名模块';
    if (!confirmDelete(`模块「${title}」`)) return;
    removeSection(sectionId);
  }

  function handleDeleteItem(
    sectionId: string,
    idx: number,
    itemTitle: string,
    sectionTitle: string,
  ) {
    const title = itemTitle.trim() || `${sectionTitle || '模块'}的第${idx + 1}条`;
    if (!confirmDelete(`条目「${title}」`)) return;
    removeItem(sectionId, idx);
  }

  function handleDeleteEducation(idx: number, school: string) {
    const title = school.trim() || `校园经历第${idx + 1}条`;
    if (!confirmDelete(`校园经历「${title}」`)) return;
    removeEducationEntry(idx);
  }

  function handleDeletePhoto() {
    if (!profilePhoto) return;
    if (!confirmDelete('头像照片')) return;
    setProfilePhoto('');
  }

  const generatePreviewPdf = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const {
        resumePayload: latestResume,
        templateId: latestTemplateId,
        layout: latestLayout,
      } = latestRef.current;
      const res = await fetch(`${apiBaseUrl}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: latestResume,
          templateId: latestTemplateId,
          layout: latestLayout,
        }),
      });
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error('预览内容过大（如头像过大），请压缩图片后重试');
        }
        throw new Error('预览生成失败');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '预览生成失败');
    } finally {
      setPreviewLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (loadedVersion === 0) return;
    const timer = setTimeout(() => {
      void generatePreviewPdf();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadedVersion, generatePreviewPdf]);

  useEffect(() => {
    const timer = setInterval(() => {
      void generatePreviewPdf();
    }, 60000);
    return () => clearInterval(timer);
  }, [generatePreviewPdf]);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  async function persistCurrentFile(): Promise<boolean> {
    if (!activeFileId) {
      setError('当前没有可保存的简历文件');
      return false;
    }

    setLoading(true);
    setError(null);
    try {
      const savedFile = await requestJson<ResumeFileRecord>(`/resume-files/${activeFileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resumePayload,
          config: {
            templateId,
            layout,
          },
        }),
      });
      setSaved({ id: savedFile.id });
      await refreshFiles(savedFile.id);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    await persistCurrentFile();
  }

  async function handleCompilePreview() {
    const ok = await persistCurrentFile();
    if (!ok) return;
    await generatePreviewPdf();
  }

  async function handleCreateFile() {
    setFileLoading(true);
    setError(null);
    try {
      const inputName = window.prompt('请输入新简历文件名（可留空）', '');
      if (inputName === null) {
        setFileLoading(false);
        return;
      }
      const file = await requestJson<ResumeFileRecord>('/resume-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inputName.trim() || undefined,
          config: {
            templateId,
            layout,
          },
        }),
      });
      await refreshFiles(file.id);
      await loadFile(file.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '新建简历文件失败');
    } finally {
      setFileLoading(false);
    }
  }

  async function handleSwitchFile(id: string) {
    if (!id) return;
    setFileLoading(true);
    setError(null);
    try {
      await loadFile(id);
      await refreshFiles(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换简历文件失败');
    } finally {
      setFileLoading(false);
    }
  }

  async function handleSwitchTarget() {
    if (!switchTargetId) return;
    await handleSwitchFile(switchTargetId);
  }

  async function handleSetDefault() {
    if (!activeFileId) return;
    setFileLoading(true);
    setError(null);
    try {
      await requestJson<ResumeFileRecord>(`/resume-files/${activeFileId}/default`, {
        method: 'PATCH',
      });
      await refreshFiles(activeFileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : '设置默认简历失败');
    } finally {
      setFileLoading(false);
    }
  }

  async function handleDeleteFile() {
    if (!activeFileId) return;
    if (files.length <= 1) {
      setError('至少保留一份简历文件');
      return;
    }
    const activeName =
      files.find((file) => file.id === activeFileId)?.name ?? '当前简历文件';
    if (!confirmDelete(`简历文件「${activeName}」`)) {
      return;
    }

    setFileLoading(true);
    setError(null);
    try {
      const result = await requestJson<{ deletedId: string; nextDefaultId: string | null }>(
        `/resume-files/${activeFileId}`,
        { method: 'DELETE' },
      );
      const nextId = await refreshFiles(result.nextDefaultId ?? undefined);
      if (nextId) {
        await loadFile(nextId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除简历文件失败');
    } finally {
      setFileLoading(false);
    }
  }

  async function handleExportPdf() {
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: resumePayload, templateId, layout }),
      });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resume-${templateId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导出失败');
    }
  }

  function openPolishModal() {
    setShowPolishModal(true);
    setPolishError(null);
    setPolishResults({});
    if (selectedPolishKeys.length === 0) {
      setSelectedPolishKeys(polishTargets.slice(0, 2).map((item) => item.id));
    }
  }

  async function generatePolishDraft() {
    const selected = polishTargets.filter((item) =>
      selectedPolishKeys.includes(item.id),
    );
    if (selected.length === 0) {
      setPolishError('请先选择至少一个条目');
      return;
    }
    setPolishLoading(true);
    setPolishError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/resume/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeFileId: activeFileId ?? undefined,
          targetPosition: '目标岗位',
          jobDescription: polishJd.trim(),
          targets: selected,
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        items?: PolishResultItem[];
      };
      if (!res.ok) {
        throw new Error(data.message || `润色失败（${res.status}）`);
      }
      const map: Record<string, PolishResultItem> = {};
      (data.items ?? []).forEach((item) => {
        if (!item?.id) return;
        map[item.id] = item;
      });
      setPolishResults(map);
      setPolishSelectedSnapshot(selected);
      if (Object.keys(map).length === 0) {
        setPolishError('模型未返回可用润色结果，请重试');
      } else {
        const firstValid = selected.find((x) => map[x.id])?.id ?? '';
        setActivePolishTargetId(firstValid);
        setShowPolishModal(false);
        setPreviewMode('polish');
      }
    } catch (e) {
      setPolishError(e instanceof Error ? e.message : '润色失败');
    } finally {
      setPolishLoading(false);
    }
  }

  return (
    <section>
      <div className="top-toolbar toolbar-v2 comic-panel p-3">
        <div className="toolbar-track">
          <div className="toolbar-left">
            <label className="tool-field v3-tool" data-tip="选择简历模板风格" title="选择简历模板风格">
              <span className="field-with-icon v3-field">
                <span className="tool-icon in-field">
                  <ToolIcon kind="template" />
                </span>
                <select className="comic-input with-icon v3-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="tool-field v3-tool" data-tip="主题色：控制标题字体颜色" title="主题色：控制标题字体颜色">
              <span className="field-with-icon v3-field">
                <span className="tool-icon in-field">
                  <ToolIcon kind="template" />
                </span>
                <select className="comic-input with-icon v3-select" value={layout.accentColor} onChange={(e) => setLayout((v) => ({ ...v, accentColor: e.target.value }))}>
                  <option value="#1f4f8f">深蓝</option>
                  <option value="#b42318">酒红</option>
                  <option value="#0f766e">青绿</option>
                  <option value="#6b21a8">紫罗兰</option>
                  <option value="#1f2937">深灰</option>
                </select>
              </span>
            </label>
            <label className="tool-field v3-tool" data-tip="字体：常用中文简历字体" title="字体：常用中文简历字体">
              <span className="field-with-icon v3-field">
                <span className="tool-icon in-field">
                  <ToolIcon kind="font" />
                </span>
                <select className="comic-input with-icon v3-select" value={layout.fontFamily} onChange={(e) => setLayout((v) => ({ ...v, fontFamily: e.target.value }))}>
                  <option value="Microsoft YaHei, PingFang SC, sans-serif">微软雅黑</option>
                  <option value="SimSun, Songti SC, serif">宋体</option>
                  <option value="KaiTi, STKaiti, serif">楷体</option>
                  <option value="FangSong, STFangsong, serif">仿宋</option>
                  <option value="PingFang SC, Hiragino Sans GB, sans-serif">苹方</option>
                </select>
              </span>
            </label>
            <label className="tool-field v3-tool" data-tip="字体大小（pt）" title="字体大小（pt），越大字越大">
              <span className="field-with-icon v3-field">
                <span className="tool-icon in-field">
                  <ToolIcon kind="font" />
                </span>
                <span className="v3-range-wrap">
                  <input
                    className="v3-range"
                    type="range"
                    min={FONT_SIZE_RANGE.min}
                    max={FONT_SIZE_RANGE.max}
                    step={FONT_SIZE_RANGE.step}
                    value={layout.bodyFontSizePt}
                    onChange={(e) =>
                      setLayout((v) => ({
                        ...v,
                        bodyFontSizePt: Number(e.target.value),
                      }))
                    }
                  />
                  <span className="v3-range-value">{layout.bodyFontSizePt.toFixed(1)}pt</span>
                </span>
              </span>
            </label>
            <label className="tool-field v3-tool" data-tip="行高（倍数）" title="行高（倍数），越大行距越松">
              <span className="field-with-icon v3-field">
                <span className="tool-icon in-field">
                  <ToolIcon kind="line" />
                </span>
                <span className="v3-range-wrap">
                  <input
                    className="v3-range"
                    type="range"
                    min={LINE_HEIGHT_RANGE.min}
                    max={LINE_HEIGHT_RANGE.max}
                    step={LINE_HEIGHT_RANGE.step}
                    value={layout.lineHeight}
                    onChange={(e) =>
                      setLayout((v) => ({
                        ...v,
                        lineHeight: Number(e.target.value),
                      }))
                    }
                  />
                  <span className="v3-range-value">{layout.lineHeight.toFixed(2)}</span>
                </span>
              </span>
            </label>
            <label className="tool-field v3-tool" data-tip="页边距（mm）" title="页边距（mm），越小可放更多内容">
              <span className="field-with-icon v3-field">
                <span className="tool-icon in-field">
                  <ToolIcon kind="margin" />
                </span>
                <select className="comic-input with-icon v3-select" value={String(layout.pageMarginMm)} onChange={(e) => setLayout((v) => ({ ...v, pageMarginMm: Number(e.target.value) }))}>
                  <option value="5">5</option>
                  <option value="7">7</option>
                  <option value="9">9</option>
                  <option value="11">11</option>
                  <option value="14">14</option>
                  <option value="16">16</option>
                </select>
              </span>
            </label>
          </div>
          <div className="toolbar-right">
            <button className="comic-btn alt" type="button" onClick={openPolishModal}>
              AI润色
            </button>
            <button className="comic-btn alt" type="button" onClick={handleExportPdf}>
              导出PDF
            </button>
            <button
              className="comic-btn"
              type="button"
              onClick={() => {
                setPreviewMode('pdf');
                void handleCompilePreview();
              }}
              disabled={loading || fileLoading || previewLoading || !activeFileId}
            >
              PDF预览
            </button>
          </div>
        </div>
      </div>
      <div className="editor-layout">
        <div className="comic-editor editor-pane">
          <div className="comic-banner">SCRIPT YOUR HERO STORY</div>
          <h2 className="comic-title">编辑区</h2>

          <div className="comic-group">
            <div className="archive-head">
              <div className="comic-group-title">档案文件</div>
              <div className="archive-head-actions">
                <select
                  className="comic-input archive-switch-select"
                  value={switchTargetId}
                  onChange={(e) => setSwitchTargetId(e.target.value)}
                  disabled={fileLoading}
                >
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name}
                      {file.isDefault ? '（默认）' : ''}
                    </option>
                  ))}
                </select>
                <button className="archive-op-btn switch" type="button" onClick={() => void handleSwitchTarget()} disabled={!switchTargetId || fileLoading}>
                  更换简历文件
                </button>
              </div>
            </div>
            <div className="archive-list">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`archive-item${file.id === activeFileId ? ' active' : ''}`}
                >
                  <div className="archive-item-main">
                    <span className="archive-name">{file.name}</span>
                    {file.isDefault ? <span className="archive-badge">默认</span> : null}
                    {file.id === activeFileId ? <span className="archive-badge current">当前</span> : null}
                    {file.id === activeFileId ? (
                      <span className="archive-inline-actions">
                        <button className="archive-op-btn default" type="button" onClick={() => void handleSetDefault()} disabled={file.isDefault || fileLoading}>
                          设为默认
                        </button>
                        <button className="archive-op-btn create" type="button" onClick={() => void handleCreateFile()} disabled={fileLoading}>
                          新建
                        </button>
                        <button
                          className="archive-op-btn delete icon-trash-btn"
                          type="button"
                          onClick={() => void handleDeleteFile()}
                          disabled={files.length <= 1 || fileLoading}
                          title="删除简历文件"
                          aria-label="删除简历文件"
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    ) : null}
                  </div>
                  <div className="archive-time">更新于 {formatTime(file.updatedAt)}</div>
                </div>
              ))}
              {files.length === 0 ? <div className="archive-empty">暂无档案文件</div> : null}
            </div>
          </div>

          <div className="comic-group">
            <div className="comic-group-title">角色档案</div>
            <div className="profile-main-row">
              <div className="profile-grid-2x2">
                <input className="comic-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="姓名" />
                <input className="comic-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="邮箱" />
                <input className="comic-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="电话" />
                <input className="comic-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="城市" />
              </div>
              <div className="profile-photo-panel">
                <div className="profile-photo-preview">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="个人头像预览" className="profile-photo-image" />
                  ) : (
                    <span className="profile-photo-empty">头像</span>
                  )}
                </div>
                <button
                  className="tiny-btn"
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                >
                  选择照片
                </button>
                <input
                  ref={photoInputRef}
                  className="profile-photo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleProfilePhotoUpload}
                />
                <button
                  className="tiny-btn"
                  type="button"
                  onClick={handleDeletePhoto}
                  disabled={!profilePhoto}
                  title="删除照片"
                  aria-label="删除照片"
                >
                  删除照片
                </button>
              </div>
            </div>
            <div className="extra-info-head">
              <div className="extra-info-quick">
                <button className="tiny-btn" type="button" onClick={() => addExtraInfo({ label: '求职状态', icon: '💼' })}>
                  + 求职状态
                </button>
                <button className="tiny-btn" type="button" onClick={() => addExtraInfo({ label: '意向岗位', icon: '🎯' })}>
                  + 意向岗位
                </button>
                <button className="tiny-btn" type="button" onClick={() => addExtraInfo({ label: '个人网站', icon: '🔗' })}>
                  + 个人网站
                </button>
                <button className="tiny-btn" type="button" onClick={() => addExtraInfo({ label: '研究方向', icon: '🔬' })}>
                  + 研究方向
                </button>
              </div>
            </div>
            {extraInfos.map((item, idx) => (
              <div key={item.id} className="extra-info-row">
                <select
                  className="comic-input extra-icon-select"
                  value={item.icon}
                  onChange={(e) => updateExtraInfo(idx, 'icon', e.target.value)}
                >
                  {EXTRA_INFO_ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.value} {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  className="comic-input"
                  value={item.label}
                  onChange={(e) => updateExtraInfo(idx, 'label', e.target.value)}
                  placeholder="字段名（如 求职状态）"
                />
                <input
                  className="comic-input"
                  value={item.value}
                  onChange={(e) => updateExtraInfo(idx, 'value', e.target.value)}
                  placeholder="字段值（如 在职-月内到岗）"
                />
                <button
                  className="tiny-btn icon-trash-btn"
                  type="button"
                  onClick={() => removeExtraInfo(idx)}
                  title="删除附加信息"
                  aria-label="删除附加信息"
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            <button className="tiny-btn" type="button" onClick={() => addExtraInfo()}>
              + 新增自定义信息
            </button>
            <textarea
              className="comic-input"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onKeyDown={(e) =>
                applyTextStyleShortcut(e, summary, (next) => setSummary(next))
              }
              placeholder="个人简介"
            />
          </div>

          <div className="comic-group">
            <div className="comic-group-title">校园经历</div>
            {educationEntries.map((entry, idx) => (
              <div key={entry.id} className="entry-box comic-entry-box">
                <div className="entry-chip">校园经历 {idx + 1}</div>
                <input
                  className="comic-input"
                  value={entry.school}
                  onChange={(e) =>
                    updateEducationEntry(idx, 'school', e.target.value)
                  }
                  placeholder="学校"
                />
                <div className="layout-row">
                  <select
                    className="comic-input"
                    value={entry.degree}
                    onChange={(e) =>
                      updateEducationEntry(idx, 'degree', e.target.value)
                    }
                  >
                    {DEGREE_OPTIONS.map((degree) => (
                      <option key={degree} value={degree}>
                        {degree}
                      </option>
                    ))}
                  </select>
                  <input
                    className="comic-input"
                    value={entry.major}
                    onChange={(e) =>
                      updateEducationEntry(idx, 'major', e.target.value)
                    }
                    placeholder="专业"
                  />
                  <input
                    className="comic-input"
                    value={entry.gpa}
                    onChange={(e) =>
                      updateEducationEntry(idx, 'gpa', e.target.value)
                    }
                    placeholder="GPA"
                  />
                </div>
                <div className="layout-row">
                  <input
                    className="comic-input"
                    value={entry.college}
                    onChange={(e) =>
                      updateEducationEntry(idx, 'college', e.target.value)
                    }
                    placeholder="所在学院"
                  />
                  <input
                    className="comic-input"
                    value={entry.startDate}
                    onChange={(e) =>
                      updateEducationEntry(idx, 'startDate', e.target.value)
                    }
                    placeholder="开始时间（如 2022-09）"
                  />
                  <input
                    className="comic-input"
                    value={entry.endDate}
                    onChange={(e) =>
                      updateEducationEntry(idx, 'endDate', e.target.value)
                    }
                    placeholder="结束时间（如 2026-06）"
                  />
                </div>
                <input
                  className="comic-input"
                  value={entry.schoolTags}
                  onChange={(e) =>
                    updateEducationEntry(idx, 'schoolTags', e.target.value)
                  }
                  placeholder="学校标签（如 985/211/双一流）"
                />
                <textarea
                  className="comic-input"
                  rows={3}
                  value={entry.summary}
                  onChange={(e) =>
                    updateEducationEntry(idx, 'summary', e.target.value)
                  }
                  onKeyDown={(e) =>
                    applyTextStyleShortcut(e, entry.summary, (next) =>
                      updateEducationEntry(idx, 'summary', next),
                    )
                  }
                  placeholder="这里写你的个人简介，突出方向与成果。"
                />
                <div className="flex gap-2">
                  <button
                    className="tiny-btn"
                    type="button"
                    onClick={() => moveEducationEntry(idx, -1)}
                    disabled={idx === 0}
                  >
                    上移
                  </button>
                  <button
                    className="tiny-btn"
                    type="button"
                    onClick={() => moveEducationEntry(idx, 1)}
                    disabled={idx === educationEntries.length - 1}
                  >
                    下移
                  </button>
                  <button
                    className="tiny-btn icon-trash-btn"
                    type="button"
                    onClick={() => handleDeleteEducation(idx, entry.school)}
                    title="删除校园经历"
                    aria-label="删除校园经历"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
            <button className="tiny-btn" type="button" onClick={addEducationEntry}>
              + 新增校园经历
            </button>
          </div>

          {sections.map((section) => (
            <div key={section.id} className="comic-group">
              <div className="section-head-row">
                <input className="comic-input" value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} placeholder="模块标题" />
                <label className="switch-label">
                  <input type="checkbox" checked={section.enabled} onChange={(e) => updateSection(section.id, { enabled: e.target.checked })} /> 显示
                </label>
              </div>
              {section.enabled
                ? section.items.map((item, idx) => (
                    <div key={`${section.id}-${idx}`} className="entry-box comic-entry-box">
                      <div className="entry-chip">第 {idx + 1} 格</div>
                      <input className="comic-input" value={item.title} onChange={(e) => updateItem(section.id, idx, 'title', e.target.value)} placeholder="标题" />
                      <input className="comic-input" value={item.org} onChange={(e) => updateItem(section.id, idx, 'org', e.target.value)} placeholder="组织" />
                      <input className="comic-input" value={item.period} onChange={(e) => updateItem(section.id, idx, 'period', e.target.value)} placeholder="时间" />
                      <textarea
                        className="comic-input"
                        rows={3}
                        value={item.bullets}
                        onChange={(e) => updateItem(section.id, idx, 'bullets', e.target.value)}
                        onKeyDown={(e) =>
                          applyTextStyleShortcut(e, item.bullets, (next) =>
                            updateItem(section.id, idx, 'bullets', next),
                          )
                        }
                        placeholder="每行一个要点"
                      />
                      <div className="flex gap-2">
                        <button
                          className="tiny-btn"
                          type="button"
                          onClick={() => moveItem(section.id, idx, -1)}
                          disabled={idx === 0}
                        >
                          上移
                        </button>
                        <button
                          className="tiny-btn"
                          type="button"
                          onClick={() => moveItem(section.id, idx, 1)}
                          disabled={idx === section.items.length - 1}
                        >
                          下移
                        </button>
                        <button
                          className="tiny-btn icon-trash-btn"
                          type="button"
                          onClick={() =>
                            handleDeleteItem(
                              section.id,
                              idx,
                              item.title,
                              section.title,
                            )
                          }
                          title="删除条目"
                          aria-label="删除条目"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))
                : null}
              <div className="flex gap-2">
                <button
                  className="tiny-btn"
                  type="button"
                  onClick={() => moveSection(section.id, -1)}
                  disabled={sections.findIndex((s) => s.id === section.id) === 0}
                >
                  上移模块
                </button>
                <button
                  className="tiny-btn"
                  type="button"
                  onClick={() => moveSection(section.id, 1)}
                  disabled={
                    sections.findIndex((s) => s.id === section.id) === sections.length - 1
                  }
                >
                  下移模块
                </button>
                <button className="tiny-btn" type="button" onClick={() => addItem(section.id)}>
                  + 新增条目
                </button>
                <button
                  className="tiny-btn icon-trash-btn"
                  type="button"
                  onClick={() => handleDeleteSection(section.id, section.title)}
                  title="删除模块"
                  aria-label="删除模块"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}

          <button className="tiny-btn" type="button" onClick={addSection}>
            + 新增模块
          </button>

          <div className="comic-group">
            <div className="section-head-row">
              <label className="switch-label">
                <input type="checkbox" checked={showSkills} onChange={(e) => setShowSkills(e.target.checked)} /> 显示
              </label>
            </div>
            <input className="comic-input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="技能，用逗号分隔" />
            {saved ? <p className="text-xs">已保存文件ID: {saved.id}</p> : null}
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
          </div>
        </div>

        <div className="comic-panel p-4 preview-pane">
          {previewMode === 'pdf' ? (
            <>
              <h2 className="comic-title">PDF预览</h2>
              {previewLoading ? <p className="text-sm">正在生成预览 PDF...</p> : null}
              <div className="pdf-stage">
                <div className="pdf-frame-wrap">
                  {previewUrl ? (
                    <iframe title="resume-pdf-preview" src={`${previewUrl}#toolbar=0&navpanes=0&view=Fit`} className="pdf-frame" />
                  ) : (
                    <div className="pdf-empty">暂无预览</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="polish-preview">
              <div className="polish-preview-top">
                <div className="comic-banner polish-banner">润色结果</div>
              </div>
              <div className="polish-preview-head">
                <div className="polish-preview-actions">
                  <div className="polish-select-wrap">
                    <select
                      className="comic-input polish-select"
                      value={activePolishTargetId}
                      onChange={(e) => setActivePolishTargetId(e.target.value)}
                    >
                      {polishSelectedSnapshot
                        .filter((x) => polishResults[x.id])
                        .map((item, idx) => (
                          <option key={item.id} value={item.id}>
                            {idx + 1}. [{item.sectionTitle}] {item.title || '未命名条目'}
                          </option>
                        ))}
                    </select>
                    <span className="polish-select-arrow">▼</span>
                  </div>
                  <button className="comic-btn alt" type="button" onClick={() => setPreviewMode('pdf')}>
                    返回PDF
                  </button>
                </div>
              </div>
              <div className="interview-polish-compare mt-2">
                {(() => {
                  const before = polishSelectedSnapshot.find((x) => x.id === activePolishTargetId)
                    ?? polishSelectedSnapshot.find((x) => polishResults[x.id]);
                  if (!before) return null;
                  const after = polishResults[before.id];
                  if (!after) return null;
                  return (
                    <div key={before.id} className="interview-polish-compare-item action-lines-stage">
                      <div className="interview-polish-two-col">
                        <div>
                          <div className="interview-polish-col-title before">润色前</div>
                          <pre className="interview-polish-pre before">{`${before.title}${before.org ? ` - ${before.org}` : ''}\n${before.period}\n${before.bullets}`.trim()}</pre>
                        </div>
                        <div>
                          <div className="interview-polish-col-title after">润色后</div>
                          <pre className="interview-polish-pre after">{`${after.polishedTitle}${after.polishedOrg ? ` - ${after.polishedOrg}` : ''}\n${after.polishedPeriod}\n${after.polishedBullets}`.trim()}</pre>
                        </div>
                      </div>
                      {after.changeSummary ? (
                        <div className="interview-polish-summary">改动说明：{after.changeSummary}</div>
                      ) : null}
                      {after.jdRelevance === 'none' ? (
                        <div className="interview-polish-summary">与当前 JD 相关性低：仅做表达润色，不提供下一步建议。</div>
                      ) : null}
                      {after.jdImprovements?.length ? (
                        <>
                          <div className="interview-polish-col-title next mt-2">下一步优化建议</div>
                          <ul className="interview-expected-points">
                            {after.jdImprovements.map((tip) => (
                              <li key={tip}>{tip}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
      {showPolishModal ? (
        <div className="comic-modal-backdrop" onClick={() => setShowPolishModal(false)}>
          <div className="comic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="comic-modal-head">
              <div className="comic-subtitle">AI 润色</div>
              <button className="comic-btn" type="button" onClick={() => setShowPolishModal(false)}>
                关闭
              </button>
            </div>
            <label className="comic-label block">
              岗位 JD（可选）
              <textarea
                className="comic-input interview-jd"
                rows={4}
                value={polishJd}
                onChange={(e) => setPolishJd(e.target.value)}
                placeholder="粘贴岗位 JD，提升润色建议针对性"
              />
            </label>
            <div className="interview-polish-list mt-2">
              {polishTargets.length === 0 ? (
                <div className="interview-history-empty">未找到可润色条目（教育经历已排除）</div>
              ) : (
                polishTargets.map((item, idx) => {
                  const key = item.id;
                  return (
                    <label key={key} className="interview-polish-item">
                      <input
                        type="checkbox"
                        checked={selectedPolishKeys.includes(key)}
                        onChange={(e) =>
                          setSelectedPolishKeys((prev) =>
                            e.target.checked ? [...prev, key] : prev.filter((x) => x !== key),
                          )
                        }
                      />
                      <span>
                        [{item.sectionTitle}] {(item.title.trim() || `条目${idx + 1}`) +
                          (item.org.trim() ? ` - ${item.org.trim()}` : '')}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="interview-config-actions">
              <button
                className="comic-btn alt"
                type="button"
                onClick={() => void generatePolishDraft()}
                disabled={polishLoading}
              >
                {polishLoading ? '润色中...' : '开始润色'}
              </button>
            </div>
            {polishError ? <div className="comic-error mt-2">{polishError}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
