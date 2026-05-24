import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot() {
    return {
      service: 'resume-agent-api',
      routes: ['/health', '/resume/sample'],
      status: 'ok',
    };
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('resume/sample')
  getSampleResume() {
    return this.appService.getSampleResume();
  }
}
