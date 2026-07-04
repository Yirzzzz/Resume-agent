import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { AnswerDto } from './dto/answer.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { InterviewAgentService } from './interview-agent.service';
import type {
  AnswerResponse,
  InterviewReport,
  LongTermMemoryEntry,
} from './types/interview-agent.types';

@Controller('api/interview-agent')
export class InterviewAgentController {
  constructor(private readonly service: InterviewAgentService) {}

  @Post('sessions')
  createSession(@Body() body: CreateSessionDto): SessionResponseDto {
    return this.service.createSession(body);
  }

  @Post('sessions/:id/prepare')
  prepare(@Param('id') id: string): Promise<SessionResponseDto> {
    return this.service.prepare(id);
  }

  @Post('sessions/:id/start')
  start(@Param('id') id: string): Promise<AnswerResponse> {
    return this.service.start(id);
  }

  @Post('sessions/:id/answer')
  answer(
    @Param('id') id: string,
    @Body() body: AnswerDto,
  ): Promise<AnswerResponse> {
    return this.service.answer(id, body);
  }

  @Post('sessions/:id/end')
  end(@Param('id') id: string): Promise<AnswerResponse> {
    return this.service.end(id);
  }

  @Get('sessions/:id/report')
  report(@Param('id') id: string): Promise<InterviewReport> {
    return this.service.getReport(id);
  }

  @Get('memory')
  memory(@Query('resumeFileId') resumeFileId?: string): LongTermMemoryEntry[] {
    return this.service.listLongTermMemory(resumeFileId);
  }

  @Delete('memory/:entryId')
  deleteMemory(@Param('entryId') entryId: string): { deletedId: string } {
    return this.service.deleteLongTermMemory(entryId);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string): SessionResponseDto {
    return this.service.getSession(id);
  }
}
