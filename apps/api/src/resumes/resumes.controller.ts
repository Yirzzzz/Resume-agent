import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { chromium } from 'playwright';
import { ResumesService } from './resumes.service';
import { TemplatesService } from './templates.service';
import type { ResumeFileConfig } from './resume.types';

@Controller()
export class ResumesController {
  constructor(
    private readonly resumesService: ResumesService,
    private readonly templatesService: TemplatesService,
  ) {}

  // ---- Backward-compatible legacy routes ----
  @Post('resumes')
  create(@Body() body: unknown) {
    return this.resumesService.create(body);
  }

  @Get('resumes')
  findAll() {
    return this.resumesService.findAll();
  }

  @Get('resumes/:id')
  findOne(@Param('id') id: string) {
    return this.resumesService.findOne(id);
  }

  // ---- New multi-file routes ----
  @Get('resume-files')
  listResumeFiles() {
    return this.resumesService.listFiles();
  }

  @Get('resume-files/default')
  getDefaultResumeFile() {
    return this.resumesService.getDefaultFile();
  }

  @Get('resume-files/:id')
  getResumeFile(@Param('id') id: string) {
    return this.resumesService.getFile(id);
  }

  @Post('resume-files')
  createResumeFile(
    @Body()
    body: {
      name?: string;
      resume?: unknown;
      config?: ResumeFileConfig;
    },
  ) {
    return this.resumesService.createFile({
      name: body?.name,
      resume: body?.resume,
      config: body?.config,
    });
  }

  @Put('resume-files/:id')
  updateResumeFile(
    @Param('id') id: string,
    @Body()
    body: {
      resume: unknown;
      config?: ResumeFileConfig;
    },
  ) {
    return this.resumesService.updateFile(id, body.resume, body.config);
  }

  @Patch('resume-files/:id')
  renameResumeFile(
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
    },
  ) {
    return this.resumesService.renameFile(id, body.name);
  }

  @Patch('resume-files/:id/default')
  setDefaultResumeFile(@Param('id') id: string) {
    return this.resumesService.setDefaultFile(id);
  }

  @Delete('resume-files/:id')
  deleteResumeFile(@Param('id') id: string) {
    return this.resumesService.deleteFile(id);
  }

  @Get('templates')
  templates() {
    return this.templatesService.list();
  }

  @Post('export/pdf')
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @Body()
    body: {
      resume: unknown;
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
    },
    @Res() res: Response,
  ) {
    const resume = this.resumesService.ensureValidResume(body.resume);
    const html = this.templatesService.renderHtml(
      resume,
      body.templateId ?? 'modern-cn-001',
      body.layout,
    );

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="resume-preview.pdf"',
    );
    return res.send(pdf);
  }
}
