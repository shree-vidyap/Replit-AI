import type { FileMap } from "./files";

// GitHub integration: commits project files through the Git data REST API.
async function gh(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${data?.message ?? "request failed"}`);
  return data;
}

export async function pushToGithub(token: string, repo: string, files: FileMap, message: string, branch?: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Repository must look like owner/name");
  let info: any;
  try {
    info = await gh(token, `/repos/${repo}`);
  } catch (e: any) {
    if (!String(e.message).includes("404")) throw e;
    info = await gh(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({ name: repo.split("/")[1], private: true, auto_init: true }),
    });
  }
  const br = branch || info.default_branch || "main";
  const ref = await gh(token, `/repos/${repo}/git/ref/heads/${br}`);
  const parentSha: string = ref.object.sha;

  const entries = Object.entries(files);
  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (let i = 0; i < entries.length; i += 10) {
    const chunk = await Promise.all(
      entries.slice(i, i + 10).map(async ([path, content]) => {
        const blob = await gh(token, `/repos/${repo}/git/blobs`, {
          method: "POST",
          body: JSON.stringify({ content, encoding: "utf-8" }),
        });
        return { path, mode: "100644", type: "blob", sha: blob.sha as string };
      })
    );
    tree.push(...chunk);
  }
  const newTree = await gh(token, `/repos/${repo}/git/trees`, { method: "POST", body: JSON.stringify({ tree }) });
  const commit = await gh(token, `/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] }),
  });
  await gh(token, `/repos/${repo}/git/refs/heads/${br}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });
  return { url: `https://github.com/${repo}/commit/${commit.sha}`, branch: br };
}
