import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'resume-agent-api',
      status: 'ok',
      date: new Date().toISOString(),
    };
  }

  getSampleResume() {
    return {
      basics: {
        name: '张三',
        email: 'zhangsan@example.com',
        phone: '13800000000',
        location: '上海',
        summary: '3年前端工程师，熟悉 React/Next.js，负责过中大型 B 端系统。',
      },
      education: [
        {
          school: 'XX大学',
          degree: '本科',
          major: '软件工程',
          startDate: '2018-09',
          endDate: '2022-06',
          highlights: ['GPA 3.8/4.0'],
        },
      ],
      experience: [
        {
          company: '某科技公司',
          role: '前端工程师',
          startDate: '2022-07',
          endDate: '至今',
          highlights: [
            '主导搭建组件库，页面开发效率提升 30%',
            '优化首屏性能，LCP 从 3.2s 降至 1.8s',
          ],
        },
      ],
      projects: [
        {
          name: '简历 Agent 平台',
          description: '支持模板切换、智能一页、PDF 导出与 AI 润色。',
          highlights: ['完成 MVP 并服务首批内测用户'],
          link: 'https://example.com',
        },
      ],
      skills: ['TypeScript', 'React', 'Next.js', 'Node.js'],
    };
  }
}
