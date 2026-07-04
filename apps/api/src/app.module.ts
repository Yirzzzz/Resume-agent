import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InterviewAgentModule } from './interview-agent/interview-agent.module';
import { InterviewSearchModule } from './interview-search/interview-search.module';
import { ResumesController } from './resumes/resumes.controller';
import { ResumesService } from './resumes/resumes.service';
import { TemplatesService } from './resumes/templates.service';

@Module({
  imports: [InterviewSearchModule, InterviewAgentModule],
  controllers: [AppController, ResumesController],
  providers: [AppService, ResumesService, TemplatesService],
})
export class AppModule {}
