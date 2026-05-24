import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ResumesController } from './resumes/resumes.controller';
import { ResumesService } from './resumes/resumes.service';
import { TemplatesService } from './resumes/templates.service';

@Module({
  imports: [],
  controllers: [AppController, ResumesController],
  providers: [AppService, ResumesService, TemplatesService],
})
export class AppModule {}
