import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  Resume,
  ResumeBasics,
  ResumeEducation,
  ResumeFileConfig,
  ResumeFileRecord,
  ResumeFileSummary,
  ResumeRecord,
} from './resume.types';

function loadResumeSchema(): object {
  const candidates = [
    join(process.cwd(), 'schemas', 'resume.schema.json'),
    join(process.cwd(), '..', '..', 'schemas', 'resume.schema.json'),
  ];

  const schemaPath = candidates.find((p) => existsSync(p));
  if (!schemaPath) {
    throw new Error(`resume schema not found. tried: ${candidates.join(', ')}`);
  }

  return JSON.parse(readFileSync(schemaPath, 'utf-8')) as object;
}

function resolveStorePath(): string {
  const normalized = process.cwd().replace(/\\/g, '/');
  if (normalized.endsWith('/apps/api')) {
    return join(process.cwd(), '..', '..', 'data', 'resume-files.json');
  }
  return join(process.cwd(), 'data', 'resume-files.json');
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateResume = ajv.compile<Resume>(loadResumeSchema());

type PersistedResumeFiles = {
  version: number;
  files: ResumeFileRecord[];
  sharedProfile?: {
    basics?: ResumeBasics;
    education?: ResumeEducation[];
  };
};

@Injectable()
export class ResumesService {
  private readonly store = new Map<string, ResumeFileRecord>();
  private readonly storePath = resolveStorePath();
  private sharedProfile: {
    basics: ResumeBasics;
    education?: ResumeEducation[];
  } = {
    basics: {
      name: '你的姓名',
      email: 'you@example.com',
      phone: '13800000000',
      location: '上海',
      summary: '在这里写你的个人简介，突出方向与成果。',
    },
    education: undefined,
  };

  constructor() {
    this.hydrate();
  }

  private validate(input: unknown): Resume {
    const isValid = validateResume(input);
    if (!isValid) {
      const msg = (validateResume.errors ?? [])
        .map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`)
        .join('; ');
      throw new BadRequestException(msg || 'Invalid resume payload');
    }
    return input;
  }

  private newId(prefix: 'r' | 'rf' = 'rf'): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private normalizeConfig(
    config: ResumeFileConfig | undefined,
  ): ResumeFileConfig | undefined {
    if (!config) return undefined;
    return {
      templateId: config.templateId,
      layout: config.layout
        ? {
            pageMarginMm: config.layout.pageMarginMm,
            bodyFontSizePt: config.layout.bodyFontSizePt,
            lineHeight: config.layout.lineHeight,
            accentColor: config.layout.accentColor,
            fontFamily: config.layout.fontFamily,
            sectionTitles: config.layout.sectionTitles
              ? { ...config.layout.sectionTitles }
              : undefined,
          }
        : undefined,
    };
  }

  private extractSharedProfile(resume: Resume): {
    basics: ResumeBasics;
    education?: ResumeEducation[];
  } {
    return {
      basics: { ...resume.basics },
      education: Array.isArray(resume.education)
        ? resume.education.map((item) => ({ ...item }))
        : undefined,
    };
  }

  private applySharedProfile(resume: Resume): Resume {
    return {
      ...resume,
      basics: { ...this.sharedProfile.basics },
      education: Array.isArray(this.sharedProfile.education)
        ? this.sharedProfile.education.map((item) => ({ ...item }))
        : undefined,
    };
  }

  private syncAllFilesWithSharedProfile() {
    for (const file of this.store.values()) {
      file.data = this.applySharedProfile(file.data);
    }
  }

  private defaultResume(): Resume {
    return {
      basics: { ...this.sharedProfile.basics },
      education: Array.isArray(this.sharedProfile.education)
        ? this.sharedProfile.education.map((item) => ({ ...item }))
        : undefined,
      customSections: [
        {
          title: '工作/实习经历',
          items: [
            {
              title: '前端工程师',
              org: '某科技公司',
              period: '2022-07 ~ 至今',
              highlights: [
                '负责核心页面重构',
                '首屏性能提升 40%',
                '沉淀组件库规范',
              ],
            },
          ],
        },
        {
          title: '项目经历',
          items: [
            {
              title: '简历 Agent 平台',
              org: '个人项目',
              period: '2026',
              highlights: ['支持模板切换与 PDF 导出', '支持简历润色与模拟面试'],
            },
          ],
        },
        {
          title: '科研/校园经历',
          items: [
            {
              title: '多模态简历评估研究',
              org: '实验室',
              period: '2025',
              highlights: ['建立简历质量评估指标', '完成 A/B 测试分析'],
            },
          ],
        },
      ],
      skills: ['TypeScript', 'React', 'Next.js'],
    };
  }

  private toSummary(file: ResumeFileRecord): ResumeFileSummary {
    return {
      id: file.id,
      name: file.name,
      isDefault: file.isDefault,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  private normalizeDefaultFlag() {
    const files = Array.from(this.store.values());
    if (files.length === 0) return;

    const hasDefault = files.some((f) => f.isDefault);
    if (hasDefault) {
      let picked = false;
      for (const file of files) {
        if (file.isDefault && !picked) {
          picked = true;
        } else if (file.isDefault && picked) {
          file.isDefault = false;
        }
      }
      return;
    }

    files[0].isDefault = true;
  }

  private persist() {
    const folder = dirname(this.storePath);
    mkdirSync(folder, { recursive: true });

    const payload: PersistedResumeFiles = {
      version: 2,
      files: Array.from(this.store.values()),
      sharedProfile: {
        basics: { ...this.sharedProfile.basics },
        education: Array.isArray(this.sharedProfile.education)
          ? this.sharedProfile.education.map((item) => ({ ...item }))
          : undefined,
      },
    };

    writeFileSync(this.storePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private hydrate() {
    let restoredShared: {
      basics: ResumeBasics;
      education?: ResumeEducation[];
    } | null = null;

    if (existsSync(this.storePath)) {
      try {
        const raw = JSON.parse(
          readFileSync(this.storePath, 'utf-8'),
        ) as Partial<PersistedResumeFiles>;

        if (raw.sharedProfile?.basics) {
          const validatedShared = this.validate({
            basics: raw.sharedProfile.basics,
            education: raw.sharedProfile.education,
          });
          restoredShared = this.extractSharedProfile(validatedShared);
        }

        for (const item of raw.files ?? []) {
          const data = this.validate(item.data);
          this.store.set(item.id, {
            id: item.id,
            name: item.name || `简历 ${item.id.slice(-4)}`,
            isDefault: Boolean(item.isDefault),
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString(),
            data,
            config: this.normalizeConfig(item.config),
          });
        }
      } catch {
        // Corrupted store fallback: keep empty and recreate below.
      }
    }

    if (!restoredShared && this.store.size > 0) {
      const seed = this.store.values().next().value as ResumeFileRecord;
      restoredShared = this.extractSharedProfile(seed.data);
    }

    if (restoredShared) {
      this.sharedProfile = restoredShared;
    }

    if (this.store.size === 0) {
      const now = new Date().toISOString();
      const id = this.newId();
      this.store.set(id, {
        id,
        name: '默认简历',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        data: this.defaultResume(),
      });
    }

    this.syncAllFilesWithSharedProfile();
    this.normalizeDefaultFlag();
    this.persist();
  }

  ensureValidResume(input: unknown): Resume {
    return this.validate(input);
  }

  // ---- New multi-file APIs ----
  listFiles(): ResumeFileSummary[] {
    return Array.from(this.store.values())
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .map((f) => this.toSummary(f));
  }

  getFile(id: string): ResumeFileRecord {
    const found = this.store.get(id);
    if (!found) {
      throw new NotFoundException(`Resume file ${id} not found`);
    }
    return found;
  }

  getDefaultFile(): ResumeFileRecord {
    const found = Array.from(this.store.values()).find((f) => f.isDefault);
    if (!found) {
      throw new NotFoundException('Default resume file not found');
    }
    return found;
  }

  createFile(payload?: {
    name?: string;
    resume?: unknown;
    config?: ResumeFileConfig;
  }): ResumeFileRecord {
    const now = new Date().toISOString();
    const id = this.newId();
    const name = payload?.name?.trim() || `简历 ${this.store.size + 1}`;
    const incoming = payload?.resume
      ? this.validate(payload.resume)
      : this.defaultResume();
    if (payload?.resume) {
      this.sharedProfile = this.extractSharedProfile(incoming);
      this.syncAllFilesWithSharedProfile();
    }
    const data = this.applySharedProfile(incoming);
    const isDefault = this.store.size === 0;

    const record: ResumeFileRecord = {
      id,
      name,
      isDefault,
      createdAt: now,
      updatedAt: now,
      data,
      config: this.normalizeConfig(payload?.config),
    };

    this.store.set(id, record);
    this.normalizeDefaultFlag();
    this.persist();
    return record;
  }

  updateFile(
    id: string,
    resume: unknown,
    config?: ResumeFileConfig,
  ): ResumeFileRecord {
    const found = this.getFile(id);
    const data = this.validate(resume);
    this.sharedProfile = this.extractSharedProfile(data);

    for (const file of this.store.values()) {
      file.data = this.applySharedProfile(file.data);
    }

    const normalized = this.applySharedProfile(data);
    const updated: ResumeFileRecord = {
      ...found,
      data: normalized,
      config: this.normalizeConfig(config) ?? found.config,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    this.persist();
    return updated;
  }

  renameFile(id: string, name: string): ResumeFileRecord {
    const nextName = name.trim();
    if (!nextName) {
      throw new BadRequestException('name is required');
    }
    const found = this.getFile(id);
    const updated: ResumeFileRecord = {
      ...found,
      name: nextName,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    this.persist();
    return updated;
  }

  setDefaultFile(id: string): ResumeFileRecord {
    const target = this.getFile(id);
    for (const file of this.store.values()) {
      file.isDefault = file.id === id;
    }
    target.updatedAt = new Date().toISOString();
    this.persist();
    return target;
  }

  deleteFile(id: string): { deletedId: string; nextDefaultId: string | null } {
    if (!this.store.has(id)) {
      throw new NotFoundException(`Resume file ${id} not found`);
    }

    const removed = this.store.get(id) as ResumeFileRecord;
    this.store.delete(id);

    if (this.store.size === 0) {
      const now = new Date().toISOString();
      const newId = this.newId();
      this.store.set(newId, {
        id: newId,
        name: '默认简历',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        data: this.defaultResume(),
      });
    } else if (removed.isDefault) {
      const newest = Array.from(this.store.values()).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      )[0];
      for (const file of this.store.values()) {
        file.isDefault = file.id === newest.id;
      }
    }

    this.normalizeDefaultFlag();
    this.persist();

    return {
      deletedId: id,
      nextDefaultId: this.getDefaultFile().id,
    };
  }

  // ---- Backward compatible APIs ----
  create(input: unknown): ResumeRecord {
    const file = this.createFile({ resume: input });
    return {
      id: file.id,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      data: file.data,
    };
  }

  findAll(): ResumeRecord[] {
    return Array.from(this.store.values()).map((file) => ({
      id: file.id,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      data: file.data,
    }));
  }

  findOne(id: string): ResumeRecord {
    const file = this.getFile(id);
    return {
      id: file.id,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      data: file.data,
    };
  }
}
