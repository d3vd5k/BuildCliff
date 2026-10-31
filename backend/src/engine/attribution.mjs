const BUILD_DEPENDENCIES = /^(?:@(?:babel|swc|rollup|vitejs|angular|next|sveltejs)\/|webpack(?:-|$)|vite$|rollup$|esbuild$|typescript$|ts-loader$|babel-loader$|next$|nuxt$|astro$|sass$|less$|terser$)/i;
const TEST_DEPENDENCIES = /^(?:@(?:playwright|testing-library|vitest|jest)\/|jest(?:-|$)|vitest$|mocha$|chai$|cypress$|playwright$|puppeteer$|nyc$|c8$)/i;
const DEPLOY_DEPENDENCIES = /^(?:@(?:aws-sdk|serverless|pulumi)\/|serverless$|aws-cdk(?:-|$)|firebase-tools$|vercel$|netlify-cli$)/i;

// Installation can be affected by any changed package. Other steps need evidence
// from an explicit tool family rather than assuming all dependencies affect build.
export function dependencyMatchesStep(name, step) {
  if (typeof name !== 'string') return false;
  if (step === 'install') return true;
  if (step === 'build') return BUILD_DEPENDENCIES.test(name);
  if (step === 'test') return TEST_DEPENDENCIES.test(name);
  if (step === 'deploy') return DEPLOY_DEPENDENCIES.test(name);
  return false;
}

function stepRelated(path, step) {
  switch (step) {
    case 'checkout': return /(?:^|\/)(?:\.gitmodules|\.gitattributes|\.lfsconfig)$/.test(path);
    case 'install': return /(?:^|\/)(?:\.npmrc|\.yarnrc(?:\.yml)?|\.pnp\.[^/]+|patches\/[^/]+|scripts\/(?:pre|post)?install[^/]*)$/.test(path);
    case 'build': return /(?:^|\/)(?:src\/|app\/|pages\/|public\/|.*(?:webpack|vite|rollup|babel|next|nuxt|esbuild)\.config\.|tsconfig[^/]*\.json$|scripts\/build)/.test(path);
    case 'test': return /(?:^|\/)(?:tests?\/|__tests__\/|.*\.(?:spec|test)\.|(?:jest|vitest|playwright|cypress)\.config\.|scripts\/test)/.test(path);
    case 'deploy': return /(?:^|\/)(?:deploy\/|infra\/|terraform\/|helm\/|k8s\/|serverless\.|vercel\.json$|netlify\.toml$|scripts\/deploy)/.test(path);
    default: return false;
  }
}

export function rankSuspects(commits, step) {
  const sole = commits.length === 1;
  const suspects = commits.map(commit => {
    const reasons = [];
    const paths = [...new Set(commit.files_changed ?? [])].sort();
    const categories = new Map();
    for (const path of paths) {
      let category;
      // A single path contributes only its strongest category, even when a CI
      // cache config or Docker build file also happens to mention the step.
      if (/(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.(?:lock|toml)|Gemfile(?:\.lock)?|poetry\.lock|Pipfile(?:\.lock)?|pyproject\.toml|requirements[^/]*\.txt|go\.(?:mod|sum)|composer\.(?:json|lock))$/.test(path)) category = ['LOCKFILE_CHANGED', 40];
      else if (/(?:^|\/)(?:Dockerfile(?:\.[^/]+)?|[^/]+\.Dockerfile|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$/.test(path)) category = ['DOCKERFILE_CHANGED', 30];
      else if (/(?:^|\/)\.?cache[-_.]key(?:\.[^/]+)?$/i.test(path)) category = ['CACHE_KEY_CHANGED', 30];
      else if (/^(?:\.github\/workflows\/|\.circleci\/)|(?:^|\/)(?:\.gitlab-ci\.ya?ml|Jenkinsfile|azure-pipelines\.ya?ml|buildkite\.ya?ml)$/.test(path)) category = /cache[\s_-]*(?:key|config|path)|(?:restore|save)[\s_-]*cache/i.test(commit.diff_summary ?? '') ? ['CACHE_KEY_CHANGED', 30] : ['CI_CONFIG_CHANGED', 30];
      else if (stepRelated(path, step)) category = ['STEP_RELATED_FILES', 20];
      if (category) {
        const [code, weight] = category;
        if (!categories.has(code)) categories.set(code, {code, label: `${path} changed`, weight});
      }
    }
    reasons.push(...categories.values());
    const dep_changes = (commit.dep_changes ?? []).map(({name, from, to}) => ({name, from, to}));
    const matching = dep_changes.filter(dep => dependencyMatchesStep(dep.name, step));
    if (matching.length) reasons.push({code: 'DEP_BUMPED', label: `${matching.map(dep => `${dep.name} ${dep.from} -> ${dep.to}`).join('; ')} matches ${step}`, weight: 30});
    if (sole) reasons.push({code: 'SOLE_COMMIT_IN_RANGE', label: 'Only commit between the last good and first slow run', weight: 22});
    if (commit.lines_changed >= 1000) reasons.push({code: 'LARGE_DIFF', label: `${commit.lines_changed} lines changed`, weight: 5});
    return {
      rank: 0,
      sha: commit.sha,
      score: Math.min(100, reasons.reduce((sum, reason) => sum + reason.weight, 0)),
      author: commit.author,
      message: commit.message,
      committed_at: commit.committed_at,
      dep_changes,
      reasons,
    };
  });
  suspects.sort((a, b) => b.score - a.score || (a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0));
  for (let i = 0; i < suspects.length; i++) suspects[i].rank = i + 1;
  return suspects;
}
