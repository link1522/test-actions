const fs = require('fs');

const ALLOWED_CATEGORIES = new Set([
  'Art',
  'Culture',
  'Economy',
  'Food',
  'Geography',
  'History',
  'Lifestyle',
  'Music',
  'Nature',
  'People',
  'Society',
  'Technology',
]);

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function setOutput(name, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
}

function fail(message) {
  throw new Error(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(bodyText, label, nextLabels = []) {
  const normalized = bodyText.replace(/\r\n/g, '\n');
  const nextSectionPattern = nextLabels.length
    ? `(?=\\n###\\s*(?:${nextLabels.map(escapeRegExp).join('|')})\\s*\\n|$)`
    : '(?=$)';
  const pattern = new RegExp(
    `###\\s*${escapeRegExp(label)}\\s*\\n([\\s\\S]*?)${nextSectionPattern}`
  );
  const match = normalized.match(pattern);
  return match ? match[1].trim() : '';
}

function extractFrontmatterTitle(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return '';
  }

  const titleMatch = frontmatterMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
  return titleMatch ? titleMatch[1].trim() : '';
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeCategory(rawCategory) {
  const cleaned = unquote(rawCategory || '').replace(/\s*\(.*?\)\s*$/, '').trim();
  return ALLOWED_CATEGORIES.has(cleaned) ? cleaned : '';
}

function parseTagsValue(rawValue) {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  const stripQuotes = (item) => unquote(item).trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      return [];
    }

    return inner
      .split(',')
      .map((item) => stripQuotes(item))
      .filter(Boolean);
  }

  return unquote(trimmed)
    .split(',')
    .map((item) => stripQuotes(item))
    .filter(Boolean);
}

function formatFrontmatterValue(key, value) {
  if (key === 'tags') {
    return JSON.stringify(value);
  }

  if (key === 'featured') {
    return value ? 'true' : 'false';
  }

  if (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value);
  }

  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value))) {
    return String(value);
  }

  if (value === 'true' || value === 'false') {
    return value;
  }

  return JSON.stringify(value);
}

function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    return null;
  }

  const rawFrontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2] || '';
  const lines = rawFrontmatter.split('\n');
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!keyMatch) {
      fail(`frontmatter 格式無法解析：${line}`);
    }

    const key = keyMatch[1];
    let value = keyMatch[2];

    if (value === '' && key === 'tags') {
      const tagLines = [];
      let nextIndex = index + 1;
      while (nextIndex < lines.length) {
        const listMatch = lines[nextIndex].match(/^\s*-\s*(.+)\s*$/);
        if (!listMatch) {
          break;
        }
        tagLines.push(listMatch[1]);
        nextIndex += 1;
      }
      value = `[${tagLines.join(', ')}]`;
      index = nextIndex - 1;
    }

    entries.push({ key, value });
  }

  return { entries, body };
}

function normalizeArticleContent(content, fallbackCategory, today = getTodayDate()) {
  const parsed = parseFrontmatter(content);
  if (!parsed) {
    fail('文章內容必須以 frontmatter 開頭，且至少包含 title 與 description');
  }

  const entryMap = new Map(parsed.entries.map((entry) => [entry.key, entry.value]));
  const title = unquote(entryMap.get('title') || '');
  const description = unquote(entryMap.get('description') || '');

  if (!title) {
    fail('frontmatter 缺少必要欄位：title');
  }

  if (!description) {
    fail('frontmatter 缺少必要欄位：description');
  }

  const normalizedCategory =
    normalizeCategory(entryMap.get('category') || '') ||
    normalizeCategory(fallbackCategory || '');

  if (!normalizedCategory) {
    fail(
      `category 必須是以下其中一種：${Array.from(ALLOWED_CATEGORIES).join(', ')}`
    );
  }

  const tags = parseTagsValue(entryMap.get('tags'));
  const featuredValue =
    entryMap.has('featured') || entryMap.has('feature') ? false : false;

  const normalizedEntries = [
    ['title', title],
    ['description', description],
    ['author', unquote(entryMap.get('author') || '') || 'Taiwan.md Contributors'],
    ['date', unquote(entryMap.get('date') || '') || today],
  ];

  if (tags !== null) {
    normalizedEntries.push(['tags', tags]);
  }

  normalizedEntries.push(['category', normalizedCategory]);
  normalizedEntries.push(['featured', featuredValue]);

  const consumedKeys = new Set([
    'title',
    'description',
    'author',
    'date',
    'tags',
    'category',
    'featured',
    'feature',
  ]);

  for (const entry of parsed.entries) {
    if (consumedKeys.has(entry.key)) {
      continue;
    }
    normalizedEntries.push([entry.key, entry.value.trim()]);
  }

  const frontmatter = normalizedEntries
    .map(([key, value]) => `${key}: ${formatFrontmatterValue(key, value)}`)
    .join('\n');

  const normalizedBody = parsed.body.replace(/^\n+/, '');
  return {
    content: `---\n${frontmatter}\n---\n\n${normalizedBody}`,
    articleTitle: title,
    category: normalizedCategory,
  };
}

function main() {
  try {
    const issuePath = process.env.GITHUB_EVENT_PATH;
    if (!issuePath) {
      fail('找不到 GITHUB_EVENT_PATH');
    }

    const event = JSON.parse(fs.readFileSync(issuePath, 'utf8'));
    const issue = event.issue;

    if (!issue) {
      fail('找不到 issue payload');
    }

    const body = issue.body || '';
    const rawContent = extractSection(body, '文章內容 / Article Content', [
      '參考資料 / Sources',
    ]);

    if (!rawContent) {
      fail('找不到「文章內容 / Article Content」欄位');
    }

    if (!rawContent || rawContent === '_No response_') {
      fail('「文章內容 / Article Content」欄位是空的');
    }

    const categoryRaw =
      extractSection(body, '分類 / Category', ['文章內容 / Article Content']) ||
      'uncategorized';
    const category = normalizeCategory(categoryRaw);

    if (!category) {
      fail(`無效的分類：${categoryRaw}`);
    }

    const normalizedArticle = normalizeArticleContent(rawContent, category);
    const content = normalizedArticle.content;
    const articleTitle = normalizedArticle.articleTitle;

    const slugBase = (issue.title || `article-${issue.number}`)
      .replace(/^\[Article\]\s*/i, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const slug = slugBase || `article-${issue.number}`;
    const dir = `knowledge/${normalizedArticle.category.toLowerCase()}`;
    const filename = `${slug}.md`;
    const filepath = `${dir}/${filename}`;
    const branch = `content/issue-${issue.number}-${slug}`;

    setOutput('content', content);
    setOutput('article_title', articleTitle);
    setOutput('category', normalizedArticle.category);
    setOutput('dir', dir);
    setOutput('filename', filename);
    setOutput('filepath', filepath);
    setOutput('branch', branch);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  ALLOWED_CATEGORIES,
  extractSection,
  extractFrontmatterTitle,
  normalizeArticleContent,
  normalizeCategory,
  parseTagsValue,
};

if (require.main === module) {
  main();
}
