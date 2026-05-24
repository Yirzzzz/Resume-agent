import { WorkspaceTabs } from '@/components/workspace-tabs';

type Template = {
  id: string;
  name: string;
  description: string;
};

async function getTemplates(baseUrl: string): Promise<Template[]> {
  try {
    const res = await fetch(`${baseUrl}/templates`, { cache: 'no-store' });
    if (!res.ok) return [];
    return (await res.json()) as Template[];
  } catch {
    return [];
  }
}

export default async function Home() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
  const templates = await getTemplates(baseUrl);

  return (
    <main className="min-h-screen w-full p-3 lg:p-4">
      <div className="mb-4 comic-hero-wall">
        <div className="comic-hero-panel">
          <h1 className="comic-hero-main">Resume Agent</h1>
        </div>
      </div>
      <WorkspaceTabs apiBaseUrl={baseUrl} templates={templates} />
    </main>
  );
}
