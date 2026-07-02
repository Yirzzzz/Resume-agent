import { TemplatesService } from './templates.service';
import { Resume } from './resume.types';

describe('TemplatesService', () => {
  let service: TemplatesService;

  beforeEach(() => {
    service = new TemplatesService();
  });

  it('uses compact spacing classes for multi-entry education blocks', () => {
    const resume: Resume = {
      basics: {
        name: '测试用户',
        email: 'test@example.com',
      },
      education: [
        {
          school: '华侨大学',
          degree: '硕士',
          major: '软件工程',
          college: '计算机科学与技术学院',
          startDate: '2024.9',
          endDate: '2027.6',
          highlights: [
            '*【主修课程】模式识别、数字图像处理、机器学习、矩阵理论',
            '*【奖项/证书】Mathorcup 研究生组国家级一等奖；华为杯国家级二等奖；学业二等奖学金',
          ],
        },
        {
          school: '佛山大学',
          degree: '本科',
          major: '数学与应用数学',
          college: '数学与大数据学院',
          gpa: '3.58(2/60)',
          startDate: '2020.9',
          endDate: '2024.6',
          highlights: [
            '【主修课程】深度学习、机器学习、语音信号与处理、图像处理、计算机视觉、人工智能、算法设计',
            '【奖项/证书】国家奖学金；Mathorcup数学建模挑战赛一等奖；蓝桥杯python组国家级三等',
          ],
        },
      ],
      projects: [
        {
          name: '项目经历标题',
          description: '项目组织',
          highlights: ['项目要点'],
        },
      ],
      customSections: [
        {
          title: '项目经历',
          items: [
            {
              title: 'Markdown 项目',
              org: '项目组织',
              period: '2025.1 - 2025.6',
              highlights: ['- 支持无序列表', '- 支持**加粗**内容'],
            },
            {
              title: '第二个项目',
              org: '项目组织',
              period: '2025.7 - 2025.9',
              highlights: ['项目第二条'],
            },
          ],
        },
        {
          title: '实习经历',
          items: [
            {
              title: '前端实习生',
              org: '测试公司',
              period: '2024.1 - 2024.6',
              highlights: ['1. 支持有序列表', '2. 支持第二项'],
            },
            {
              title: '后端实习生',
              org: '测试公司',
              period: '2024.7 - 2024.9',
              highlights: ['实习第二条'],
            },
          ],
        },
        {
          title: '科研成果',
          items: [
            {
              title: '论文成果',
              org: '实验室',
              period: '2025.9 - 2026.1',
              highlights: ['负责数据集构建', '完成实验分析'],
            },
            {
              title: '竞赛成果',
              org: '团队',
              period: '2026.2 - 2026.4',
              highlights: ['完成方案设计'],
            },
          ],
        },
        {
          title: '其他模块',
          items: [
            {
              title: '自定义条目一',
              org: '组织',
              period: '2026.5',
              highlights: ['自定义内容一'],
            },
            {
              title: '自定义条目二',
              org: '组织',
              period: '2026.6',
              highlights: ['自定义内容二'],
            },
          ],
        },
        {
          title: '科研项目',
          items: [
            {
              title: '',
              org: '',
              period: '2026.7',
              highlights: ['不应自动显示项目经历'],
            },
          ],
        },
      ],
      skills: ['Python', 'TypeScript'],
    };

    const html = service.renderHtml(resume, 'modern-cn-001');

    expect(html).toContain('h2{margin:5px 0 6px;');
    expect(html).toContain('.header{margin-bottom:5px}');
    expect(html).toContain('.section-content{padding-left:');
    expect(html).toContain('<h2>教育经历</h2><div class="section-content">');
    expect(html).toContain('<h2>项目经历</h2><div class="section-content">');
    expect(html).toContain('<h2>科研成果</h2><div class="section-content">');
    expect(html).toContain('<h2>其他模块</h2><div class="section-content">');
    expect(html).toContain('<h2>科研项目</h2><div class="section-content">');
    expect(html).toContain(
      '<h2>Skills</h2><div class="section-content">Python · TypeScript</div>',
    );
    expect(html).toContain('.line-block{margin-top:2px}');
    expect(html).toContain('ul,ol{margin:6px 0 0 13px;padding-left:10px}');
    expect(html).toContain('.line-list{margin:1px 0 0 13px;padding-left:10px}');
    expect(html).toContain(
      '<ul class="edu-detail"><li>【主修课程】模式识别、数字图像处理、机器学习、矩阵理论</li><li>【奖项/证书】Mathorcup 研究生组国家级一等奖；华为杯国家级二等奖；学业二等奖学金</li></ul>',
    );
    expect(html).toContain('.compact-block{margin-bottom:4px}');
    expect(html).toContain('.compact-block:last-child{margin-bottom:0}');
    expect(html.match(/class="block compact-block"/g)).toHaveLength(9);
    expect(html).not.toContain(
      '<div class="head"><span class="proj-name">项目经历</span></div>',
    );
    expect(html).toContain('.line-list:first-child{margin-top:0}');
    expect(html).toContain('.line-block .line-item:first-child{margin-top:0}');
    expect(html).toContain(
      '<div class="line-block"><div class="line-item">负责数据集构建</div><div class="line-item">完成实验分析</div></div>',
    );
    expect(html).toContain(
      '<div class="line-block"><ul class="line-list"><li>支持无序列表</li><li>支持<strong>加粗</strong>内容</li></ul></div>',
    );
    expect(html).toContain(
      '<div class="line-block"><ol class="line-list"><li>支持有序列表</li><li>支持第二项</li></ol></div>',
    );
    expect(html).toContain('.edu-block{margin-bottom:');
    expect(html).toContain('ul.edu-detail,ol.edu-detail{margin-top:');
    expect(html.match(/class="block edu-block"/g)).toHaveLength(2);
    expect(html.match(/class="edu-detail"/g)).toHaveLength(2);
    expect(html).toContain('华侨大学');
    expect(html).toContain('佛山大学');
  });

  it('renders a centered compact header with at most three info rows', () => {
    const resume: Resume = {
      basics: {
        name: '翁宗标',
        email: 'yirongzzz@163.com',
        phone: '13729297970',
        location: '厦门',
        photo: 'data:image/png;base64,abc',
        extraInfos: [
          { label: '求职状态', value: '随时到岗-实习时长六个月以上' },
          { label: 'Github', value: 'https://github.com/Yirzzzz' },
          { label: '意向岗位', value: 'AI 应用算法工程师' },
          { label: '研究方向', value: '人脸伪造检测； VLA' },
          { label: '更多', value: '不应进入居中头部第四行' },
        ],
      },
      education: [
        {
          school: '华侨大学',
          degree: '硕士',
          startDate: '2024.9',
          endDate: '2027.6',
        },
      ],
    };

    const html = service.renderHtml(resume, 'modern-cn-001', {
      headerStyle: 'centered',
    });

    expect(html).toContain('.header{margin-bottom:4px}');
    expect(html).toContain('.header-centered{text-align:center}');
    expect(html).toContain(
      '.header-centered-layout{display:grid;grid-template-columns:76px minmax(0,1fr) 76px;',
    );
    expect(html).toContain('.header-centered .avatar{width:60px;height:80px}');
    expect(html).toContain(
      '<div class="header header-centered"><div class="header-centered-layout"><div class="header-slot"></div><div class="header-centered-info"><h1>翁宗标</h1>',
    );
    expect(html).toContain(
      '<div class="avatar-wrap"><img class="avatar" src="data:image/png;base64,abc" alt="profile photo" /></div>',
    );
    expect(html.match(/class="meta meta-line"/g)).toHaveLength(3);
    expect(html).toContain('📧');
    expect(html).toContain('yirongzzz@163.com');
    expect(html).toContain('求职状态：随时到岗-实习时长六个月以上');
    expect(html).toContain('Github：https://github.com/Yirzzzz');
    expect(html).toContain('意向岗位：AI 应用算法工程师');
    expect(html).toContain('研究方向：人脸伪造检测； VLA');
    expect(html).not.toContain('不应进入居中头部第四行');
    expect(html).not.toContain('<div class="header"><div class="header-main">');
  });
});
