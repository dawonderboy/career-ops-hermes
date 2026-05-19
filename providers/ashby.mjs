function slugFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || '';
  } catch {
    return '';
  }
}

function extractAssignedObject(text, prefix) {
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error(`ashby: cannot find ${prefix}`);
  let i = start + prefix.length;
  while (/\s/.test(text[i])) i++;
  if (text[i] !== '{') throw new Error('ashby: expected JSON object');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start + prefix.length, i + 1);
    }
  }
  throw new Error('ashby: unterminated JSON object');
}

function publicJobUrl(entry, job) {
  const slug = slugFromUrl(entry.careers_url || entry.api || '');
  const id = job.jobId || job.id;
  if (!slug || !id) return entry.careers_url || entry.api || '';
  return `https://jobs.ashbyhq.com/${slug}/${id}`;
}

export default {
  id: 'ashby',

  detect(entry) {
    const url = `${entry.api || ''} ${entry.careers_url || ''}`.toLowerCase();
    return url.includes('ashbyhq.com') ? { url: entry.api || entry.careers_url } : null;
  },

  async fetch(entry, ctx) {
    const careersUrl = entry.careers_url || entry.api;
    if (!careersUrl) {
      throw new Error('ashby: missing careers_url');
    }
    const html = await ctx.fetchText(careersUrl);
    const appData = JSON.parse(extractAssignedObject(html, 'window.__appData = '));
    const jobPostings = appData?.jobBoard?.jobPostings || [];

    return jobPostings
      .filter(job => job && job.isListed !== false)
      .map(job => ({
        title: job.title || '',
        company: entry.name || '',
        location: job.locationName || '',
        url: publicJobUrl(entry, job),
        source: 'ashby',
        posted_date: job.publishedDate || job.updatedAt || '',
      }));
  },
};
