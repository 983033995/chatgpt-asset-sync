interface GitHubContentResponse {
  sha?: string;
  html_url?: string;
  content?: string;
  encoding?: string;
}

export class GitHubClient {
  constructor(private readonly token: string) {
    if (!token) throw new Error("GITHUB_TOKEN is required for GitHub write operations.");
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status}: ${body}`);
    }
    return (await response.json()) as T;
  }

  async getContent(repository: string, path: string, branch: string): Promise<GitHubContentResponse | null> {
    const [owner, repo] = repository.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
    return (await response.json()) as GitHubContentResponse;
  }

  async putFile(input: {
    repository: string;
    branch: string;
    path: string;
    contentBase64: string;
    message: string;
    sha?: string;
  }): Promise<GitHubContentResponse> {
    const [owner, repo] = input.repository.split("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(input.path)}`;
    return this.request<GitHubContentResponse>(url, {
      method: "PUT",
      body: JSON.stringify({
        message: input.message,
        content: input.contentBase64,
        branch: input.branch,
        ...(input.sha ? { sha: input.sha } : {}),
      }),
    });
  }
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
